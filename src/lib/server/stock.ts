import { RESTOCK_CATEGORY } from "../categories";
import { localDate } from "../time";
import { all, get, nowIso, run, tx, uid } from "../db/sqlite";
import { qty as fmtQty, round2, type Unit } from "../format";
import type { StockLevel } from "../types";
import { amount, fail, oneOf, optText } from "./errors";
import { addEntry } from "./money";
import { currentShift } from "./shifts";

// المخزون | stock. Every change writes a stock_moves row, so the monthly
// ledger (opening → in → out → closing) always adds up to what is on hand.

type ItemRow = { id: string; name: string; unit: Unit; qty: number; active: number };

function item(id: string): ItemRow {
  return (
    get<ItemRow>("SELECT id, name, unit, qty, active FROM stock_items WHERE id = $id", { id }) ??
    fail("مادة المخزون غير موجودة")
  );
}

function businessDate(): string {
  return currentShift()?.business_date ?? localDate();
}

function move(p: {
  itemId: string;
  delta: number;
  reason: "restock" | "adjust" | "waste";
  staffId: string;
  note: string | null;
  moneyEntryId?: string | null;
}) {
  const now = nowIso();
  run("UPDATE stock_items SET qty = qty + $delta, updated_at = $now WHERE id = $id", {
    id: p.itemId,
    delta: p.delta,
    now,
  });
  run(
    `INSERT INTO stock_moves (id, stock_item_id, delta, reason, money_entry_id, note, staff_id, business_date, created_at, updated_at)
     VALUES ($id, $item, $delta, $reason, $money, $note, $staff, $date, $now, $now)`,
    {
      id: uid(),
      item: p.itemId,
      delta: p.delta,
      reason: p.reason,
      money: p.moneyEntryId ?? null,
      note: p.note,
      staff: p.staffId,
      date: businessDate(),
      now,
    }
  );
}

/**
 * توريد بضاعة جديدة | receive new stock. `qty` is in the item's base unit
 * (g / ml / pcs). An optional cost is recorded as an expense too.
 */
export function restock(
  staffId: string,
  input: { stock_item_id: unknown; qty: unknown; cost: unknown; note: unknown; drawer: unknown }
) {
  const q = amount(input.qty, "الكمية", { min: 0, allowZero: false, max: 100_000_000 });
  const cost =
    input.cost === "" || input.cost === null || input.cost === undefined
      ? 0
      : amount(input.cost, "التكلفة", { min: 0 });
  const note = optText(input.note, "الملاحظة", 200);
  return tx(() => {
    const it = item(String(input.stock_item_id ?? ""));
    let moneyId: string | null = null;
    if (cost > 0) {
      const e = addEntry(
        staffId,
        { kind: "expense", category: RESTOCK_CATEGORY, amount: cost, note: null, drawer: input.drawer },
        { moneyNote: `توريد ${it.name} — ${fmtQty(q, it.unit)}${note ? ` — ${note}` : ""}` }
      );
      moneyId = e.id;
    }
    move({ itemId: it.id, delta: round2(q), reason: "restock", staffId, note, moneyEntryId: moneyId });
    return { name: it.name };
  });
}

/**
 * جرد / تالف | stock count or write-off.
 *   set   → the counted amount on hand (difference is logged)
 *   waste → spoiled / thrown away amount (subtracted)
 */
export function adjustStock(
  staffId: string,
  input: { stock_item_id: unknown; mode: unknown; value: unknown; note: unknown }
) {
  const mode = oneOf(input.mode, ["set", "waste"] as const, "نوع التعديل");
  const value = amount(input.value, "الكمية", { min: 0, max: 100_000_000 });
  const note = optText(input.note, "الملاحظة", 200);
  return tx(() => {
    const it = item(String(input.stock_item_id ?? ""));
    const delta = mode === "set" ? round2(value - Number(it.qty)) : -round2(value);
    if (mode === "waste" && value <= 0) fail("أدخل الكمية التالفة");
    if (delta === 0) return { name: it.name, delta: 0 };
    move({
      itemId: it.id,
      delta,
      reason: mode === "set" ? "adjust" : "waste",
      staffId,
      note: note ?? (mode === "set" ? "جرد" : "تالف"),
    });
    return { name: it.name, delta };
  });
}

export function stockLevels(): StockLevel[] {
  return all<{ id: string; name: string; kind: "flavor" | "item"; unit: Unit; qty: number; alert_qty: number }>(
    `SELECT id, name, kind, unit, qty, alert_qty FROM stock_items WHERE active = 1
     ORDER BY kind = 'flavor' DESC, sort, name`
  ).map((r) => ({
    ...r,
    qty: Number(r.qty),
    alert_qty: Number(r.alert_qty),
    low: Number(r.alert_qty) > 0 && Number(r.qty) <= Number(r.alert_qty),
  }));
}

export function lowStock(): StockLevel[] {
  return stockLevels().filter((s) => s.low);
}
