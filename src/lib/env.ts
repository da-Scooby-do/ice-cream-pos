import crypto from "node:crypto";

// متغيرات البيئة | environment variables, validated once at boot.
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `المتغير ${name} غير موجود. أضفه في ملف .env.local أو في إعدادات Vercel.`
    );
  }
  return v;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  // SESSION_SECRET is optional: when unset, a dedicated signing key is
  // derived from the Supabase secret key, so there is one fewer secret to
  // manage. Rotating the Supabase key then signs everyone out.
  get sessionSecret() {
    const explicit = process.env.SESSION_SECRET?.trim();
    if (explicit) return explicit;
    return crypto
      .createHmac("sha256", required("SUPABASE_SERVICE_ROLE_KEY"))
      .update("ice-cream-pos:session-signing:v1")
      .digest("base64url");
  },
};
