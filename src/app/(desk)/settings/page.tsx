import { redirect } from "next/navigation";
import { getMeta } from "@/lib/db/sqlite";
import { APP_VERSION } from "@/lib/runtime";
import { backupDir, extraBackupDir, listBackups } from "@/lib/server/backup";
import { getShop } from "@/lib/server/shop";
import { DEFAULT_CLOUD_URL, syncStatus } from "@/lib/server/sync";
import { getSession } from "@/lib/session";
import Settings from "./Settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSession();
  if (s?.role !== "admin") redirect("/");
  const sync = syncStatus();
  return (
    <Settings
      shop={getShop()}
      version={APP_VERSION}
      backup={{
        dir: backupDir(),
        extraDir: extraBackupDir(),
        last: getMeta("last_backup_at"),
        lastError: getMeta("last_backup_error"),
        files: listBackups(),
      }}
      sync={{ ...sync, url: sync.url ?? DEFAULT_CLOUD_URL }}
    />
  );
}
