import { NextResponse, type NextRequest } from "next/server";
import { sb, syncTokenOk } from "@/lib/cloud/store";
import { IS_DESKTOP } from "@/lib/runtime";

// اختبار الربط | the laptop checks its URL + token before syncing.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (IS_DESKTOP) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!process.env.SYNC_TOKEN) return NextResponse.json({ error: "SYNC_TOKEN not set" }, { status: 503 });
  if (!syncTokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { count, error } = await sb().from("cloud_rows").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: count ?? 0 });
}
