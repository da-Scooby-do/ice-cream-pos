import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { MIGRATIONS } from "../db/schema";
import { closeDb, dataDir, db, dbPath, getMeta, nowIso, setMeta } from "../db/sqlite";
import { fail } from "./errors";
import { queueFullSync } from "./sync";

// النسخ الاحتياطي | backups.
//
//   1. On this laptop: a full copy of the database every 12 hours, after every
//      shift close, and on demand — kept in Documents\JAC ICE Backups,
//      gzip-compressed (a year of sales is ~5× smaller).
//   2. Optionally mirrored to a second folder (a USB stick, OneDrive…).
//   3. In the cloud: every change is copied up by the sync (see sync.ts), so a
//      brand-new laptop can be restored from the internet.

const AUTO_EVERY_MS = 12 * 60 * 60 * 1000;
const FILE = /^jac-ice-(\d{4}-\d{2}-\d{2})_.*\.db(\.gz)?$/;

export function backupDir(): string {
  return process.env.POS_BACKUP_DIR || path.join(dataDir(), "backups");
}

export function extraBackupDir(): string | null {
  return getMeta("backup_extra_dir");
}

function stampName(reason: string): string {
  const t = new Date(Date.now() + 2 * 3600_000).toISOString(); // Khartoum
  const s = t.slice(0, 19).replace("T", "_").replace(/:/g, "-");
  return `jac-ice-${s}-${reason}.db.gz`;
}

/**
 * ما يُحتفظ به | what is kept: the 8 newest copies, the newest copy of each
 * of the last 30 days, and the newest copy of each of the last 24 months.
 */
export function pruneList(names: string[]): string[] {
  const files = names.filter((f) => FILE.test(f)).sort().reverse();
  const keep = new Set(files.slice(0, 8));
  const days = new Set<string>();
  const months = new Set<string>();
  for (const f of files) {
    const day = FILE.exec(f)![1];
    if (!days.has(day) && days.size < 30) {
      days.add(day);
      keep.add(f);
    }
    if (!months.has(day.slice(0, 7)) && months.size < 24) {
      months.add(day.slice(0, 7));
      keep.add(f);
    }
  }
  return files.filter((f) => !keep.has(f));
}

function prune(dir: string) {
  try {
    for (const f of pruneList(fs.readdirSync(dir))) fs.rmSync(path.join(dir, f), { force: true });
  } catch {
    /* folder vanished — nothing to prune */
  }
}

export type BackupResult = { file: string; size: number; extra: string | null; extraError: string | null };

let queue: Promise<unknown> = Promise.resolve();

/**
 * نسخة احتياطية | make a backup. The snapshot is taken at once (VACUUM INTO);
 * compressing and copying to the USB stick run in the background threads, so
 * the till never freezes. Backups run one at a time.
 */
export function makeBackup(reason: "auto" | "manual" | "shift" | "before-restore"): Promise<BackupResult> {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, stampName(reason));
  const raw = `${file}.tmp-${process.pid}-${Date.now()}`;
  // VACUUM INTO writes a consistent, compact copy while the app keeps running.
  db().exec(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
  setMeta("last_backup_at", nowIso());

  const job = queue.then(async (): Promise<BackupResult> => {
    try {
      await pipeline(fs.createReadStream(raw), zlib.createGzip({ level: 6 }), fs.createWriteStream(file));
    } finally {
      fs.rmSync(raw, { force: true });
    }
    const size = fs.statSync(file).size;
    prune(dir);

    let extra: string | null = null;
    let extraError: string | null = null;
    const extraDir = extraBackupDir();
    if (extraDir) {
      try {
        if (!fs.existsSync(extraDir)) throw new Error("المجلد غير متصل");
        const target = path.join(extraDir, path.basename(file));
        await fs.promises.copyFile(file, target);
        prune(extraDir);
        extra = target;
      } catch (e) {
        extraError = (e as Error).message;
      }
    }
    setMeta("last_backup_error", extraError);
    return { file, size, extra, extraError };
  });
  queue = job.catch(() => undefined);
  return job;
}

