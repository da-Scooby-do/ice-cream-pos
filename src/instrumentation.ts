// مهام الخلفية على اللابتوب | background jobs on the laptop:
// a backup every 12 hours and a cloud sync every minute (when online).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobs } = await import("./lib/server/jobs");
    startJobs();
  }
}
