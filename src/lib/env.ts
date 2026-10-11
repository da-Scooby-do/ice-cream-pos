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
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
};
