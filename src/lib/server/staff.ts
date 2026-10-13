import { all, get, nowIso, run, tx, uid } from "../db/sqlite";
import { cleanPerms, DEFAULT_STAFF_PERMS, type Perm, type Role } from "../perms";
import { hashPin, validPin, verifyPin } from "../pin";
import type { StaffRow } from "../types";
import { fail, oneOf, text } from "./errors";

// الموظفون | staff accounts.

type Raw = {
  id: string;
  name: string;
  pin_hash: string;
  role: Role;
  perms: string;
  active: number;
  created_at: string;
};

function toRow(r: Raw): StaffRow {
  let perms: Perm[] = [];
  try {
    perms = cleanPerms(JSON.parse(r.perms));
  } catch {
    perms = [];
  }
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    perms,
    active: !!r.active,
    created_at: r.created_at,
  };
}

export function listStaff(): StaffRow[] {
  return all<Raw>(
    "SELECT * FROM staff WHERE deleted = 0 ORDER BY role = 'admin' DESC, name"
  ).map(toRow);
}

export function staffById(id: string): StaffRow | null {
  const r = get<Raw>("SELECT * FROM staff WHERE id = $id AND deleted = 0", { id });
  return r ? toRow(r) : null;
}

/** ابحث عن صاحب الرقم السري | who owns this PIN? (active accounts only) */
export async function findByPin(pin: string): Promise<StaffRow | null> {
  const rows = all<Raw>("SELECT * FROM staff WHERE deleted = 0 AND active = 1");
  for (const r of rows) {
    if (await verifyPin(pin, r.pin_hash)) return toRow(r);
  }
  return null;
}

/** الرقم السري يجب أن يكون فريداً، لأنه يحدد الشخص عند الدخول */
async function assertPinFree(pin: string, exceptId: string | null) {
  const rows = all<Raw>("SELECT * FROM staff WHERE deleted = 0");
  for (const r of rows) {
    if (r.id === exceptId) continue;
    if (await verifyPin(pin, r.pin_hash)) fail("هذا الرقم السري مستخدم لموظف آخر — اختر رقماً مختلفاً");
  }
}

function assertNameFree(name: string, exceptId: string | null) {
  const clash = get<{ id: string }>(
    "SELECT id FROM staff WHERE deleted = 0 AND name = $name AND id <> $id",
    { name, id: exceptId ?? "" }
  );
  if (clash) fail("يوجد موظف بنفس الاسم");
}

function activeAdmins(): number {
  return Number(
    get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin' AND active = 1 AND deleted = 0")?.n ?? 0
  );
}

export async function createStaff(input: {
  name: unknown;
  pin: unknown;
  role: unknown;
  perms?: unknown;
}): Promise<StaffRow> {
  const name = text(input.name, "الاسم", { max: 40 });
  const role = oneOf(input.role, ["admin", "staff"] as const, "الدور");
  if (!validPin(input.pin)) fail("الرقم السري يجب أن يكون من 4 إلى 8 أرقام");
  const pin = input.pin as string;
  const perms = role === "admin" ? [] : input.perms === undefined ? DEFAULT_STAFF_PERMS : cleanPerms(input.perms);

  assertNameFree(name, null);
  await assertPinFree(pin, null);
  const hash = await hashPin(pin);

  const id = uid();
  const now = nowIso();
  run(
    `INSERT INTO staff (id, name, pin_hash, role, perms, active, deleted, created_at, updated_at)
     VALUES ($id, $name, $hash, $role, $perms, 1, 0, $now, $now)`,
    { id, name, hash, role, perms: JSON.stringify(perms), now }
  );
  return staffById(id)!;
}

export async function updateStaff(
  actorId: string,
  input: { id: unknown; name: unknown; role: unknown; perms: unknown; active: unknown; pin?: unknown }
): Promise<StaffRow> {
  const id = typeof input.id === "string" ? input.id : fail("الموظف غير موجود");
  const cur = staffById(id) ?? fail("الموظف غير موجود");
  const name = text(input.name, "الاسم", { max: 40 });
  const role = oneOf(input.role, ["admin", "staff"] as const, "الدور");
  const active = input.active !== false;
  const perms = role === "admin" ? [] : cleanPerms(input.perms);

  if (id === actorId && (role !== "admin" || !active)) {
    fail("لا يمكنك إلغاء صلاحية المدير أو إيقاف حسابك أنت");
  }
  if (cur.role === "admin" && cur.active && (role !== "admin" || !active) && activeAdmins() <= 1) {
    fail("يجب أن يبقى مدير واحد نشط على الأقل");
  }
  assertNameFree(name, id);

  let hash: string | null = null;
  if (input.pin !== undefined && input.pin !== "") {
    if (!validPin(input.pin)) fail("الرقم السري يجب أن يكون من 4 إلى 8 أرقام");
    await assertPinFree(input.pin as string, id);
    hash = await hashPin(input.pin as string);
  }

  run(
    `UPDATE staff SET name = $name, role = $role, perms = $perms, active = $active,
       pin_hash = COALESCE($hash, pin_hash), updated_at = $now
     WHERE id = $id`,
    { id, name, role, perms: JSON.stringify(perms), active, hash, now: nowIso() }
  );
  return staffById(id)!;
}

/** حذف موظف: يختفي من القائمة وتبقى فواتيره باسمه | archive, keep history */
export function deleteStaff(actorId: string, id: string) {
  tx(() => {
    const cur = staffById(id) ?? fail("الموظف غير موجود");
    if (id === actorId) fail("لا يمكنك حذف حسابك أنت");
    if (cur.role === "admin" && cur.active && activeAdmins() <= 1) fail("يجب أن يبقى مدير واحد نشط على الأقل");
    run("UPDATE staff SET deleted = 1, active = 0, updated_at = $now WHERE id = $id", { id, now: nowIso() });
  });
}

export async function changeOwnPin(staffId: string, current: unknown, next: unknown) {
  const row = get<Raw>("SELECT * FROM staff WHERE id = $id AND deleted = 0", { id: staffId }) ?? fail("الحساب غير موجود");
  if (typeof current !== "string" || !(await verifyPin(current, row.pin_hash))) fail("الرقم السري الحالي غير صحيح");
  if (!validPin(next)) fail("الرقم السري الجديد يجب أن يكون من 4 إلى 8 أرقام");
  await assertPinFree(next as string, staffId);
  const hash = await hashPin(next as string);
  run("UPDATE staff SET pin_hash = $hash, updated_at = $now WHERE id = $id", { id: staffId, hash, now: nowIso() });
}
