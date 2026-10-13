import { NextResponse, type NextRequest } from "next/server";
import { sb, syncTokenOk } from "@/lib/cloud/store";
import { SYNCED_TABLES } from "@/lib/db/schema";
import { IS_DESKTOP } from "@/lib/runtime";

// تنزيل النسخة السحابية (للاستعادة على لابتوب جديد) | page through the backup.

export const dynamic = "force-dynamic";
const PAGE = 500;

export async function GET(req: NextRequest) {
  if (IS_DESKTOP) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!process.env.SYNC_TOKEN) return NextResponse.json({ error: "SYNC_TOKEN not set" }, { status: 503 });
  if (!syncTokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tbl = req.nextUrl.searchParams.get("tbl") ?? "";
  const after = req.nextUrl.searchParams.get("after") ?? "";
  if (!(SYNCED_TABLES as readonly string[]).includes(tbl)) {
    return NextResponse.json({ error: "bad table" }, { status: 400 });
  }
  const { data, error } = await sb()
    .from("cloud_rows")
    .select("id, data")
    .eq("tbl", tbl)
    .eq("deleted", false)
    .gt("id", after)
    .order("id")
    .limit(PAGE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  return NextResponse.json({ rows, next: rows.length === PAGE ? rows[rows.length - 1].id : null });
}
