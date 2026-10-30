// =============================================================================
// JAC ICE POS — برنامج اللابتوب | the desktop app (Electron main process)
//
//  • starts the shop's own server (Next.js standalone + SQLite) on 127.0.0.1
//    in a background process — no internet needed to sell
//  • shows it full-screen in a locked-down window
//  • prints receipts silently to the chosen printer (no dialog, no Chrome flags)
//  • file/folder pickers for backups, and automatic updates from GitHub
//
//  Run `npm run desktop:build` first, then `npm run desktop:run`.
//  `--smoke-test` boots everything with a throw-away database, checks the
//  pages and the print pipeline, and exits 0/1 (used by CI on Windows).
// =============================================================================
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const escpos = require("./escpos.cjs");

const SMOKE = process.argv.includes("--smoke-test");
const PREFERRED_PORT = 47321;

app.setAppUserModelId("com.jacice.pos");
// for automated tests only: keep test data away from the real profile
if (process.env.JAC_USER_DATA) app.setPath("userData", process.env.JAC_USER_DATA);
if (process.env.JAC_DOCUMENTS) app.setPath("documents", process.env.JAC_DOCUMENTS);
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// --- إعدادات الجهاز | desktop config (printer, full screen) -----------------

const cfgFile = () => path.join(app.getPath("userData"), "desktop.json");
function readCfg() {
  try {
    return { printer: null, fullscreen: true, printMode: "auto", drawer: false, raster: "gsv0", ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) };
  } catch {
    return { printer: null, fullscreen: true, printMode: "auto", drawer: false, raster: "gsv0" };
  }
}
function writeCfg(c) {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2));
}

// --- السجل | log file -----------------------------------------------------------

let logPath = null;
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  if (SMOKE) process.stdout.write(line);
  if (!logPath) return;
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, `${logPath}.old`);
    fs.appendFileSync(logPath, line);
  } catch {
    /* logging must never crash the app */
  }
}

// --- الخادم الداخلي | the local server ----------------------------------------

let server = null;
let port = 0;
let quitting = false;

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", ".next", "standalone");
}

function freePort(preferred) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => {
      const r = net.createServer();
      r.listen(0, "127.0.0.1", () => {
        const p = r.address().port;
        r.close(() => resolve(p));
      });
    });
    s.listen(preferred, "127.0.0.1", () => s.close(() => resolve(preferred)));
  });
}

function startServer(dataDir, backupDir) {
  const dir = serverDir();
  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) throw new Error(`لم يُعثر على الخادم: ${entry}`);
  server = utilityProcess.fork(entry, [], {
    cwd: dir,
    serviceName: "JAC ICE server",
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      POS_RUNTIME: "desktop",
      POS_DATA_DIR: dataDir,
      POS_BACKUP_DIR: backupDir,
      POS_APP_VERSION: app.getVersion(),
    },
  });
  server.stdout?.on("data", (d) => log("[server]", String(d).trimEnd()));
  server.stderr?.on("data", (d) => log("[server:err]", String(d).trimEnd()));
  server.on("exit", (code) => {
    log("server exited", code);
    server = null;
    if (!quitting) fatal(`توقف خادم البرنامج (الرمز ${code}). أعد تشغيل البرنامج.`);
  });
}

function waitForServer(timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error("الخادم لم يبدأ خلال دقيقة"));
      else setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

// --- النافذة | the window ----------------------------------------------------------

let win = null;
const base = () => `http://127.0.0.1:${port}`;
const fromUs = (e) => {
  try {
    return new URL(e.senderFrame?.url ?? "").origin === base();
  } catch {
    return false;
  }
};

function createWindow() {
  const cfg = readCfg();
  win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#00ADEF",
    title: "JAC ICE",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => {
    if (!SMOKE) {
      win.show();
      if (cfg.fullscreen) win.setFullScreen(true);
      else win.maximize();
    }
  });
  win.webContents.setVisualZoomLevelLimits(1, 1);
  // always 100%: older versions could leave the screen zoomed in (shared zoom
  // with the receipt-drawing window); Chromium remembers zoom per address
  win.webContents.on("did-finish-load", () => win?.webContents.setZoomFactor(1));
  // لا روابط خارجية داخل البرنامج | external links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (port && url.startsWith(base())) return;
    if (url.startsWith("file:")) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r")) {
      win.webContents.reload();
      e.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === "i") {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    log("renderer gone", d.reason);
    if (!quitting && d.reason !== "clean-exit") win.webContents.reload();
  });
  void win.loadFile(path.join(__dirname, "splash.html"));
  return win;
}

