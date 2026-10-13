// الصلاحيات | permissions.
//
// Two roles. An admin (مدير) can do everything, always. A staff member
// (موظف) can do exactly what the admin has ticked for them — nothing more.
// Managing staff, settings and backups is admin-only.

export const PERMS = [
  { key: "sell", label: "البيع وفتح وتقفيل الوردية", hint: "شاشة الكاشير" },
  { key: "void", label: "إلغاء الفواتير", hint: "فواتير الوردية المفتوحة فقط" },
  { key: "sales", label: "عرض سجل المبيعات", hint: "كل الفواتير السابقة" },
  { key: "reports", label: "عرض لوحة التحكم والكشوفات", hint: "الأرباح، الأكثر مبيعاً، الكشف الشهري" },
  { key: "expenses", label: "تسجيل المصروفات والإيرادات", hint: "مثل الكهرباء والثلج والمشتريات" },
  { key: "stock_add", label: "إضافة توريد للمخزون", hint: "استلام بضاعة جديدة" },
  { key: "stock_edit", label: "جرد وتعديل المخزون", hint: "تعديل الكمية الموجودة" },
  { key: "products", label: "إدارة الأصناف والأسعار", hint: "إضافة وتعديل الأصناف والنكهات" },
] as const;

export type Perm = (typeof PERMS)[number]["key"];
export type Role = "admin" | "staff";

export const PERM_KEYS = PERMS.map((p) => p.key) as Perm[];
export const DEFAULT_STAFF_PERMS: Perm[] = ["sell", "expenses"];

export const ROLE_LABEL: Record<Role, string> = { admin: "مدير", staff: "موظف" };

export function cleanPerms(input: unknown): Perm[] {
  const arr = Array.isArray(input) ? input : [];
  return PERM_KEYS.filter((k) => arr.includes(k));
}

export type Who = { role: Role; perms: Perm[] };

export function can(who: Who | null | undefined, perm: Perm | "admin"): boolean {
  if (!who) return false;
  if (who.role === "admin") return true;
  if (perm === "admin") return false;
  return who.perms.includes(perm);
}

export function canAny(who: Who | null | undefined, perms: (Perm | "admin")[]): boolean {
  return perms.some((p) => can(who, p));
}
