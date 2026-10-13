// تجهيز خادم Next للبرنامج | finish Next's standalone server for the desktop app.
// `next build` (with BUILD_TARGET=desktop) writes .next/standalone; it needs the
// static assets and /public copied next to it, as the Next docs describe.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("✗ .next/standalone/server.js is missing — run with BUILD_TARGET=desktop");
  process.exit(1);
}

const copy = (from, to) => {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
};
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(root, "public"), path.join(standalone, "public"));

// Never ship local data or secrets that tracing may have picked up.
for (const junk of [".data", ".env", ".env.local", ".env.production", "dist", "supabase"]) {
  fs.rmSync(path.join(standalone, junk), { recursive: true, force: true });
}

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => {
    const p = path.join(dir, e.name);
    return s + (e.isDirectory() ? size(p) : fs.statSync(p).size);
  }, 0);
console.log(`✓ desktop server ready: ${(size(standalone) / 1024 / 1024).toFixed(1)} MB`);
