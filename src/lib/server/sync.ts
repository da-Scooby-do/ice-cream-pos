import fs from "node:fs";
import path from "node:path";
import { addDays, localDate, monthOf } from "../time";
import { MIGRATIONS, SYNCED_TABLES, type SyncedTable } from "../db/schema";
import { all, closeDb, db, dbPath, get, getMeta, nowIso, run, setMeta } from "../db/sqlite";
import { APP_VERSION } from "../runtime";
import { fail } from "./errors";
import { keepLocalConfig, makeBackup, restoreLocalConfig } from "./backup";
import { activeDates, dashboard, dayStatement, monthStatement, stockMonth } from "./reports";
import { currentShift } from "./shifts";
import { getShop } from "./shop";
import { stockLevels } from "./stock";

// المزامنة مع السحابة | cloud sync (one way: laptop → cloud).
//
// The laptop is the only place data is entered, so there is never a conflict
// to resolve. Every change waits in sync_outbox (filled by triggers) and is
// copied up whenever there is internet; reports are re-computed here and
// published as ready-made snapshots for the owner's phone. If the internet is
// down nothing is lost — the queue just grows until it comes back.

export const DEFAULT_CLOUD_URL = "https://ice-cream-pos.vercel.app";
const ROW_BATCH = 400;
const SNAP_BATCH = 8;
const TIMEOUT_MS = 30_000;

type Config = { url: string; token: string };

export function cloudConfig(): Config | null {
  const url = getMeta("cloud_url");
  const token = getMeta("sync_token");
  return url && token ? { url, token } : null;
}

