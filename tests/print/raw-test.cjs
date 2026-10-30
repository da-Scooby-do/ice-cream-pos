// Windows CI: direct ESC/POS printing through the Windows spooler (RAW).
//  1) setupGenericPrinter() adds "JAC ICE Receipt" (Generic / Text Only) on a USB port
//  2) sendRaw() sends every byte value 0..255 + a real rendered slip, unchanged
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const esc = require("../../electron/escpos.cjs");

const PORT_FILE = process.env.PORT_FILE; // where the fake USB port writes
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed = true; };

app.whenReady().then(async () => {
  const work = path.join(app.getPath("temp"), "jac-raw-test");
  fs.mkdirSync(work, { recursive: true });

  if (process.argv.includes("--setup")) {
    const setup = await esc.setupGenericPrinter("JAC ICE Receipt", "rongta|xprinter");
    console.log("setup:", JSON.stringify(setup));
    check(setup.ok, "setupGenericPrinter added the printer");
    app.exit(failed ? 1 : 0);
    return;
  }

  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const payload = Buffer.concat([Buffer.from([0x1b, 0x40]), all, all, Buffer.from([0x1d, 0x56, 0x42, 0x10])]);
  const t0 = Date.now();
  const r1 = await esc.sendRaw("JAC ICE Receipt", payload, work);
  console.log("send #1:", JSON.stringify(r1), `${Date.now() - t0} ms (first run compiles the helper)`);
  await new Promise((r) => setTimeout(r, 4000));
  const got = fs.existsSync(PORT_FILE) ? fs.readFileSync(PORT_FILE) : Buffer.alloc(0);
  check(r1.ok, "sendRaw reported success");
  check(got.equals(payload), `printer received exactly the bytes sent (${got.length}/${payload.length})`);

  const t1 = Date.now();
  const r2 = await esc.sendRaw("JAC ICE Receipt", payload, work);
  console.log("send #2:", JSON.stringify(r2), `${Date.now() - t1} ms (cached helper)`);
  check(r2.ok, "second send ok");

  const bad = await esc.sendRaw("No Such Printer", payload, work);
  console.log("unknown printer:", JSON.stringify(bad));
  check(!bad.ok && !!bad.error, "unknown printer gives a clear error");

  app.exit(failed ? 1 : 0);
});
