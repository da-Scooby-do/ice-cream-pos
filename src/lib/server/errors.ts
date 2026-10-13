// أخطاء تظهر للمستخدم كما هي | errors whose message is shown to the user.
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** شغّل إجراءً وأعد نتيجة آمنة للعرض | run an action, never leak internals */
export async function act<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}

// --- قراءة المدخلات بأمان | input parsing -----------------------------------

export function text(v: unknown, label: string, { max = 80, required = true } = {}): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (required && !s) fail(`${label} مطلوب`);
  if (s.length > max) fail(`${label} طويل جداً (الحد ${max} حرفاً)`);
  return s;
}

export function optText(v: unknown, label: string, max = 200): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) fail(`${label} طويل جداً (الحد ${max} حرفاً)`);
  return s || null;
}

export function amount(
  v: unknown,
  label: string,
  { min = 0, max = 1_000_000_000, allowZero = true }: { min?: number; max?: number; allowZero?: boolean } = {}
): number {
  const x = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  if (!Number.isFinite(x)) fail(`${label} يجب أن يكون رقماً`);
  if (!allowZero && x === 0) fail(`${label} يجب أن يكون أكبر من صفر`);
  if (x < min) fail(`${label} لا يمكن أن يكون أقل من ${min}`);
  if (x > max) fail(`${label} كبير جداً`);
  return Math.round(x * 1000) / 1000;
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], label: string): T {
  if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
  fail(`${label} غير صحيح`);
}

export function id(v: unknown, label = "المعرّف"): string {
  if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) return v;
  fail(`${label} غير صحيح`);
}
