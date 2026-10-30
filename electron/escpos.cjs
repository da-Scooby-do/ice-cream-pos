// الطباعة المباشرة لطابعات الفواتير | direct ESC/POS printing.
//
// Most 80 mm receipt printers (Rongta, Xprinter, Epson TM…) speak ESC/POS.
// Instead of relying on the printer's Windows driver — which may be missing,
// or the wrong one — the slip is drawn here as a picture exactly 576 dots
// wide (72 mm at 203 dpi), turned into ESC/POS raster commands with a paper
// cut at the end, and sent to the printer untouched ("RAW"). On Windows this
// works with the built-in "Generic / Text Only" driver; Arabic text and the
// logo print fine because the printer only ever receives a picture.
const { BrowserWindow } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DOTS = 576; // printable width of an 80 mm printer at 203 dpi
const CSS_PX_72MM = (72 / 25.4) * 96; // the slip is 72 mm wide in CSS
const ZOOM = DOTS / CSS_PX_72MM;

/**
 * ارسم القسيمة صورةً | draw the slip as a bitmap, DOTS wide.
 * Uses our own /print-frame page so the app's fonts and styles apply.
 */
async function renderSlip(baseUrl, html) {
  const w = new BrowserWindow({
    show: false,
    width: DOTS,
    height: 800,
    useContentSize: true,
    // own in-memory session: Chromium shares zoom between every window of the
    // same address, so without this the cashier's screen got zoomed in too
    webPreferences: { offscreen: true, zoomFactor: ZOOM, backgroundThrottling: false, partition: "jac-print-render" },
  });
  try {
    await w.loadURL(`${baseUrl}/print-frame`);
    w.webContents.setZoomFactor(ZOOM);
    const cssHeight = await w.webContents.executeJavaScript(`(async () => {
      const f = document.getElementById("frame");
      f.innerHTML = ${JSON.stringify(html)};
      await document.fonts.ready;
      await Promise.all([...f.querySelectorAll("img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.ceil(f.getBoundingClientRect().height);
    })()`);
    const height = Math.max(40, Math.ceil(cssHeight * ZOOM));
    w.setContentSize(DOTS, height);
    await new Promise((r) => setTimeout(r, 250));
    // wait until a frame of the full size has really been painted
    let img = null;
    for (let i = 0; i < 10; i++) {
      img = await w.webContents.capturePage({ x: 0, y: 0, width: DOTS, height });
      const s = img.getSize();
      if (s.width > 0 && s.height > 0 && inkOf(img.toBitmap()) > 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const size = img.getSize();
    const bitmap = img.toBitmap();
    return { bitmap, width: size.width, height: size.height, png: img.toPNG(), ink: inkOf(bitmap) };
  } finally {
    w.destroy();
  }
}

/** عدد النقاط الداكنة | how many dark pixels (an empty picture has none) */
function inkOf(bitmap) {
  let n = 0;
  for (let i = 0; i < bitmap.length; i += 4) if (bitmap[i + 3] > 0 && bitmap[i] + bitmap[i + 1] + bitmap[i + 2] < 384) n++;
  return n;
}

/**
 * صورة BGRA ← أوامر ESC/POS | BGRA bitmap → ESC/POS bytes.
 * raster "gsv0": GS v 0 raster image (most printers);
 * raster "escstar": ESC * 24-dot bit image — older/cheaper printers that ignore GS v 0.
 */
function toEscPos({ bitmap, width, height }, { cut = true, kick = false, raster: mode = "gsv0" } = {}) {
  const bytesPerRow = Math.ceil(DOTS / 8);
  const scale = width / DOTS; // capture may come back at device pixel ratio
  const rows = Math.floor(height / scale);
  const raster = Buffer.alloc(bytesPerRow * rows);
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(height - 1, Math.floor(y * scale));
    for (let x = 0; x < DOTS; x++) {
      const sx = Math.min(width - 1, Math.floor(x * scale));
      const i = (sy * width + sx) * 4;
      const lum = bitmap[i + 3] === 0 ? 255 : 0.114 * bitmap[i] + 0.587 * bitmap[i + 1] + 0.299 * bitmap[i + 2]; // B G R (transparent = paper)
      if (lum < 170) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  // trim blank rows at the bottom (the cut adds its own margin)
  let last = rows - 1;
  while (last > 0 && raster.subarray(last * bytesPerRow, (last + 1) * bytesPerRow).every((b) => b === 0)) last--;
  const used = last + 1;

  const parts = [Buffer.from([0x1b, 0x40])]; // ESC @ — reset
  if (kick) parts.push(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])); // ESC p — open the cash drawer
  const dot = (x, y) => y < used && (raster[y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  if (mode === "escstar") {
    // ESC * 33: bands 24 dots tall, 3 bytes per column, line spacing = 24 dots
    parts.push(Buffer.from([0x1b, 0x33, 24])); // ESC 3 24
    for (let y = 0; y < used; y += 24) {
      const band = Buffer.alloc(DOTS * 3);
      for (let x = 0; x < DOTS; x++) {
        for (let k = 0; k < 24; k++) if (dot(x, y + k)) band[x * 3 + (k >> 3)] |= 0x80 >> (k & 7);
      }
      parts.push(Buffer.from([0x1b, 0x2a, 33, DOTS & 0xff, DOTS >> 8]), band, Buffer.from([0x0a]));
    }
    parts.push(Buffer.from([0x1b, 0x32])); // ESC 2 — default line spacing
  } else {
    const CHUNK = 128; // rows per raster command: small enough for any printer buffer
    for (let y = 0; y < used; y += CHUNK) {
      const h = Math.min(CHUNK, used - y);
      parts.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8])); // GS v 0
      parts.push(raster.subarray(y * bytesPerRow, (y + h) * bytesPerRow));
    }
  }
  parts.push(Buffer.from([0x1b, 0x64, 0x04])); // ESC d 4 — feed past the cutter
  if (cut) parts.push(Buffer.from([0x1d, 0x56, 0x42, 0x10])); // GS V B — feed and partial cut
  return Buffer.concat(parts);
}

