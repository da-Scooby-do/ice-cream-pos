import { autoBackupIfDue } from "./backup";
import { syncNow } from "./sync";

// مهام الخلفية | background jobs (desktop only).
export function startJobs() {
  if (process.env.POS_RUNTIME !== "desktop") return;
  const g = globalThis as unknown as { __posJobs?: boolean };
  if (g.__posJobs) return;
  g.__posJobs = true;

  const tick = async () => {
    try {
      autoBackupIfDue();
    } catch (e) {
      console.error("[backup]", e);
    }
    try {
      await syncNow();
    } catch (e) {
      console.error("[sync]", e);
    }
  };
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
}
