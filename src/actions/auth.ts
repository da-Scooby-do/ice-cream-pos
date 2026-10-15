"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cloudStaffAll, recordFailure, tooManyFailures } from "@/lib/cloud/store";
import { can } from "@/lib/perms";
import { validPin, verifyPin } from "@/lib/pin";
import { IS_DESKTOP } from "@/lib/runtime";
import { act, fail, text } from "@/lib/server/errors";
import { needsSetup, saveShop } from "@/lib/server/shop";
import { createStaff, findByPin } from "@/lib/server/staff";
import { restoreFromFile } from "@/lib/server/backup";
import { restoreFromCloud } from "@/lib/server/sync";
import { clearSession, setSession } from "@/lib/session";

// الدخول بالرقم السري فقط — لا تظهر أسماء | PIN-only sign-in.

const g = globalThis as unknown as { __posFails?: { n: number; until: number } };

export async function loginAction(pin: string) {
  return act(async () => {
    if (!validPin(pin)) fail("الرقم السري من 4 إلى 8 أرقام");

    if (IS_DESKTOP) {
      const f = (g.__posFails ??= { n: 0, until: 0 });
      if (f.until > Date.now()) fail("محاولات خاطئة كثيرة — انتظر دقيقة ثم حاول");
      const s = await findByPin(pin);
      if (!s) {
        f.n += 1;
        if (f.n >= 6) {
          f.until = Date.now() + 60_000;
          f.n = 0;
        }
        fail("الرقم السري غير صحيح");
      }
      f.n = 0;
      await setSession(s.id);
      return { role: s.role, home: s.role === "admin" || s.perms.includes("sell") ? "/pos" : "/" };
    }

    // السحابة: المدير ومن لديه صلاحية التقارير فقط | cloud: report viewers only
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (await tooManyFailures(ip)) fail("محاولات خاطئة كثيرة — حاول بعد 10 دقائق");
    for (const s of await cloudStaffAll()) {
      if (!can(s, "reports")) continue;
      if (await verifyPin(pin, s.pin_hash)) {
        await setSession(s.id);
        return { role: s.role, home: "/m" };
      }
    }
    await recordFailure(ip);
    fail("الرقم السري غير صحيح أو ليست لديك صلاحية عرض التقارير");
  });
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

// --- أول تشغيل | first run ----------------------------------------------------

export async function setupAction(input: { shop_name: string; admin_name: string; pin: string; pin2: string }) {
  return act(async () => {
    if (!IS_DESKTOP || !needsSetup()) fail("تم إعداد البرنامج بالفعل");
    if (input.pin !== input.pin2) fail("الرقمان السريان غير متطابقين");
    saveShop({ name: text(input.shop_name, "اسم المحل", { max: 60 }), scoop_grams: 60, footer: "شكراً لزيارتكم 🍦" });
    const admin = await createStaff({ name: input.admin_name, pin: input.pin, role: "admin" });
    await setSession(admin.id);
    return null;
  });
}

export async function setupRestoreCloudAction(url: string, token: string) {
  return act(async () => {
    if (!IS_DESKTOP || !needsSetup()) fail("تم إعداد البرنامج بالفعل — استخدم الإعدادات");
    return restoreFromCloud(url, token);
  });
}

export async function setupRestoreFileAction(file: string) {
  return act(async () => {
    if (!IS_DESKTOP || !needsSetup()) fail("تم إعداد البرنامج بالفعل — استخدم الإعدادات");
    await restoreFromFile(file);
    return null;
  });
}