// --- الإرسال للطابعة كما هو | send bytes to a printer unchanged (RAW) ------------

const WIN_RAW = `
using System;
using System.Runtime.InteropServices;
public static class JacRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinterW(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinterW(IntPtr h, int level, [In] DOCINFOW di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static int Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinterW(printer, out h, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "JAC ICE"; di.pDatatype = "RAW";
      if (StartDocPrinterW(h, 1, di) == 0) return Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return Marshal.GetLastWin32Error();
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        int err = Marshal.GetLastWin32Error();
        EndPagePrinter(h);
        if (!ok) return err == 0 ? -1 : err;
        if (written != data.Length) return -2;
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return 0;
  }
}`;

function powershell(script, env, timeoutMs = 30_000) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { env: { ...process.env, ...env }, timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || "").trim(), err: String(stderr || err?.message || "").trim() })
    );
  });
}

/** أرسل البايتات كما هي | send bytes to the printer queue as RAW */
async function sendRaw(printer, bytes, workDir) {
  const file = path.join(os.tmpdir(), `jac-ice-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(file, bytes);
  try {
    if (process.platform === "win32") {
      // compiled once into a tiny DLL so later prints start fast
      const dll = path.join(workDir, "jac-rawprint-v1.dll");
      const r = await powershell(
        `$ErrorActionPreference = 'Stop'
$src = @'
${WIN_RAW}
'@
if (-not (Test-Path $env:JAC_DLL)) { Add-Type -TypeDefinition $src -OutputAssembly $env:JAC_DLL -OutputType Library }
Add-Type -Path $env:JAC_DLL
$code = [JacRawPrint]::Send($env:JAC_PRINTER, [IO.File]::ReadAllBytes($env:JAC_FILE))
if ($code -ne 0) { Write-Output "ERR $code"; exit 1 }
Write-Output "OK"`,
        { JAC_DLL: dll, JAC_PRINTER: printer, JAC_FILE: file }
      );
      if (r.ok && r.out.endsWith("OK")) return { ok: true };
      const code = /ERR (-?\d+)/.exec(r.out)?.[1];
      const why =
        code === "1801" ? "اسم الطابعة غير صحيح" :
        code === "1804" ? "تعريف هذه الطابعة لا يقبل الطباعة المباشرة" :
        code === "5" ? "لا توجد صلاحية للطابعة" :
        code ? `رمز الخطأ ${code}` : r.err.split("\n")[0] || "تعذر الإرسال";
      return { ok: false, error: why };
    }
    // Linux / macOS: CUPS raw queue
    const r = await new Promise((resolve) =>
      execFile("lp", ["-d", printer, "-o", "raw", file], { timeout: 30_000 }, (err, out, se) =>
        resolve({ ok: !err, err: String(se || err?.message || "") })
      )
    );
    return r.ok ? { ok: true } : { ok: false, error: r.err.split("\n")[0] || "تعذر الإرسال" };
  } finally {
    setTimeout(() => fs.rmSync(file, { force: true }), 60_000);
  }
}

/**
 * إعداد طابعة الفواتير بدون تعريف (ويندوز) | add a "JAC ICE Receipt" printer
 * on the receipt printer's USB port with Windows' built-in Generic / Text
 * Only driver — nothing to download.
 */
async function setupGenericPrinter(name, receiptPattern) {
  if (process.platform !== "win32") return { ok: false, error: "متاح على ويندوز فقط" };
  const r = await powershell(
    `$ErrorActionPreference = 'Stop'
$name = $env:JAC_NAME
$pattern = $env:JAC_PATTERN
$usb = @(Get-PrinterPort | Where-Object { $_.Name -match '^USB\\d+' } | Sort-Object Name)
if ($usb.Count -eq 0) { Write-Output 'NOPORT'; exit 2 }
# prefer the USB port a receipt printer already uses, else the newest one
$hint = Get-Printer | Where-Object { $_.PortName -match '^USB\\d+' -and $_.Name -match $pattern } | Select-Object -First 1
$port = if ($hint) { $hint.PortName } else { $usb[-1].Name }
if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) { Add-PrinterDriver -Name 'Generic / Text Only' }
if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { Set-Printer -Name $name -PortName $port }
else { Add-Printer -Name $name -DriverName 'Generic / Text Only' -PortName $port }
Write-Output "OK $port"`,
    { JAC_NAME: name, JAC_PATTERN: receiptPattern },
    60_000
  );
  if (r.ok && /OK (\S+)/.test(r.out)) return { ok: true, port: /OK (\S+)/.exec(r.out)[1] };
  if (r.out.includes("NOPORT"))
    return { ok: false, error: "لم يُعثر على منفذ USB لطابعة — تأكد أن الطابعة موصولة بـ USB ومشغّلة ثم أعد المحاولة" };
  if (/denied|0x80070005|Access/i.test(r.err))
    return { ok: false, error: "يحتاج ويندوز صلاحية المسؤول لإضافة طابعة — أغلق البرنامج، ثم اضغط عليه بالزر الأيمن ← «تشغيل كمسؤول» وأعد المحاولة مرة واحدة" };
  return { ok: false, error: r.err.split("\n")[0] || r.out || "تعذر إعداد الطابعة" };
}

/** اختبار نصي بسيط (بدون صور) | a plain-text test: proves the printer receives commands */
function textTest() {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]), // reset, centre
    Buffer.from("JAC ICE\nPRINTER TEST OK\n1234567890\n\n", "ascii"),
    Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x10]), // feed, cut
  ]);
}

module.exports = { renderSlip, toEscPos, sendRaw, setupGenericPrinter, textTest, inkOf, DOTS };
