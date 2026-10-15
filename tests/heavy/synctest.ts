// Cloud sync at full-year scale against an in-memory copy of the cloud API.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { all, closeDb, setMeta, get } from "@/lib/db/sqlite";
import { SYNCED_TABLES } from "@/lib/db/schema";
import { syncNow, syncStatus, restoreFromCloud, queueFullSync } from "@/lib/server/sync";

const TOKEN = "test-token-1234567890abcdef";
const rows = new Map<string, Map<string, unknown>>();
const snaps = new Map<string, unknown>();
let maxBody = 0, requests = 0, fail500 = 0;
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    requests++;
    maxBody = Math.max(maxBody, body.length);
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end("{}"); return; }
    const u = new URL(req.url!, "http://x");
    // simulate a flaky connection: every 37th push fails
    if (u.pathname === "/api/sync/push" && requests % 37 === 0) { fail500++; res.writeHead(500).end("{}"); return; }
    if (body.length > 4.5e6) { res.writeHead(413).end("{}"); return; }
    if (u.pathname === "/api/sync/ping") return res.end(JSON.stringify({ ok: true, rows: 0 }));
    if (u.pathname === "/api/sync/push") {
      const b = JSON.parse(body);
      for (const r of b.rows ?? []) {
        if (!rows.has(r.tbl)) rows.set(r.tbl, new Map());
        if (r.data) rows.get(r.tbl)!.set(r.id, r.data); else rows.get(r.tbl)!.delete(r.id);
      }
      for (const s of b.snapshots ?? []) snaps.set(s.key, s.data);
      return res.end(JSON.stringify({ ok: true }));
    }
    if (u.pathname === "/api/sync/pull") {
      const t = u.searchParams.get("tbl")!, after = u.searchParams.get("after") ?? "";
      const ids = [...(rows.get(t)?.keys() ?? [])].filter((i) => i > after).sort().slice(0, 500);
      return res.end(JSON.stringify({ rows: ids.map((id) => ({ id, data: rows.get(t)!.get(id) })), next: ids.length === 500 ? ids[ids.length - 1] : null }));
    }
    res.writeHead(404).end("{}");
  });
});

function digest() {
  const out: Record<string, string> = {};
  for (const t of SYNCED_TABLES) {
    const r = all(`SELECT * FROM ${t} ORDER BY id`);
    out[t] = `${r.length}:` + crypto.createHash("sha1").update(JSON.stringify(r)).digest("hex").slice(0, 10);
  }
  return out;
}

async function main() {
  await new Promise<void>((r) => server.listen(47999, "127.0.0.1", () => r()));
  const url = "http://127.0.0.1:47999";
  // fresh link = upload everything
  setMeta("cloud_url", url);
  setMeta("sync_token", TOKEN);
  get("DELETE FROM sync_outbox");
  queueFullSync();
  const st0 = syncStatus();
  console.log(`queued: ${st0.pending_rows} rows, ${st0.pending_reports} reports`);
  const t = performance.now();
  let runs = 0;
  for (; runs < 50; runs++) {
    const s = await syncNow();
    if (!s.pending_rows && !s.pending_reports && !s.last_error) break;
  }
  const st = syncStatus();
  console.log(`synced in ${runs + 1} runs, ${((performance.now() - t) / 1000).toFixed(1)}s, ${requests} requests (${fail500} simulated failures), largest request ${(maxBody / 1e6).toFixed(2)} MB`);
  console.log(`pending after: rows=${st.pending_rows} reports=${st.pending_reports} error=${st.last_error}`);
  console.log(`cloud: ${[...rows.values()].reduce((a, m) => a + m.size, 0)} rows, ${snaps.size} report snapshots`);
  let snapBytes = 0; for (const v of snaps.values()) snapBytes += JSON.stringify(v).length;
  console.log(`snapshots total ${(snapBytes / 1e6).toFixed(2)} MB, biggest ${(Math.max(...[...snaps.values()].map((v) => JSON.stringify(v).length)) / 1e3).toFixed(0)} KB`);
  const a = digest();
  // brand-new laptop restores from the cloud
  closeDb();
  const fresh = process.env.POS_DATA_DIR + "-new";
  fs.rmSync(fresh, { recursive: true, force: true });
  process.env.POS_DATA_DIR = fresh;
  const t2 = performance.now();
  const r = await restoreFromCloud(url, TOKEN);
  console.log(`restored ${r.rows} rows in ${((performance.now() - t2) / 1000).toFixed(1)}s`);
  const b = digest();
  let bad = 0;
  for (const k of Object.keys(a)) if (a[k] !== b[k]) { bad++; console.log(`  ✗ ${k}: ${a[k]} vs ${b[k]}`); }
  console.log(bad || st.pending_rows || st.pending_reports ? "SYNC TEST FAILED" : "SYNC TEST OK — restored copy identical");
  server.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
