import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "./env";
import { db } from "./supabase";
import type { Role } from "./types";

// جلسة الكاشير | cashier session.
// A PIN keypad is the right login for a counter — no email, no password
// typing. The session is a cookie signed with HMAC-SHA256, so it cannot
// be forged client-side, and it is httpOnly so scripts cannot read it.

const COOKIE = "pos_session";
const MAX_AGE = 60 * 60 * 16; // 16 ساعة — تكفي الوردية | covers a long shift

export type Session = {
  staffId: string;
  name: string;
  role: Role;
  at: number;
};

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", env.sessionSecret)
    .update(payload)
    .digest("base64url");
}

function serialize(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function deserialize(token: string): Session | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload);

  // timing-safe compare
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (Date.now() - s.at > MAX_AGE * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function setSession(s: Omit<Session, "at">): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, serialize({ ...s, at: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  const s = raw ? deserialize(raw) : null;
  if (!s) return null;

  // The cookie proves who signed in; the database decides what they may do
  // *now*. A deactivated account is signed out on its next request, and a
  // role or name change applies immediately — not after the cookie expires.
  const { data, error } = await db()
    .from("staff")
    .select("name,role,is_active")
    .eq("id", s.staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.is_active) return null;

  return { ...s, name: data.name, role: data.role as Role };
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** يرمي خطأ إذا لم يكن هناك تسجيل دخول | throws unless signed in. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  return s;
}

/** يرمي خطأ إذا لم يكن المستخدم مديراً | manager-only guard. */
export async function requireManager(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "manager") throw new Error("هذه الصفحة للمدير فقط.");
  return s;
}
