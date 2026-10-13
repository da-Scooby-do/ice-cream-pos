import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanPerms, type Perm, type Role } from "../perms";

// السحابة | the cloud copy (Supabase), used only on Vercel.
//
//   cloud_rows       — a row-for-row copy of the laptop's tables (the backup)
//   cloud_snapshots  — ready-made reports for the owner's phone
//
// Both are written only by /api/sync with the laptop's sync token, and read
// only server-side with the secret key. The browser never touches Supabase.

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function cloudSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim();
  if (explicit) return explicit;
  return crypto
    .createHmac("sha256", required("SUPABASE_SERVICE_ROLE_KEY"))
    .update("jac-ice-pos:cloud-session:v2")
    .digest("base64url");
}

/** تحقق من رمز الربط | check the laptop's sync token (constant-time) */
export function syncTokenOk(header: string | null): boolean {
  const expected = process.env.SYNC_TOKEN?.trim();
  if (!expected || expected.length < 16 || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "").trim();
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export type CloudStaff = {
  id: string;
  name: string;
  role: Role;
  perms: Perm[];
  pin_hash: string;
};

type StaffData = {
  id: string;
  name: string;
  role: Role;
  perms: string;
  pin_hash: string;
  active: number;
  deleted: number;
};

function toStaff(d: StaffData): CloudStaff | null {
  if (!d || !d.active || d.deleted) return null;
  let perms: Perm[] = [];
  try {
    perms = cleanPerms(JSON.parse(d.perms));
  } catch {
    perms = [];
  }
  return { id: d.id, name: d.name, role: d.role, perms, pin_hash: d.pin_hash };
}

export async function cloudStaffAll(): Promise<CloudStaff[]> {
  const { data, error } = await sb().from("cloud_rows").select("data").eq("tbl", "staff").eq("deleted", false);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toStaff(r.data as StaffData)).filter((s): s is CloudStaff => !!s);
}

export async function cloudStaffById(id: string): Promise<CloudStaff | null> {
  const { data, error } = await sb()
    .from("cloud_rows")
    .select("data")
    .eq("tbl", "staff")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toStaff(data.data as StaffData) : null;
}

export async function getSnapshot<T>(key: string): Promise<{ data: T; updated_at: string } | null> {
  const { data, error } = await sb().from("cloud_snapshots").select("data, updated_at").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { data: data.data as T, updated_at: data.updated_at as string } : null;
}

export async function listSnapshotKeys(prefix: string): Promise<string[]> {
  const { data, error } = await sb()
    .from("cloud_snapshots")
    .select("key")
    .like("key", `${prefix}%`)
    .order("key", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.key as string);
}

// --- محاولات الدخول الخاطئة | wrong-PIN throttle (per IP) --------------------

const WINDOW_MIN = 10;
const MAX_FAILS = 8;

export async function tooManyFailures(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await sb()
    .from("login_failures")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("at", since);
  if (error) throw new Error(error.message);
  return (count ?? 0) >= MAX_FAILS;
}

export async function recordFailure(ip: string) {
  await sb().from("login_failures").insert({ ip });
}
