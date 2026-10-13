import { localDate } from "../time";
import { all, get, nowIso, run, tx, uid } from "../db/sqlite";
import { can, type Who } from "../perms";
import type { EntryRow } from "../types";
import { amount, fail, oneOf, optText, text } from "./errors";
import { currentShift } from "./shifts";

// الإيرادات والمصروفات | income & expenses besides sales.
// During a shift an entry belongs to that shift and day; "من الدرج" means
// the cash physically left (or entered) the drawer, so the expected cash at
// closing moves with it.

export function addEntry(
  staffId: string,
  input: { kind: unknown; category: unknown; amount: unknown; note: unknown; drawer: unknown },
  extra: { moneyNote?: string } = {}
): EntryRow {
  const kind = oneOf(input.kind, ["income", "expense"] as const, "النوع");
  const category = text(input.category, "الفئة", { max: 40 });
  const value = amount(input.amount, "المبلغ", { min: 0, allowZero: false });
  const note = extra.moneyNote ?? optText(input.note, "الملاحظة", 200);

  return tx(() => {
    const shift = currentShift();
    const drawer = !!shift && input.drawer !== false;
    const id = uid();
    const now = nowIso();
    run(
      `INSERT INTO money_entries (id, kind, category, amount, note, drawer, shift_id, business_date, staff_id, created_at, updated_at)
       VALUES ($id, $kind, $category, $amount, $note, $drawer, $shift, $date, $staff, $now, $now)`,
      {
        id,
        kind,
        category,
        amount: value,
        note,
        drawer,
        shift: shift?.id ?? null,
        date: shift?.business_date ?? localDate(),
        staff: staffId,
        now,
      }
    );
    return entryById(id)!;
  });
}

export function voidEntry(actor: Who & { id: string }, entryId: string) {
  tx(() => {
    const e =
      get<{ id: string; staff_id: string; voided_at: string | null; closed_at: string | null; shift_id: string | null }>(
        `SELECT m.id, m.staff_id, m.voided_at, m.shift_id, s.closed_at
         FROM money_entries m LEFT JOIN shifts s ON s.id = m.shift_id WHERE m.id = $id`,
        { id: entryId }
      ) ?? fail("القيد غير موجود");
    if (e.voided_at) fail("القيد ملغى بالفعل");
    if (actor.role !== "admin") {
      if (!can(actor, "expenses")) fail("ليست لديك صلاحية");
      if (e.staff_id !== actor.id || !e.shift_id || e.closed_at) {
        fail("يمكنك إلغاء قيودك في الوردية المفتوحة فقط — اطلب من المدير");
      }
    }
    const now = nowIso();
    run("UPDATE money_entries SET voided_at = $now, voided_by = $by, updated_at = $now WHERE id = $id", {
      id: entryId,
      now,
      by: actor.id,
    });
  });
}

type Raw = Omit<EntryRow, "drawer" | "voided"> & { drawer: number; voided_at: string | null };

const SELECT = `
  SELECT m.id, m.kind, m.category, m.amount, m.note, m.drawer, m.shift_id, m.business_date, m.created_at,
         s.name AS staff, m.staff_id, m.voided_at
  FROM money_entries m JOIN staff s ON s.id = m.staff_id`;

const toRow = (r: Raw): EntryRow => ({
  id: r.id,
  kind: r.kind,
  category: r.category,
  amount: Number(r.amount),
  note: r.note,
  drawer: !!r.drawer,
  shift_id: r.shift_id,
  business_date: r.business_date,
  created_at: r.created_at,
  staff: r.staff,
  staff_id: r.staff_id,
  voided: !!r.voided_at,
});

export function entryById(id: string): EntryRow | null {
  const r = get<Raw>(`${SELECT} WHERE m.id = $id`, { id });
  return r ? toRow(r) : null;
}

export function listEntries(f: { from: string; to: string; shift?: string | null; includeVoided?: boolean }): EntryRow[] {
  return all<Raw>(
    `${SELECT}
     WHERE m.business_date BETWEEN $from AND $to
       ${f.shift ? "AND m.shift_id = $shift" : ""}
       ${f.includeVoided ? "" : "AND m.voided_at IS NULL"}
     ORDER BY m.created_at DESC`,
    { from: f.from, to: f.to, shift: f.shift ?? null }
  ).map(toRow);
}

/** الفئات المستخدمة سابقاً | categories used before (for quick picks) */
export function usedCategories(kind: "income" | "expense"): string[] {
  return all<{ category: string }>(
    `SELECT category FROM money_entries WHERE kind = $kind GROUP BY category ORDER BY COUNT(*) DESC LIMIT 20`,
    { kind }
  ).map((r) => r.category);
}
