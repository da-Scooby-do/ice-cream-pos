"use server";

import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { getMeta, setMeta } from "@/lib/db/sqlite";
import { act, fail } from "@/lib/server/errors";
import { makeBackup, restoreFromFile } from "@/lib/server/backup";
import { clearTestData } from "@/lib/server/reset";
import {
  normalizeUrl,
  queueFullSync,
  restoreFromCloud,
  syncNow,
  syncStatus,
  testCloud,
} from "@/lib/server/sync";
import { requireDesk } from "@/lib/session";

// النسخ الاحتياطي والسحابة | backups & cloud (admin only).

export async function backupNowAction() {
  return act(async () => {
    await requireDesk("admin");
    const r = await makeBackup("manual");
    revalidatePath("/settings");
    return r;
  });
}

/** مسح بيانات التجربة | clear test sales, shifts, money and stock moves (backup first) */
export async function clearTestDataAction(confirm: string) {
  return act(async () => {
    await requireDesk("admin");
    if (confirm.trim() !== "مسح") fail("اكتب كلمة «مسح» للتأكيد");
    const r = await clearTestData();
    revalidatePath("/", "layout");
    return r;
  });
}

export async function setBackupDirAction(dir: string | null) {
  return act(async () => {
    await requireDesk("admin");
    if (dir && !fs.existsSync(dir)) fail("المجلد غير موجود");
    setMeta("backup_extra_dir", dir || null);
    revalidatePath("/settings");
    return null;
  });
}

export async function restoreFileAction(file: string) {
  return act(async () => {
    await requireDesk("admin");
    await restoreFromFile(file);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function saveCloudAction(url: string, token: string) {
  return act(async () => {
    await requireDesk("admin");
    const u = normalizeUrl(url);
    const t = token.trim();
    if (t.length < 16) fail("رمز الربط قصير — يجب أن يكون 16 حرفاً على الأقل");
    await testCloud(u, t);
    const changed = getMeta("cloud_url") !== u || getMeta("sync_token") !== t;
    setMeta("cloud_url", u);
    setMeta("sync_token", t);
    if (changed) queueFullSync(); // first link (or a new cloud): upload everything
    const status = await syncNow();
    revalidatePath("/settings");
    return status;
  });
}

export async function disconnectCloudAction() {
  return act(async () => {
    await requireDesk("admin");
    setMeta("sync_token", null);
    revalidatePath("/settings");
    return null;
  });
}

export async function syncNowAction() {
  return act(async () => {
    await requireDesk("admin");
    const s = await syncNow();
    revalidatePath("/settings");
    return s;
  });
}

export async function syncStatusAction() {
  return act(async () => {
    await requireDesk("admin");
    return syncStatus();
  });
}

export async function restoreCloudAction(url: string, token: string) {
  return act(async () => {
    await requireDesk("admin");
    const r = await restoreFromCloud(url, token);
    revalidatePath("/", "layout");
    return r;
  });
}
