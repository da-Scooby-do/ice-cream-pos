import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cloudSessionSecret, cloudStaffById } from "./cloud/store";
import { getMeta, setMeta } from "./db/sqlite";
import { can, type Perm, type Role, type Who } from "./perms";
import { IS_DESKTOP } from "./runtime";
import { fail } from "./server/errors";
import { staffById } from "./server/staff";

// الجلسة | who is signed in. An httpOnly cookie signed with HMAC-SHA256;
// the account is re-read on every request, so a permission the admin takes
// away is gone on the very next click.

const COOKIE = "jac_session";
const MAX_AGE = 60 * 60 * 16; // 16 ساعة — تكفي وردية طويلة

export type Session = Who & {
  id: string;
  name: string;
  role: Role;
  perms: Perm[];
};

type Token = { id: string; at: number };

function secret(): string {
  if (!IS_DESKTOP) return cloudSessionSecret();
  let s = getMeta("session_secret");
  if (!s) {
    s = crypto.randomBytes(32).toString("base64url");
    setMeta("session_secret", s);
  }
  return s;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

function serialize(t: Token): string {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function deserialize(raw: string): Token | null {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const a = Buffer.from(raw.slice(dot + 1));
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString()) as Token;
    if (typeof t.id !== "string" || Date.now() - t.at > MAX_AGE * 1000) return null;
    return t;
  } catch {
    return null;
  }
}

export async function setSession(staffId: string) {
  const store = await cookies();
  store.set(COOKIE, serialize({ id: staffId, at: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: !IS_DESKTOP && process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const t = raw ? deserialize(raw) : null;
  if (!t) return null;

  if (IS_DESKTOP) {
    const s = staffById(t.id);
    if (!s || !s.active) return null;
    return { id: s.id, name: s.name, role: s.role, perms: s.perms };
  }
  const s = await cloudStaffById(t.id);
  if (!s) return null;
  return { id: s.id, name: s.name, role: s.role, perms: s.perms };
}

export async function requireSession(): Promise<Session> {
  return (await getSession()) ?? fail("انتهت الجلسة — سجّل الدخول مرة أخرى");
}

/** يتطلب صلاحية | require a permission (admins always pass) */
export async function requirePerm(...perms: (Perm | "admin")[]): Promise<Session> {
  const s = await requireSession();
  if (!perms.some((p) => can(s, p))) fail("ليست لديك صلاحية لهذا الإجراء");
  return s;
}

/** إجراءات اللابتوب فقط (السحابة للعرض) | laptop-only actions; the cloud is read-only */
export async function requireDesk(...perms: (Perm | "admin")[]): Promise<Session> {
  if (!IS_DESKTOP) fail("هذه العملية متاحة في برنامج المحل على اللابتوب فقط");
  return perms.length ? requirePerm(...perms) : requireSession();
}