function fatal(message) {
  log("FATAL", message);
  if (SMOKE) {
    console.error("SMOKE FAIL:", message);
    app.exit(1);
    return;
  }
  dialog.showErrorBox("JAC ICE", `${message}\n\nسجل الأخطاء: ${logPath ?? ""}`);
  quitting = true;
  app.quit();
}

// --- الطباعة | printing --------------------------------------------------------------

// «طابعات» ويندوز التي تحفظ ملفاً أو ترسل فاكساً — ليست طابعة فواتير. الطباعة
// الصامتة إليها تفتح نافذة «حفظ» ثم تُلغى. | Windows "printers" that save a file
// or send a fax: silent printing to them opens a Save dialog and gets cancelled.
const VIRTUAL_PRINTER = /pdf|xps|onenote|fax|document writer|send to|snagit|anydesk|cutepdf/i;
const RECEIPT_PRINTER =
  /jac ice receipt|generic\s*\/\s*text only|rongta|\brp[-\s]?\d{2,3}|ace[-\s]?v1|xprinter|xp-?\d|pos[-\s]?\d|pos58|pos80|receipt|thermal|80\s?mm|58\s?mm|epson tm|gprinter|sewoo|bixolon|star tsp/i;

/** اختر طابعة الفواتير | which printer a receipt goes to (or why none) */
function pickPrinter(printers, chosen) {
  if (chosen) {
    if (!printers.some((p) => p.name === chosen)) return { error: `الطابعة «${chosen}» غير متصلة — شغّلها أو اخترها من جديد في الإعدادات ← الطابعة` };
    if (VIRTUAL_PRINTER.test(chosen)) return { error: `«${chosen}» ليست طابعة فواتير — اختر طابعة الفواتير (Rongta) من الإعدادات ← الطابعة` };
    return { name: chosen };
  }
  const def = printers.find((p) => p.isDefault);
  if (def && !VIRTUAL_PRINTER.test(def.name)) return { name: def.name };
  // الافتراضية في ويندوز ملف PDF: ابحث عن طابعة الفواتير بنفسك
  const receipt = printers.find((p) => RECEIPT_PRINTER.test(`${p.name} ${p.displayName || ""}`) && !VIRTUAL_PRINTER.test(p.name));
  if (receipt) return { name: receipt.name };
  return {
    error: `لم تُختر طابعة الفواتير، والطابعة الافتراضية في ويندوز هي «${def?.displayName || def?.name || "—"}» (ليست طابعة فواتير). اختر طابعة الفواتير (Rongta) من الإعدادات ← الطابعة`,
  };
}

const lastReceiptPng = () => path.join(app.getPath("userData"), "logs", "last-receipt.png");
const RAW_ONLY = /jac ice receipt|generic\s*\/\s*text only/i;

/** طباعة مباشرة ESC/POS أم عبر تعريف ويندوز؟ | print raw ESC/POS or through the driver? */
function wantsRaw(cfg, name) {
  const mode = cfg.printMode || "auto";
  if (mode === "raw") return true;
  if (mode === "driver") return false;
  return RECEIPT_PRINTER.test(name);
}

