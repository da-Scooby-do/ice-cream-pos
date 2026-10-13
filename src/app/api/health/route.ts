import { NextResponse } from "next/server";
import { APP_VERSION, IS_DESKTOP } from "@/lib/runtime";

// فحص التشغيل | Electron waits for this before showing the window.
export const dynamic = "force-dynamic";

export async function GET() {
  if (IS_DESKTOP) {
    const { db } = await import("@/lib/db/sqlite");
    db(); // opens the database and applies migrations
  }
  return NextResponse.json({ ok: true, runtime: IS_DESKTOP ? "desktop" : "cloud", version: APP_VERSION });
}
