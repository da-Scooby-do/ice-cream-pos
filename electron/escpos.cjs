// الطباعة المباشرة لطابعات الفواتير | direct ESC/POS printing.
//
// Most 80 mm receipt printers (Rongta, Xprinter, Epson TM…) speak ESC/POS.
// Instead of relying on the printer's Windows driver — which may be missing,
// or the wrong one — the slip is drawn here as a picture exactly 576 dots
// wide (72 mm at 203 dpi), turned into ESC/POS raster commands with a paper
// cut at the end, and sent to the printer untouched ("RAW"). On Windows this
// works with the built-in "Generic / Text Only" driver; Arabic text and the
// logo print fine because the printer only ever receives a picture.
const { BrowserWindow, nativeImage } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DOTS = 576; // printable width of an 80 mm printer at 203 dpi
const CSS_PX_72MM = (72 / 25.4) * 96; // the slip is 72 mm wide in CSS
const ZOOM = DOTS / CSS_PX_72MM;

const MIN_INK = 300; // fewer dark pixels than this = the picture came out empty
let preferred = null; // the drawing method that last worked on this computer

/**
 * ارسم القسيمة صورةً | draw the slip as a bitmap, DOTS wide.
 * Uses our own /print-frame page so the app's fonts and styles apply.
 * Some computers (graphics drivers, tablets) hand back an empty picture from
 * one method, so there are three, tried in turn; the one that works is
 * remembered (opts.prefer / result.method) and tried first next time.
 */
async function renderSlip(baseUrl, html, { prefer, only, log } = {}) {
  const order = only ? [only] : ["offscreen", "hidden", "canvas"];
  const first = prefer && order.includes(prefer) ? prefer : preferred;
  if (first) order.sort((a, b) => (b === first) - (a === first));
  let best = null;
  const tries = [`html ${html.length}`]; // what each method gave — shown to the user when all fail
  for (const method of order) {
    const t0 = Date.now();
    try {
      const r = await METHODS[method](baseUrl, html);
      r.method = method;
      tries.push(`${method} ${r.width}x${r.height} ink ${r.ink} (${r.page})`);
      log?.(`slip drawn by ${method}: ${r.width}x${r.height}, ink ${r.ink}, page ${r.page}, ${Date.now() - t0} ms`);
      if (r.ink >= MIN_INK) {
        preferred = method;
        return Object.assign(r, { tries });
      }
      if (!best || r.ink > best.ink) best = r;
    } catch (e) {
      tries.push(`${method}: ${String(e?.message || e).slice(0, 80)}`);
      log?.(`slip drawing by ${method} failed: ${e?.message || e}`);
    }
  }
  return Object.assign(best ?? { bitmap: Buffer.alloc(0), width: 0, height: 0, png: Buffer.alloc(0), ink: 0, method: "none" }, { tries });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// put the slip in the page and wait for fonts and the logo; returns its CSS
// height and a short note on the page's state (shown when a picture is empty).
// The height is checked until it holds steady: on a slow computer the page may
// still be starting up, and if the slip went missing it is put back.
async function fill(wc, html) {
  return wc.executeJavaScript(`(async () => {
    const html = ${JSON.stringify(html)};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => document.getElementById("frame");
    const put = () => { if (frame() && !frame().childElementCount) frame().innerHTML = html; };
    put();
    await Promise.race([document.fonts.ready, sleep(3000)]);
    let last = -1, same = 0;
    for (let i = 0; i < 40 && same < 2; i++) {
      put();
      const f = frame();
      await Promise.all([...(f ? f.querySelectorAll("img") : [])].map((i) => i.complete ? null : Promise.race([new Promise((r) => { i.onload = r; i.onerror = r; }), sleep(3000)])));
      await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), sleep(300)]);
      const h = f ? Math.ceil(f.getBoundingClientRect().height) : 0;
      same = h > 20 && h === last ? same + 1 : 0;
      last = h;
      if (same < 2) await sleep(150);
    }
    const f = frame();
    return {
      h: Math.max(0, last),
      page: (f ? "n" + f.childElementCount + " w" + Math.round(f.getBoundingClientRect().width) : "noframe") +
        " " + innerWidth + "x" + innerHeight + " " + document.visibilityState + " " + document.readyState,
    };
  })()`);
}

// take pictures until one has ink (a frame of the full size has been painted)
async function capture(w, height, opts) {
  let img = null;
  for (let i = 0; i < 16; i++) {
    if (w.webContents.isOffscreen()) w.webContents.invalidate();
    img = await w.webContents.capturePage({ x: 0, y: 0, width: DOTS, height }, opts);
    const s = img.getSize();
    if (s.width > 0 && s.height > 0 && inkOf(fixAlpha(img.toBitmap())) > 0) break;
    await wait(i < 4 ? 150 : 300);
  }
  return fromImage(img);
}

function fromImage(img) {
  const size = img.getSize();
  const bitmap = fixAlpha(img.toBitmap());
  return { bitmap, width: size.width, height: size.height, png: img.toPNG(), ink: inkOf(bitmap) };
}

// 1) نافذة خارج الشاشة | offscreen rendering
async function drawOffscreen(baseUrl, html) {
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
    const { h, page } = await fill(w.webContents, html);
    const height = Math.max(40, Math.ceil(h * ZOOM));
    w.setContentSize(DOTS, height);
    await wait(250);
    return Object.assign(await capture(w, height), { page });
  } finally {
    w.destroy();
  }
}

