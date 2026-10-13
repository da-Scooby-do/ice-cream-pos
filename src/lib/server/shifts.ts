import { addDays, localDate, localHour } from "../time";
import { get, nowIso, run, tx, uid } from "../db/sqlite";
import type { Drawer, ShiftInfo, ShiftKind } from "../types";
import { amount, fail, oneOf, optText } from "./errors";

// الورديات | shifts. Two a day (صباحية / مسائية) or just one; only one open
// at a time. A night shift that runs past midnight still belongs to the day
// it started — its sales land on that day's statement.

type RawShift = {
  id: string;
  kind: ShiftKind;
  business_date: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_cash: number;
  counted_cash: number | null;
  expected_cash: number | null;
  note: string | null;
};

const SELECT = `
  SELECT s.id, s.kind, s.business_date, s.opened_at, s.closed_at,
         o.name AS opened_by, c.name AS closed_by,
         s.opening_cash, s.counted_cash, s.expected_cash, s.note
  FROM shifts s
  JOIN staff o ON o.id = s.opened_by
  LEFT JOIN staff c ON c.id = s.closed_by`;

function toInfo(r: RawShift): ShiftInfo {
  return {
    ...r,
    opening_cash: Number(r.opening_cash),
    counted_cash: r.counted_cash == null ? null : Number(r.counted_cash),
    expected_cash: r.expected_cash == null ? null : Number(r.expected_cash),
  };
}

export function currentShift(): ShiftInfo | null {
  const r = get<RawShift>(`${SELECT} WHERE s.closed_at IS NULL`);
  return r ? toInfo(r) : null;
}

export function shiftById(id: string): ShiftInfo | null {
  const r = get<RawShift>(`${SELECT} WHERE s.id = $id`, { id });
  return r ? toInfo(r) : null;
}

/** اقتراح نوع الوردية حسب الساعة | suggest day/night from the clock */
export function suggestKind(now = new Date()): ShiftKind {
  const h = localHour(now);
  return h >= 5 && h < 15 ? "day" : "night";
}

export function openShift(staffId: string, input: { kind: unknown; opening_cash: unknown }): ShiftInfo {
  const kind = oneOf(input.kind, ["day", "night"] as const, "نوع الوردية");
  const opening = amount(input.opening_cash, "النقدية الافتتاحية", { min: 0 });
  const now = new Date();
  // وردية مسائية فُتحت بعد منتصف الليل تُحسب لليوم السابق
  const date = kind === "night" && localHour(now) < 5 ? addDays(localDate(now), -1) : localDate(now);

  return tx(() => {
    if (currentShift()) fail("توجد وردية مفتوحة بالفعل");
    const id = uid();
    const ts = now.toISOString();
    run(
      `INSERT INTO shifts (id, kind, business_date, opened_by, opened_at, opening_cash, updated_at)
       VALUES ($id, $kind, $date, $staff, $ts, $opening, $ts)`,
      { id, kind, date, staff: staffId, ts, opening }
    );
    return shiftById(id)!;
  });
}

/** حساب الدرج | what should be in the cash drawer for a shift */
export function drawerFor(shiftId: string): Drawer {
  const s = get<{ opening_cash: number; counted_cash: number | null }>(
    "SELECT opening_cash, counted_cash FROM shifts WHERE id = $id",
    { id: shiftId }
  );
  if (!s) fail("الوردية غير موجودة");
  const sales = get<{ v: number }>(
    "SELECT COALESCE(SUM(total), 0) AS v FROM orders WHERE shift_id = $id AND voided_at IS NULL AND payment = 'cash'",
    { id: shiftId }
  )!;
  const e = get<{ inc: number; exp: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS inc,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount END), 0) AS exp
     FROM money_entries WHERE shift_id = $id AND drawer = 1 AND voided_at IS NULL`,
    { id: shiftId }
  )!;
  const opening = Number(s.opening_cash);
  const expected = Math.round((opening + Number(sales.v) + Number(e.inc) - Number(e.exp)) * 100) / 100;
  const counted = s.counted_cash == null ? null : Number(s.counted_cash);
  return {
    opening,
    cash_sales: Number(sales.v),
    cash_income: Number(e.inc),
    cash_expenses: Number(e.exp),
    expected,
    counted,
    diff: counted == null ? null : Math.round((counted - expected) * 100) / 100,
  };
}

export function closeShift(staffId: string, input: { shift_id: unknown; counted_cash: unknown; note: unknown }) {
  const counted = amount(input.counted_cash, "النقدية المعدودة", { min: 0 });
  const note = optText(input.note, "الملاحظة", 300);
  return tx(() => {
    const cur = currentShift();
    if (!cur || cur.id !== input.shift_id) fail("هذه الوردية مقفولة بالفعل");
    const expected = drawerFor(cur.id).expected;
    const now = nowIso();
    run(
      `UPDATE shifts SET closed_by = $staff, closed_at = $now, counted_cash = $counted,
         expected_cash = $expected, note = $note, updated_at = $now
       WHERE id = $id AND closed_at IS NULL`,
      { id: cur.id, staff: staffId, now, counted, expected, note }
    );
    return cur.id;
  });
}
