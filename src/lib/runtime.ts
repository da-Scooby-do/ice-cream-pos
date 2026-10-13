// أين يعمل البرنامج؟ | where is this code running?
//
// One codebase, two homes:
//   • desktop — inside the Electron app on the shop laptop. The full system,
//     with its own SQLite database; works with no internet at all.
//   • cloud   — on Vercel. A read-only window for the owner's phone, fed by
//     what the laptop syncs up, plus the sync endpoint itself.
//
// Electron sets POS_RUNTIME=desktop when it starts the local server.
export const IS_DESKTOP = process.env.POS_RUNTIME === "desktop";
export const IS_CLOUD = !IS_DESKTOP;

export const APP_VERSION = process.env.POS_APP_VERSION || "dev";