async function call<T>(cfg: Config, route: string, init: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(new URL(route, cfg.url), {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) },
    });
    if (res.status === 401) throw new Error("رمز الربط غير صحيح");
    if (res.status === 503) throw new Error("السحابة غير مهيأة بعد (SYNC_TOKEN في Vercel)");
    if (!res.ok) throw new Error(`السحابة ردّت بالخطأ ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالسحابة");
    if (err.message.startsWith("fetch failed") || err.name === "TypeError") throw new Error("لا يوجد اتصال بالإنترنت");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function testCloud(url: string, token: string) {
  const cfg = { url: normalizeUrl(url), token: token.trim() };
  return call<{ ok: boolean; rows: number }>(cfg, "/api/sync/ping");
}

export function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    fail("رابط السحابة غير صحيح");
  }
}

// --- الطوابير | queues -------------------------------------------------------

const DATED: Partial<Record<SyncedTable, true>> = { orders: true, money_entries: true, stock_moves: true, shifts: true };

/** كل شيء من جديد (عند أول ربط أو بعد استعادة) | queue a complete upload */
export function queueFullSync() {
  for (const t of SYNCED_TABLES) {
    run(`INSERT INTO sync_outbox (tbl, row_id) SELECT '${t}', id FROM ${t}`);
  }
  for (const d of activeDates()) queueSnapshotsForDate(d);
  queueSnapshot("stock");
}

function queueSnapshot(key: string) {
  run("INSERT OR IGNORE INTO snapshot_queue (key) VALUES ($key)", { key });
}

function queueSnapshotsForDate(date: string) {
  queueSnapshot(`day:${date}`);
  queueSnapshot(`month:${monthOf(date)}`);
  queueSnapshot(`stockmonth:${monthOf(date)}`);
}

// --- المزامنة | the sync loop ------------------------------------------------

const g = globalThis as unknown as { __posSyncing?: boolean };

export type SyncStatus = {
  configured: boolean;
  url: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  pending_rows: number;
  pending_reports: number;
};

export function syncStatus(): SyncStatus {
  const cfg = cloudConfig();
  return {
    configured: !!cfg,
    url: cfg?.url ?? getMeta("cloud_url"),
    last_sync_at: getMeta("last_sync_at"),
    last_error: getMeta("sync_error"),
    pending_rows: Number(get<{ n: number }>("SELECT COUNT(DISTINCT tbl || row_id) AS n FROM sync_outbox")!.n),
    pending_reports: Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM snapshot_queue")!.n),
  };
}

export async function syncNow(): Promise<SyncStatus> {
  const cfg = cloudConfig();
  if (!cfg) {
    // Not linked: don't let the queue grow forever. Linking later uploads
    // everything anyway (queueFullSync).
    run("DELETE FROM sync_outbox");
    run("DELETE FROM snapshot_queue");
    return syncStatus();
  }
  if (g.__posSyncing) return syncStatus();
  g.__posSyncing = true;
  try {
    await pushRows(cfg);
    await pushSnapshots(cfg);
    setMeta("last_sync_at", nowIso());
    setMeta("sync_error", null);
  } catch (e) {
    setMeta("sync_error", (e as Error).message);
  } finally {
    g.__posSyncing = false;
  }
  return syncStatus();
}

/** شغّل المزامنة بعد لحظة دون انتظار | fire-and-forget, e.g. after a shift closes */
export function syncSoon() {
  setTimeout(() => void syncNow(), 500);
}

async function pushRows(cfg: Config) {
  for (let guard = 0; guard < 500; guard++) {
    const batch = all<{ seq: number; tbl: SyncedTable; row_id: string }>(
      "SELECT seq, tbl, row_id FROM sync_outbox ORDER BY seq LIMIT $n",
      { n: ROW_BATCH }
    );
    if (!batch.length) return;
    const maxSeq = Math.max(...batch.map((b) => Number(b.seq)));
    const seen = new Set<string>();
    const rows: { tbl: string; id: string; data: Record<string, unknown> | null }[] = [];
    const dates = new Set<string>();
    let stockChanged = false;

    for (const b of batch) {
      const key = `${b.tbl}:${b.row_id}`;
      if (seen.has(key) || !(SYNCED_TABLES as readonly string[]).includes(b.tbl)) continue;
      seen.add(key);
      const data = get<Record<string, unknown>>(`SELECT * FROM ${b.tbl} WHERE id = $id`, { id: b.row_id }) ?? null;
      rows.push({ tbl: b.tbl, id: b.row_id, data: data ? { ...data } : null });
      if (data && DATED[b.tbl] && typeof data.business_date === "string") dates.add(data.business_date);
      if (b.tbl === "stock_items" || b.tbl === "stock_moves") stockChanged = true;
    }

    await call(cfg, "/api/sync/push", { method: "POST", body: JSON.stringify({ rows }) });

    run("DELETE FROM sync_outbox WHERE seq <= $max", { max: maxSeq });
    for (const d of dates) queueSnapshotsForDate(d);
    if (stockChanged) queueSnapshot("stock");
  }
}

function computeSnapshot(key: string): unknown {
  const today = localDate();
  const [kind, arg] = key.split(/:(.*)/s);
  switch (kind) {
    case "day":
      return dayStatement(arg);
    case "month":
      return monthStatement(arg);
    case "stockmonth":
      return stockMonth(arg);
    case "stock":
      return stockLevels();
    case "dash":
      if (arg === "today") return dashboard(today, today);
      if (arg === "7d") return dashboard(addDays(today, -6), today);
      if (arg === "30d") return dashboard(addDays(today, -29), today);
      return dashboard(`${monthOf(today)}-01`, today);
    case "meta": {
      const shift = currentShift();
      return {
        shop: getShop(),
        synced_at: nowIso(),
        app_version: APP_VERSION,
        open_shift: shift ? { kind: shift.kind, opened_at: shift.opened_at, opened_by: shift.opened_by } : null,
      };
    }
    default:
      return null;
  }
}

async function pushSnapshots(cfg: Config) {
  const queued = all<{ key: string }>("SELECT key FROM snapshot_queue").map((r) => r.key);
  const today = localDate();
  const dayChanged = getMeta("snapshot_day") !== today;
  if (!queued.length && !dayChanged) {
    // still keep the phone's "last seen" fresh every few minutes
    const last = getMeta("meta_pushed_at");
    if (last && Date.now() - Date.parse(last) < 5 * 60_000) return;
  }
  const keys = new Set(queued);
  if (queued.length || dayChanged) {
    for (const k of ["dash:today", "dash:7d", "dash:30d", "dash:month"]) keys.add(k);
    keys.add(`day:${today}`);
  }
  keys.add("meta");

  const list = [...keys];
  for (let i = 0; i < list.length; i += SNAP_BATCH) {
    const chunk = list.slice(i, i + SNAP_BATCH);
    const snapshots = chunk
      .map((key) => ({ key, data: computeSnapshot(key) }))
      .filter((s) => s.data !== null);
    await call(cfg, "/api/sync/push", { method: "POST", body: JSON.stringify({ snapshots }) });
    for (const key of chunk) run("DELETE FROM snapshot_queue WHERE key = $key", { key });
  }
  setMeta("snapshot_day", today);
  setMeta("meta_pushed_at", nowIso());
}

// --- الاستعادة من السحابة | restore everything from the cloud ----------------

type PullPage = { rows: { id: string; data: Record<string, unknown> }[]; next: string | null };

export async function restoreFromCloud(urlIn: string, tokenIn: string): Promise<{ rows: number }> {
  const cfg = { url: normalizeUrl(urlIn), token: tokenIn.trim() };
  await call(cfg, "/api/sync/ping");

  const target = dbPath();
  const tmp = `${target}.restore-${Date.now()}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const fresh = new DatabaseSync(tmp);
  let count = 0;
  try {
    fresh.exec("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = DELETE;");
    for (const m of MIGRATIONS) fresh.exec(m);
    fresh.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);

    for (const tbl of SYNCED_TABLES) {
      const cols = (fresh.prepare(`PRAGMA table_info(${tbl})`).all() as { name: string }[]).map((c) => c.name);
      let after: string | null = "";
      while (after !== null) {
        const page: PullPage = await call<PullPage>(
          cfg,
          `/api/sync/pull?tbl=${tbl}&after=${encodeURIComponent(after)}`
        );
        fresh.exec("BEGIN");
        for (const r of page.rows) {
          const keys = cols.filter((c) => c in r.data);
          const sql = `INSERT OR REPLACE INTO ${tbl} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
          fresh.prepare(sql).run(...keys.map((k) => r.data[k] as never));
          count++;
        }
        fresh.exec("COMMIT");
        after = page.next;
      }
    }
    fresh.exec("DELETE FROM sync_outbox; DELETE FROM snapshot_queue;");
    const fk = fresh.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) throw new Error(`بيانات السحابة غير مكتملة (${fk.length})`);
  } catch (e) {
    fresh.close();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fresh.close();
  if (count === 0) {
    fs.rmSync(tmp, { force: true });
    fail("لا توجد بيانات في السحابة لاستعادتها");
  }

  // احتفظ بنسخة من الحالي ثم بدّل الملفات | back up current data, then swap
  const keep = keepLocalConfig();
  const hasData = fs.existsSync(target);
  if (hasData) await makeBackup("before-restore");
  closeDb();
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(target + ext, { force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(tmp, target);
  db();
  restoreLocalConfig(keep);
  setMeta("cloud_url", cfg.url);
  setMeta("sync_token", cfg.token);
  setMeta("last_sync_at", nowIso());
  // Rebuild the phone's reports from the restored data.
  for (const d of activeDates()) queueSnapshotsForDate(d);
  queueSnapshot("stock");
  return { rows: count };
}
