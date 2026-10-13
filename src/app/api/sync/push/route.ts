import { NextResponse, type NextRequest } from "next/server";
import { sb, syncTokenOk } from "@/lib/cloud/store";
import { SYNCED_TABLES } from "@/lib/db/schema";
import { IS_DESKTOP } from "@/lib/runtime";

// استقبال التغييرات من اللابتوب | receive rows and report snapshots from the laptop.

export const dynamic = "force-dynamic";

type Row = { tbl: string; id: string; data: Record<string, unknown> | null };
type Snap = { key: string; data: unknown };

const TABLES = new Set<string>(SYNCED_TABLES);
const KEY = /^(day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2}|stockmonth:\d{4}-\d{2}|stock|meta|dash:(today|7d|30d|month))$/;

export async function POST(req: NextRequest) {
  if (IS_DESKTOP) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!process.env.SYNC_TOKEN) return NextResponse.json({ error: "SYNC_TOKEN not set" }, { status: 503 });
  if (!syncTokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { rows?: Row[]; snapshots?: Snap[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const snaps = Array.isArray(body.snapshots) ? body.snapshots : [];
  if (rows.length > 1000 || snaps.length > 50) return NextResponse.json({ error: "batch too large" }, { status: 413 });

  const now = new Date().toISOString();
  if (rows.length) {
    const clean = rows
      .filter((r) => r && TABLES.has(r.tbl) && typeof r.id === "string" && r.id.length <= 64)
      .map((r) => ({
        tbl: r.tbl,
        id: r.id,
        data: r.data && typeof r.data === "object" ? r.data : null,
        deleted: !r.data,
        updated_at: now,
      }));
    const { error } = await sb().from("cloud_rows").upsert(clean, { onConflict: "tbl,id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (snaps.length) {
    const clean = snaps
      .filter((s) => s && typeof s.key === "string" && KEY.test(s.key) && s.data !== undefined)
      .map((s) => ({ key: s.key, data: s.data, updated_at: now }));
    const { error } = await sb().from("cloud_snapshots").upsert(clean, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: rows.length, snapshots: snaps.length });
}
