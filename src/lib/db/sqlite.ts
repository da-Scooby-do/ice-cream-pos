import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import { MIGRATIONS } from "./schema";

// قاعدة البيانات المحلية | the laptop's database.
//
// SQLite is built into the Node runtime that ships inside Electron, so there
// is no native module to compile and nothing to install on the laptop.
// WAL + synchronous=FULL: a sale that returned "saved" survives a crash or
// a pulled power cable.

type Params = Record<string, unknown> | unknown[] | undefined;

const g = globalThis as unknown as {
  __posDb?: DatabaseSync;
  __posStmts?: Map<string, StatementSync>;
};

export function dataDir(): string {
  const dir = process.env.POS_DATA_DIR;
  if (!dir) throw new Error("POS_DATA_DIR is not set (desktop mode only).");
  return path.resolve(dir);
}

export function dbPath(): string {
  return path.join(dataDir(), "pos.db");
}

function open(): DatabaseSync {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  // getBuiltinModule keeps the bundler from trying to resolve node:sqlite.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(dbPath());
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let v = Number(row.user_version);
  while (v < MIGRATIONS.length) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[v]);
      v += 1;
      db.exec(`PRAGMA user_version = ${v}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function db(): DatabaseSync {
  if (!g.__posDb) {
    g.__posDb = open();
    g.__posStmts = new Map();
  }
  return g.__posDb;
}

/** أغلق القاعدة (قبل الاستعادة من نسخة) | close, e.g. before a restore */
export function closeDb() {
  if (g.__posDb) {
    try {
      g.__posDb.close();
    } catch {
      /* already closed */
    }
  }
  g.__posDb = undefined;
  g.__posStmts = new Map();
}

function stmt(sql: string): StatementSync {
  const d = db();
  let s = g.__posStmts!.get(sql);
  if (!s) {
    s = d.prepare(sql);
    g.__posStmts!.set(sql, s);
  }
  return s;
}

function norm(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string" || typeof v === "bigint") return v;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

const namesCache = new Map<string, Set<string>>();

/** Named parameters the statement actually uses — SQLite rejects extras. */
function paramNames(sql: string): Set<string> {
  let names = namesCache.get(sql);
  if (!names) {
    names = new Set([...sql.matchAll(/[$:@]([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    namesCache.set(sql, names);
  }
  return names;
}

function bind(sql: string, params: Params): [Record<string, SQLInputValue>] | SQLInputValue[] {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params.map(norm);
  const used = paramNames(sql);
  const o: Record<string, SQLInputValue> = {};
  for (const [k, v] of Object.entries(params)) if (used.has(k)) o[k] = norm(v);
  return [o];
}

export function all<T = Record<string, unknown>>(sql: string, params?: Params): T[] {
  return stmt(sql).all(...(bind(sql, params) as SQLInputValue[])) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, params?: Params): T | undefined {
  return stmt(sql).get(...(bind(sql, params) as SQLInputValue[])) as T | undefined;
}

export function run(sql: string, params?: Params) {
  return stmt(sql).run(...(bind(sql, params) as SQLInputValue[]));
}

let depth = 0;

/** معاملة واحدة: كل شيء أو لا شيء | all-or-nothing. Nested calls join the outer one. */
export function tx<T>(fn: () => T): T {
  const d = db();
  if (depth > 0) return fn();
  d.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

// --- إعدادات الجهاز | local key/value config -------------------------------

export function getMeta(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM meta WHERE key = $key", { key })?.value ?? null;
}

export function setMeta(key: string, value: string | null) {
  if (value === null) run("DELETE FROM meta WHERE key = $key", { key });
  else
    run(
      "INSERT INTO meta (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      { key, value }
    );
}