// 2) نافذة عادية مخفية | a normal hidden window, kept painting while hidden
async function drawHidden(baseUrl, html) {
  const w = new BrowserWindow({
    show: false,
    width: DOTS,
    height: 800,
    useContentSize: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { zoomFactor: ZOOM, backgroundThrottling: false, partition: "jac-print-render" },
  });
  try {
    await w.loadURL(`${baseUrl}/print-frame`);
    w.webContents.setZoomFactor(ZOOM);
    const { h, page } = await fill(w.webContents, html);
    const height = Math.max(40, Math.ceil(h * ZOOM));
    w.setContentSize(DOTS, height);
    await wait(300);
    // stayHidden: Chromium draws the page for the picture without showing it
    return Object.assign(await capture(w, height, { stayHidden: true }), { page });
  } finally {
    w.destroy();
  }
}

// 3) رسم داخل الصفحة | the page draws itself onto a canvas (no screen capture
// at all: the slip, its styles, fonts and logo go into an SVG picture)
async function drawCanvas(baseUrl, html) {
  const w = new BrowserWindow({
    show: false,
    width: 400,
    height: 800,
    webPreferences: { backgroundThrottling: false, partition: "jac-print-render" },
  });
  try {
    await w.loadURL(`${baseUrl}/print-frame`);
    w.webContents.setZoomFactor(1);
    const { page } = await fill(w.webContents, html);
    const url = await w.webContents.executeJavaScript(`(async (DOTS) => {
      const asData = async (u) => {
        const b = await (await fetch(u)).blob();
        return await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(b); });
      };
      let css = "";
      for (const sh of document.styleSheets) {
        try { for (const r of sh.cssRules) css += r.cssText + "\\n"; } catch {}
      }
      for (const m of new Set([...css.matchAll(/url\\(\\s*["']?([^"')]+)["']?\\s*\\)/g)].map((m) => m[1]))) {
        if (m.startsWith("data:")) continue;
        try { css = css.split(m).join(await asData(new URL(m, location.href).href)); } catch {}
      }
      const f = document.getElementById("frame");
      const box = f.getBoundingClientRect();
      const cw = Math.ceil(box.width), ch = Math.ceil(box.height);
      const clone = f.cloneNode(true);
      for (const img of clone.querySelectorAll("img")) { try { img.setAttribute("src", await asData(img.src)); } catch {} }
      const XH = "http://www.w3.org/1999/xhtml";
      const root = document.createElementNS(XH, "div");
      root.setAttribute("dir", document.documentElement.dir || "rtl");
      root.setAttribute("lang", document.documentElement.lang || "ar");
      root.setAttribute("class", document.documentElement.className + " " + document.body.className);
      root.setAttribute("style", "background:#fff;width:" + cw + "px");
      const st = document.createElementNS(XH, "style");
      st.textContent = css;
      root.append(st, clone);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cw + '" height="' + ch + '"><foreignObject x="0" y="0" width="100%" height="100%">' + new XMLSerializer().serializeToString(root) + "</foreignObject></svg>";
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      await new Promise((r) => setTimeout(r, 150)); // embedded fonts
      const scale = DOTS / cw;
      const c = document.createElement("canvas");
      c.width = DOTS;
      c.height = Math.max(40, Math.ceil(ch * scale));
      const g = c.getContext("2d", { willReadFrequently: true });
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    })(${DOTS})`);
    return Object.assign(fromImage(nativeImage.createFromDataURL(url)), { page });
  } finally {
    w.destroy();
  }
}