async function printFrom(webContents, opts = {}) {
  const cfg = readCfg();
  const printers = await webContents.getPrintersAsync();
  if (!printers.length) return { ok: false, error: "لا توجد طابعة مثبتة على الجهاز" };
  const target = pickPrinter(printers, cfg.printer);
  if (target.error) {
    log("print refused:", target.error);
    return { ok: false, error: target.error };
  }
  const raw = typeof opts.html === "string" && !!opts.html && wantsRaw(cfg, target.name);
  log(`print → «${target.name}» mode=${cfg.printMode || "auto"} ${raw ? "ESC/POS direct" : "via driver"}`);

  // 1) مباشرة بلغة الطابعة (لا يحتاج تعريفاً) | straight to the printer in ESC/POS
  if (raw) {
    try {
      const t0 = Date.now();
      const bmp = await escpos.renderSlip(base(), opts.html, { prefer: cfg.render, log });
      if (bmp.ink >= 300 && bmp.method !== cfg.render) writeCfg({ ...readCfg(), render: bmp.method });
      // keep the last receipt picture: «فتح صورة آخر فاتورة» shows exactly what was sent
      try {
        fs.writeFileSync(lastReceiptPng(), bmp.png);
      } catch {
        /* diagnostics only */
      }
      if (bmp.ink < 300) {
        log(`ESC/POS slip came out empty by every method (best ${bmp.method} ${bmp.width}x${bmp.height}, ink ${bmp.ink}) — not sent`);
        throw new Error("صورة الفاتورة خرجت فارغة — أعد المحاولة");
      }
      const bytes = escpos.toEscPos(bmp, { cut: true, kick: !!opts.kick && !!cfg.drawer, raster: cfg.raster || "gsv0" });
      const r = await escpos.sendRaw(target.name, bytes, app.getPath("userData"));
      log(`ESC/POS ${bmp.width}x${bmp.height} ink ${bmp.ink} (${bmp.method}, ${cfg.raster || "gsv0"}) → ${bytes.length} bytes, ${r.ok ? "sent" : "failed"} in ${Date.now() - t0} ms`);
      if (r.ok) return { ok: true };
      log("raw print failed:", r.error);
      if ((cfg.printMode || "auto") === "raw" || RAW_ONLY.test(target.name)) {
        return { ok: false, error: `الطباعة المباشرة لم تنجح: ${r.error}` };
      }
    } catch (e) {
      log("raw print error:", e?.message || e);
      if ((cfg.printMode || "auto") === "raw" || RAW_ONLY.test(target.name)) {
        return { ok: false, error: `الطباعة المباشرة لم تنجح: ${e?.message || e}` };
      }
    }
  }

  // 2) عبر تعريف ويندوز | through the Windows driver
  const height = Math.max(50_000, Math.min(Math.round(Number(opts.heightMicrons) || 200_000), 3_000_000));
  const options = {
    silent: true,
    printBackground: true,
    deviceName: target.name,
    margins: { marginType: "none" },
    scaleFactor: 100,
    copies: 1,
  };
  const attempt = (o) => new Promise((resolve) => webContents.print(o, (ok, reason) => resolve({ ok, reason })));

  // ورق بطول الفاتورة بالضبط | paper exactly as long as the slip
  const first = await attempt({ ...options, pageSize: { width: 80_000, height } });
  if (first.ok) return { ok: true };
  log("print with slip-length paper failed:", first.reason, "— retrying with the printer's own paper");
  // بعض التعريفات ترفض المقاس المخصص | some drivers reject a custom size
  const second = await attempt(options);
  if (second.ok) return { ok: true };
  log("print failed:", second.reason);
  return { ok: false, error: second.reason || first.reason || "تعذرت الطباعة" };
}

// --- التحديثات | automatic updates (GitHub releases) ------------------------------

