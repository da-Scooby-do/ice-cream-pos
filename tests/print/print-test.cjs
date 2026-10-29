// اختبار الطباعة على ويندوز | Windows print experiment (CI only).
// Prints the same 80 mm receipt to a file printer in several ways and saves
// each result, so we can see which way Windows actually prints correctly.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const PRINTER = process.env.TEST_PRINTER || "XPSFile";
const OUT = process.env.TEST_OUT || path.join(__dirname, "out");
const MODES = ["v205_css200", "v206_css_match", "no_css_size", "no_pagesize_css_match"];

function html(mode, mm) {
  const page =
    mode === "v205_css200"
      ? "@page { size: 80mm 200mm; margin: 0 }"
      : mode === "v206_css_match" || mode === "no_pagesize_css_match"
        ? `@page { size: 80mm ${mm}mm; margin: 0 }`
        : "@page { margin: 0 }";
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    @media print { ${page} html,body{margin:0;padding:0} }
    body{margin:0;font-family:Tahoma,Arial,sans-serif}
    .slip{width:72mm;margin:0 auto;padding:2mm 0 4mm;color:#000}
    .t{font-size:16px;font-weight:700;text-align:center}
    .r{display:flex;justify-content:space-between;font-size:12px;border-bottom:1px dashed #000;padding:1mm 0}
    .box{height:40mm;border:1mm solid #000;margin-top:2mm}
  </style></head><body><div class="slip"><div class="t">JAC ICE TEST ${mode}</div>
  ${Array.from({ length: 6 }, (_, i) => `<div class="r"><span>صنف ${i + 1}</span><span>1,000</span></div>`).join("")}
  <div class="box"></div><div class="t">END</div></div></body></html>`;
}

async function printOne(win, mode) {
  const mm = 110;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html(mode, mm)));
  const opts = {
    silent: true,
    printBackground: true,
    deviceName: PRINTER,
    margins: { marginType: "none" },
    scaleFactor: 100,
    copies: 1,
  };
  if (mode !== "no_pagesize_css_match") opts.pageSize = { width: 80000, height: mm * 1000 };
  return new Promise((resolve) => win.webContents.print(opts, (ok, reason) => resolve({ ok, reason })));
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 900, height: 1000 });
  const printers = await win.webContents.getPrintersAsync();
  console.log("printers:", printers.map((p) => p.name).join(" | "));
  for (const mode of MODES) {
    const before = new Set(fs.readdirSync(OUT));
    const r = await printOne(win, mode);
    await new Promise((res) => setTimeout(res, 4000));
    console.log(`RESULT ${mode}: ok=${r.ok} reason=${r.reason || ""}`);
    // the file port writes to one fixed path: move it aside per mode
    const target = process.env.TEST_FILE;
    if (target && fs.existsSync(target)) {
      const head = fs.readFileSync(target).subarray(0, 4).toString("latin1");
      const ext = head.startsWith("%PDF") ? "pdf" : head.startsWith("PK") ? "xps" : "bin";
      const dest = path.join(OUT, `${mode}.${ext}`);
      fs.renameSync(target, dest);
      console.log(`  file ${path.basename(dest)} ${fs.statSync(dest).size} bytes`);
    } else console.log(`  no file written for ${mode}`, [...fs.readdirSync(OUT)].filter((f) => !before.has(f)));
  }
  app.quit();
});