const METHODS = { offscreen: drawOffscreen, hidden: drawHidden, canvas: drawCanvas };

/** عدد النقاط الداكنة | how many dark pixels (an empty picture has none) */
function inkOf(bitmap) {
  let n = 0;
  for (let i = 0; i < bitmap.length; i += 4) if (bitmap[i + 3] > 0 && bitmap[i] + bitmap[i + 1] + bitmap[i + 2] < 384) n++;
  return n;
}

// some graphics drivers return the picture with every pixel marked fully
// transparent although the colors are there; the page is white, so if no pixel
// is opaque but the white background is visible, treat the picture as opaque
function fixAlpha(bitmap) {
  let white = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    if (bitmap[i + 3] > 0) return bitmap;
    if (bitmap[i] > 200 && bitmap[i + 1] > 200 && bitmap[i + 2] > 200) white++;
  }
  if (white * 4 < bitmap.length / 4) return bitmap; // nothing painted at all
  const out = Buffer.from(bitmap);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
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
      (err, stdout, stderr) =>
        resolve({
          ok: !err,
          timedOut: !!err?.killed,
          out: String(stdout || "").trim(),
          // the first real line of PowerShell's complaint (never the long command line)
          err: String(stderr || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" ") || (err ? `exit ${err.code ?? "?"}` : ""),
        })
    );
  });
}

/** حالة قائمة الطباعة في ويندوز | the Windows queue: status, port, waiting jobs */
async function queueState(printer) {
  const r = await powershell(
    `$p = Get-Printer -Name $env:JAC_PRINTER -ErrorAction SilentlyContinue
if (-not $p) { Write-Output "missing"; exit 0 }
$jobs = @(Get-PrintJob -PrinterName $env:JAC_PRINTER -ErrorAction SilentlyContinue)
$bad = @($jobs | Where-Object { "$($_.JobStatus)" -match 'Error|Offline|PaperOut|Blocked|Deleting' }).Count
Write-Output ("$($p.PrinterStatus) $($p.PortName) jobs $($jobs.Count) stuck $bad")`,
    { JAC_PRINTER: printer },
    20_000
  );
  return { state: r.out || r.err };
}

