import { all, get, nowIso, run } from "../db/sqlite";
import type { Shop } from "../types";
import { amount, optText, text } from "./errors";

// بيانات المحل | the shop profile printed on every slip.

export const DEFAULT_SHOP: Shop = {
  name: "JAC ICE",
  phone: null,
  address: null,
  footer: "شكراً لزيارتكم 🍦",
  scoop_grams: 60,
};

export function getShop(): Shop {
  const r = get<Shop>("SELECT name, phone, address, footer, scoop_grams FROM shop WHERE id = 'shop'");
  return r ? { ...r, scoop_grams: Number(r.scoop_grams) } : DEFAULT_SHOP;
}

export function saveShop(input: Record<string, unknown>): Shop {
  const shop: Shop = {
    name: text(input.name, "اسم المحل", { max: 60 }),
    phone: optText(input.phone, "رقم الهاتف", 40),
    address: optText(input.address, "العنوان", 120),
    footer: optText(input.footer, "تذييل الفاتورة", 300),
    scoop_grams: amount(input.scoop_grams, "وزن البولة", { min: 1, max: 1000, allowZero: false }),
  };
  run(
    `INSERT INTO shop (id, name, phone, address, footer, scoop_grams, updated_at)
     VALUES ('shop', $name, $phone, $address, $footer, $scoop_grams, $now)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, phone = excluded.phone, address = excluded.address,
       footer = excluded.footer, scoop_grams = excluded.scoop_grams, updated_at = excluded.updated_at`,
    { ...shop, now: nowIso() }
  );
  return shop;
}

/** هل البرنامج جديد بدون مدير؟ | first run: no admin yet */
export function needsSetup(): boolean {
  const r = get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin' AND deleted = 0");
  return !r || Number(r.n) === 0;
}

/** أسماء الفئات المستخدمة | categories in use, for suggestions */
export function categories(): string[] {
  return all<{ category: string }>(
    "SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category"
  ).map((r) => r.category);
}