let updateState = { status: "idle" };
function setUpdate(s) {
  updateState = s;
  win?.webContents.send("pos:update", s);
}
let updater = null;
function initUpdates() {
  if (!app.isPackaged || SMOKE) return;
  try {
    ({ autoUpdater: updater } = require("electron-updater"));
  } catch (e) {
    log("updater unavailable", e.message);
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => setUpdate({ status: "checking" }));
  updater.on("update-available", (i) => setUpdate({ status: "available", version: i.version }));
  updater.on("update-not-available", () => setUpdate({ status: "none" }));
  updater.on("download-progress", (p) => setUpdate({ status: "downloading", percent: p.percent, version: updateState.version }));
  updater.on("update-downloaded", (i) => setUpdate({ status: "ready", version: i.version }));
  updater.on("error", (e) => {
    log("update error", e?.message);
    const msg = String(e?.message ?? "").split("\n")[0].slice(0, 160);
    setUpdate({ status: "error", error: `لا يوجد اتصال أو تعذر الوصول لخادم التحديثات${msg ? ` (${msg})` : ""}` });
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 15_000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

// --- IPC | what the page may ask for (only from our own origin) ---------------------

function registerIpc() {
  const guard = (fn) => (e, ...args) => {
    if (!fromUs(e)) throw new Error("forbidden");
    return fn(e, ...args);
  };
  ipcMain.handle("pos:print", guard((e, opts) => printFrom(e.sender, opts || {})));
  ipcMain.handle(
    "pos:testPrinter",
    guard(async (e) => {
      const printers = await e.sender.getPrintersAsync();
      const target = pickPrinter(printers, readCfg().printer);
      if (target.error) return { ok: false, error: target.error };
      const r = await escpos.sendRaw(target.name, escpos.textTest(), app.getPath("userData"));
      log(`text test → «${target.name}»: ${r.ok ? "sent" : r.error}`);
      return r.ok ? { ok: true, printer: target.name } : r;
    })
  );
  ipcMain.handle(
    "pos:openLastReceipt",
    guard(async () => {
      if (!fs.existsSync(lastReceiptPng())) return { ok: false, error: "لا توجد صورة بعد — اطبع فاتورة أولاً" };
      await shell.openPath(lastReceiptPng());
      return { ok: true };
    })
  );
  ipcMain.handle(
    "pos:setupReceiptPrinter",
    guard(async () => {
      const r = await escpos.setupGenericPrinter("JAC ICE Receipt", RECEIPT_PRINTER.source);
      if (r.ok) writeCfg({ ...readCfg(), printer: "JAC ICE Receipt", printMode: "auto" });
      log("setup receipt printer:", JSON.stringify(r));
      return r;
    })
  );
  ipcMain.handle(
    "pos:printers",
    guard(async (e) =>
      (await e.sender.getPrintersAsync()).map((p) => ({
        name: p.name,
        displayName: p.displayName,
        isDefault: !!p.isDefault,
        virtual: VIRTUAL_PRINTER.test(p.name),
        receipt: RECEIPT_PRINTER.test(`${p.name} ${p.displayName || ""}`) && !VIRTUAL_PRINTER.test(p.name),
      }))
    )
  );
  ipcMain.handle("pos:getConfig", guard(() => readCfg()));
  ipcMain.handle(
    "pos:setConfig",
    guard((_e, patch) => {
      const cur = readCfg();
      const next = { ...cur };
      if (patch && "printer" in patch) next.printer = typeof patch.printer === "string" && patch.printer ? patch.printer : null;
      if (patch && "printMode" in patch) next.printMode = ["auto", "raw", "driver"].includes(patch.printMode) ? patch.printMode : "auto";
      if (patch && "drawer" in patch) next.drawer = !!patch.drawer;
      if (patch && "raster" in patch) next.raster = patch.raster === "escstar" ? "escstar" : "gsv0";
      if (patch && "fullscreen" in patch) {
        next.fullscreen = !!patch.fullscreen;
        win?.setFullScreen(next.fullscreen);
        if (!next.fullscreen) win?.maximize();
      }
      writeCfg(next);
      return next;
    })
  );
  ipcMain.handle(
    "pos:chooseFolder",
    guard(async () => {
      const r = await dialog.showOpenDialog(win, {
        title: "اختر مجلد النسخ الاحتياطي (مثلاً الفلاشة)",
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled ? null : r.filePaths[0];
    })
  );
  ipcMain.handle(
    "pos:chooseBackupFile",
    guard(async (_e, defaultDir) => {
      const r = await dialog.showOpenDialog(win, {
        title: "اختر ملف النسخة الاحتياطية",
        defaultPath: typeof defaultDir === "string" ? defaultDir : app.getPath("documents"),
        properties: ["openFile"],
        filters: [{ name: "JAC ICE backup", extensions: ["gz", "db"] }],
      });
      return r.canceled ? null : r.filePaths[0];
    })
  );
  ipcMain.handle(
    "pos:openPath",
    guard(async (_e, p) => {
      if (typeof p === "string" && fs.existsSync(p) && fs.statSync(p).isDirectory()) await shell.openPath(p);
    })
  );
  ipcMain.handle("pos:updateState", guard(() => updateState));
  ipcMain.handle(
    "pos:checkUpdates",
    guard(async () => {
      if (!updater) return setUpdate({ status: "none" });
      await updater.checkForUpdates().catch(() => {});
    })
  );
  ipcMain.handle(
    "pos:installUpdate",
    guard(() => {
      if (updater && updateState.status === "ready") {
        quitting = true;
        updater.quitAndInstall(false, true);
      }
    })
  );
}

// --- التشغيل | boot ------------------------------------------------------------------

async function boot() {
  const userData = app.getPath("userData");
  const dataDir = SMOKE ? fs.mkdtempSync(path.join(os.tmpdir(), "jac-smoke-")) : path.join(userData, "data");
  const backupDir = SMOKE ? path.join(dataDir, "backups") : path.join(app.getPath("documents"), "JAC ICE Backups");
  fs.mkdirSync(path.join(userData, "logs"), { recursive: true });
  logPath = path.join(userData, "logs", SMOKE ? "smoke.log" : "app.log");
  log(`JAC ICE POS ${app.getVersion()} — electron ${process.versions.electron}, node ${process.versions.node}`);

  registerIpc();
  createWindow();
  port = await freePort(PREFERRED_PORT);
  startServer(dataDir, backupDir);
  await waitForServer();
  log("server ready on", base());
  await win.loadURL(`${base()}/`);
  initUpdates();
  if (SMOKE) await smokeTest(dataDir);
}

async function smokeTest(dataDir) {
  const wc = win.webContents;
  const text = await wc.executeJavaScript("document.body.innerText");
  const url = wc.getURL();
  if (!url.endsWith("/setup") || !text.includes("مرحباً بك في JAC ICE")) throw new Error(`setup page not shown (${url})`);
  log("✓ setup page rendered");
  const db = fs.existsSync(path.join(dataDir, "pos.db"));
  if (!db) throw new Error("database file was not created");
  log("✓ SQLite database created");
  const hasBridge = await wc.executeJavaScript("!!window.desktop && window.desktop.isDesktop === true");
  if (!hasBridge) throw new Error("preload bridge missing");
  log("✓ preload bridge available");
  const printers = await wc.getPrintersAsync();
  log(`✓ printers visible: ${printers.length}`);
  const pdf = await wc.printToPDF({ pageSize: { width: 3.15, height: 8 }, printBackground: true });
  if (!pdf.length) throw new Error("printToPDF produced nothing");
  fs.writeFileSync(path.join(dataDir, "smoke.pdf"), pdf);
  log(`✓ print pipeline ok (${pdf.length} bytes)`);
  // ESC/POS: draw a slip (Arabic + logo) by each method and turn it into printer commands
  const slip =
    '<div class="slip"><img src="/brand/mono.svg" class="s-logo" alt=""><div class="s-row"><span>آيس كريم — كبير</span><span>3,500 ج.س</span></div></div>';
  for (const only of ["offscreen", "hidden", "canvas"]) {
    const bmp = await escpos.renderSlip(base(), slip, { only });
    if (bmp.width < escpos.DOTS || bmp.height < 40 || bmp.ink < 500) {
      fs.writeFileSync(path.join(dataDir, `slip-${only}.png`), bmp.png);
      throw new Error(`slip drawing by ${only} failed (${bmp.width}x${bmp.height}, ${bmp.ink} dark pixels)`);
    }
    const escBytes = escpos.toEscPos(bmp, { cut: true });
    log(`✓ ESC/POS slip by ${only} ${bmp.width}x${bmp.height}, ${bmp.ink} dark pixels → ${escBytes.length} bytes`);
  }
  console.log("SMOKE OK");
  quitting = true;
  server?.kill();
  app.exit(0);
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on("before-quit", () => {
  quitting = true;
  server?.kill();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(() =>
  boot().catch((e) => {
    fatal(`تعذر تشغيل البرنامج: ${e.message}`);
  })
);

if (SMOKE) setTimeout(() => fatal("smoke test timed out"), 120_000).unref();