/** امسح المهام العالقة | remove this app's waiting jobs from the queue; returns how many */
async function clearQueue(printer) {
  const r = await powershell(
    `$jobs = @(Get-PrintJob -PrinterName $env:JAC_PRINTER -ErrorAction SilentlyContinue)
foreach ($j in $jobs) { Remove-PrintJob -InputObject $j -ErrorAction SilentlyContinue }
Write-Output $jobs.Count`,
    { JAC_PRINTER: printer },
    20_000
  );
  return Number(r.out) || 0;
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
if (-not (Test-Path $env:JAC_DLL)) {
  $part = "$env:JAC_DLL.part.dll"
  Add-Type -TypeDefinition $src -OutputAssembly $part -OutputType Library
  Move-Item -Force $part $env:JAC_DLL
}
try { Add-Type -Path $env:JAC_DLL } catch {
  # a damaged helper: build it in memory this time, and again on disk next time
  Remove-Item -Force $env:JAC_DLL -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $src
}
$code = [JacRawPrint]::Send($env:JAC_PRINTER, [IO.File]::ReadAllBytes($env:JAC_FILE))
if ($code -ne 0) { Write-Output "ERR $code"; exit 1 }
Write-Output "OK"`,
        { JAC_DLL: dll, JAC_PRINTER: printer, JAC_FILE: file },
        45_000 // slow tablets can take a while to start PowerShell
      );
      if (r.ok && r.out.endsWith("OK")) return { ok: true };
      const code = /ERR (-?\d+)/.exec(r.out)?.[1];
      const queue = await queueState(printer);
      if (r.timedOut || /Error|Offline|PaperOut|Paused|Blocked/i.test(queue.state)) {
        // jobs stuck in Windows' print queue block every new one: clear them
        const cleared = await clearQueue(printer);
        return {
          ok: false,
          error:
            `الطابعة لا تستجيب: تأكد أنها مشغّلة وفيها ورق وأن سلك USB موصول، ثم أعد المحاولة.` +
            (cleared ? ` (تم مسح ${cleared} مهمة عالقة)` : "") +
            ` إذا غيّرت منفذ USB اضغط «إعداد طابعة الفواتير تلقائياً». [${queue.state || "?"}${r.timedOut ? " · timeout" : ""}]`,
        };
      }
      const why =
        code === "1801" ? "اسم الطابعة غير صحيح" :
        code === "1804" ? "تعريف هذه الطابعة لا يقبل الطباعة المباشرة" :
        code === "5" ? "لا توجد صلاحية للطابعة" :
        code ? `رمز الخطأ ${code}` : r.err || "تعذر الإرسال";
      return { ok: false, error: `${why} [${queue.state || "?"}]` };
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
 * منافذ USB للطابعات | the USB printer ports Windows knows, which device each
 * one belongs to and whether that device is plugged in right now.
 * (Windows keeps a port for every printer ever plugged in, so the newest port
 * is not always the right one.)
 */
async function usbPorts() {
  if (process.platform !== "win32") return [];
  const r = await powershell(
    `$out = @()
$base = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceClasses\\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
if (Test-Path -LiteralPath $base) {
  foreach ($k in Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue) {
    $p = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath '#\\Device Parameters') -ErrorAction SilentlyContinue
    if (-not $p -or $null -eq $p.'Port Number') { continue }
    $c = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath '#\\Control') -ErrorAction SilentlyContinue
    $vid = if ($k.PSChildName -match 'VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})') { "$($matches[1]):$($matches[2])" } else { '' }
    $out += [pscustomobject]@{ port = ('{0}{1:D3}' -f $p.'Base Name', [int]$p.'Port Number'); desc = "$($p.'Port Description')"; connected = ($c.Linked -eq 1); id = $vid }
  }
}
foreach ($pp in @(Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^USB\\d+' })) {
  if (-not ($out | Where-Object { $_.port -eq $pp.Name })) { $out += [pscustomobject]@{ port = $pp.Name; desc = "$($pp.Description)"; connected = $false; id = '' } }
}
ConvertTo-Json -Compress -InputObject @($out)`,
    {},
    30_000
  );
  try {
    const list = JSON.parse(r.out || "[]");
    const all = (Array.isArray(list) ? list : [list]).filter((p) => p && /^USB\d+$/i.test(p.port));
    // one entry per port: a plugged-in device wins over old ones on the same port
    const by = new Map();
    for (const p of all) if (!by.has(p.port) || (p.connected && !by.get(p.port).connected)) by.set(p.port, p);
    return [...by.values()].sort((a, b) => a.port.localeCompare(b.port));
  } catch {
    return [];
  }
}

/** اختر منفذ طابعة الفواتير | the port the receipt printer is on, best guess first */
function bestPort(ports, receiptPattern) {
  const re = new RegExp(receiptPattern, "i");
  const live = ports.filter((p) => p.connected);
  return (live.find((p) => re.test(p.desc)) || (live.length === 1 ? live[0] : null) || live[0] || null)?.port ?? null;
}

/**
 * إعداد طابعة الفواتير بدون تعريف (ويندوز) | add a "JAC ICE Receipt" printer
 * on the receipt printer's USB port with Windows' built-in Generic / Text
 * Only driver — nothing to download. port: a port chosen by hand, else the
 * port of the plugged-in printer.
 */
async function setupGenericPrinter(name, receiptPattern, port = null) {
  if (process.platform !== "win32") return { ok: false, error: "متاح على ويندوز فقط" };
  const ports = await usbPorts();
  const want = port || bestPort(ports, receiptPattern) || "";
  const r = await powershell(
    `$ErrorActionPreference = 'Stop'
$name = $env:JAC_NAME
$pattern = $env:JAC_PATTERN
$usb = @(Get-PrinterPort | Where-Object { $_.Name -match '^USB\\d+' } | Sort-Object Name)
if ($usb.Count -eq 0) { Write-Output 'NOPORT'; exit 2 }
$port = $env:JAC_PORT
if (-not $port -or -not ($usb | Where-Object { $_.Name -eq $port })) {
  # prefer the USB port a receipt printer already uses, else the newest one
  $hint = Get-Printer | Where-Object { $_.PortName -match '^USB\\d+' -and $_.Name -match $pattern -and $_.Name -ne $name } | Select-Object -First 1
  $port = if ($hint) { $hint.PortName } else { $usb[-1].Name }
}
if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) { Add-PrinterDriver -Name 'Generic / Text Only' }
if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { Set-Printer -Name $name -PortName $port }
else { Add-Printer -Name $name -DriverName 'Generic / Text Only' -PortName $port }
Write-Output "OK $port"`,
    { JAC_NAME: name, JAC_PATTERN: receiptPattern, JAC_PORT: want },
    60_000
  );
  const live = ports.filter((p) => p.connected);
  if (r.ok && /OK (\S+)/.test(r.out)) {
    const used = /OK (\S+)/.exec(r.out)[1];
    return { ok: true, port: used, ports, pluggedIn: live.length, sure: !!live.find((p) => p.port === used) };
  }
  if (r.out.includes("NOPORT"))
    return { ok: false, ports, error: "لم يُعثر على منفذ USB لطابعة — الجهاز لا يرى الطابعة: تأكد أن الطابعة مشغّلة وأن سلك USB (أو محوّل التابلت) موصول جيداً، ثم أعد المحاولة" };
  if (/denied|0x80070005|Access/i.test(r.err))
    return { ok: false, ports, error: "يحتاج ويندوز صلاحية المسؤول لإضافة طابعة — أغلق البرنامج، ثم اضغط عليه بالزر الأيمن ← «تشغيل كمسؤول» وأعد المحاولة مرة واحدة" };
  return { ok: false, ports, error: r.err || r.out || "تعذر إعداد الطابعة" };
}

/**
 * جرّب كل المنافذ | print a short test on every USB port in turn, each saying
 * its own port name — the paper that comes out shows which port is right.
 */
async function tryPorts(name, receiptPattern, workDir) {
  const ports = await usbPorts();
  const tried = [];
  for (const p of ports) {
    const s = await setupGenericPrinter(name, receiptPattern, p.port);
    if (!s.ok) {
      tried.push({ port: p.port, ok: false, error: s.error });
      continue;
    }
    const r = await sendRaw(name, textTest(p.port), workDir);
    tried.push({ port: p.port, ok: r.ok, error: r.error });
    // let the job leave the queue before the port changes under it
    for (let i = 0; i < 8; i++) {
      if (/jobs 0/.test((await queueState(name)).state)) break;
      await wait(1000);
    }
  }
  return { ports, tried };
}

/** اختبار نصي بسيط (بدون صور) | a plain-text test: proves the printer receives commands */
function textTest(label = "") {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]), // reset, centre
    Buffer.from(`JAC ICE\nPRINTER TEST OK\n${label ? `>>> ${label} <<<\n` : ""}1234567890\n\n`, "ascii"),
    Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x10]), // feed, cut
  ]);
}

/** صورة رسمتها صفحة البرنامج | a PNG data URL drawn by the app's page */
function fromDataUrl(url) {
  return fromImage(nativeImage.createFromDataURL(url));
}

module.exports = { renderSlip, fromDataUrl, toEscPos, sendRaw, queueState, clearQueue, usbPorts, setupGenericPrinter, tryPorts, textTest, inkOf, DOTS };
