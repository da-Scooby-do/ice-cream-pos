// اختبار التحميل الثقيل | heavy test: a simulated year of shop activity through
// the real business code (checked against an independent ledger), then a full
// cloud upload + restore against an in-memory cloud.
//   npm run test:heavy            (365 days)
//   SIM_DAYS=60 npm run test:heavy
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "jac-heavy-"));
for (const name of ["sim", "synctest"]) {
  await build({
    entryPoints: [path.join(import.meta.dirname, `${name}.ts`)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: path.join(work, `${name}.mjs`),
    alias: { "@": path.join(root, "src") },
    logLevel: "warning",
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
}
const env = { ...process.env, POS_DATA_DIR: path.join(work, "data"), SIM_DAYS: process.env.SIM_DAYS ?? "365" };
try {
  for (const name of ["sim", "synctest"]) {
    execFileSync(process.execPath, ["--no-warnings", path.join(work, `${name}.mjs`)], { env, stdio: "inherit" });
  }
  console.log("\nHEAVY TEST PASSED");
} catch {
  console.error("\nHEAVY TEST FAILED");
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