export function autoBackupIfDue() {
  // nothing worth saving before the first admin exists
  const staff = db().prepare("SELECT COUNT(*) AS n FROM staff").get() as { n: number };
  if (!Number(staff.n)) return;
  const last = getMeta("last_backup_at");
  if (last && Date.now() - Date.parse(last) < AUTO_EVERY_MS) return;
  void makeBackup("auto").catch((e) => console.error("[backup]", e));
}

export type BackupFile = { name: string; path: string; size: number; at: string };

export function listBackups(): BackupFile[] {
  const dir = backupDir();
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => FILE.test(f))
      .sort()
      .reverse()
      .slice(0, 30)
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, path: path.join(dir, f), size: st.size, at: st.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

/** تأكد أن الملف نسخة احتياطية صالحة من هذا البرنامج */
function assertBackupFile(file: string) {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  let probe: import("node:sqlite").DatabaseSync | null = null;
  try {
    probe = new DatabaseSync(file, { readOnly: true });
    const v = Number((probe.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    const t = probe.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('staff', 'orders', 'shop')").get() as {
      n: number;
    };
    if (v < 1 || v > MIGRATIONS.length || Number(t.n) < 3) throw new Error("not ours");
    const check = probe.prepare("PRAGMA quick_check").get() as Record<string, string>;
    if (Object.values(check)[0] !== "ok") throw new Error("corrupt");
  } catch {
    fail("هذا الملف ليس نسخة احتياطية صالحة من البرنامج");
  } finally {
    probe?.close();
  }
}

/**
 * استعادة من ملف | replace the database with a backup file (.db.gz, or an
 * older uncompressed .db). The current data is backed up first, so a restore
 * can itself be undone.
 */
export async function restoreFromFile(file: string) {
  const src = path.resolve(file);
  if (src === path.resolve(dbPath())) fail("اختر ملف نسخة احتياطية، وليس قاعدة البيانات الحالية");
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) fail("الملف غير موجود");

  // فك الضغط إلى ملف مؤقت | unpack next to the database first
  const tmp = `${dbPath()}.incoming-${Date.now()}`;
  try {
    const head = Buffer.alloc(2);
    const fd = fs.openSync(src, "r");
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (head[0] === 0x1f && head[1] === 0x8b) {
      await pipeline(fs.createReadStream(src), zlib.createGunzip(), fs.createWriteStream(tmp)).catch(() =>
        fail("هذا الملف ليس نسخة احتياطية صالحة من البرنامج")
      );
    } else {
      await fs.promises.copyFile(src, tmp);
    }
    assertBackupFile(tmp);

    const keep = keepLocalConfig();
    await makeBackup("before-restore");

    closeDb();
    const target = dbPath();
    for (const ext of ["-wal", "-shm"]) fs.rmSync(target + ext, { force: true });
    fs.renameSync(tmp, target);
    db(); // reopen + apply any newer migrations
    restoreLocalConfig(keep);
    // The restored rows become the truth: send them all to the cloud again.
    requeueEverything();
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// --- إعدادات هذا الجهاز تبقى بعد الاستعادة | keep this laptop's own settings ---

const LOCAL_KEYS = ["cloud_url", "sync_token", "backup_extra_dir", "session_secret"];

export function keepLocalConfig(): Record<string, string | null> {
  return Object.fromEntries(LOCAL_KEYS.map((k) => [k, getMeta(k)]));
}

export function restoreLocalConfig(saved: Record<string, string | null>) {
  for (const [k, v] of Object.entries(saved)) if (v !== null) setMeta(k, v);
}

/** ضع كل الصفوف في طابور الرفع | queue every row (and report) for upload */
export function requeueEverything() {
  queueFullSync();
}
