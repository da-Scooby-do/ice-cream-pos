import { daysBetween, monthEnd, monthStart } from "../time";
import { all, get } from "../db/sqlite";
import { round2, type Unit } from "../format";
import type {
  Dashboard,
  DayRow,
  DayStatement,
  FlavorUse,
  MoneyLine,
  MonthStatement,
  ProductSale,
  RestockRow,
  ShiftInfo,
  ShiftStatement,
  StockMonth,
  Totals,
} from "../types";
import { listEntries } from "./money";
import { getShop } from "./shop";
import { drawerFor, shiftById } from "./shifts";

// التقارير والكشوفات | statements & dashboard.
// Every report is a plain JSON object: the laptop renders it on screen and
// on the 80mm printer, and the same object is published to the cloud for
// the owner's phone.

// A scope is either one shift or a range of business dates.
type Scope = { shift: string } | { from: string; to: string };

function where(scope: Scope, alias: string) {
  return "shift" in scope
    ? { sql: `${alias}.shift_id = $shift`, params: { shift: scope.shift } }
    : { sql: `${alias}.business_date BETWEEN $from AND $to`, params: { from: scope.from, to: scope.to } };
}

export function totals(scope: Scope): Totals {
  const o = where(scope, "o");
  const s = get<{ orders: number; voids: number; cash: number; bank: number }>(
    `SELECT COALESCE(SUM(o.voided_at IS NULL), 0) AS orders,
            COALESCE(SUM(o.voided_at IS NOT NULL), 0) AS voids,
            COALESCE(SUM(CASE WHEN o.voided_at IS NULL AND o.payment = 'cash' THEN o.total END), 0) AS cash,
            COALESCE(SUM(CASE WHEN o.voided_at IS NULL AND o.payment = 'bank' THEN o.total END), 0) AS bank
     FROM orders o WHERE ${o.sql}`,
    o.params
  )!;
  const m = where(scope, "m");
  const e = get<{ inc: number; exp: number }>(
    `SELECT COALESCE(SUM(CASE WHEN m.kind = 'income' THEN m.amount END), 0) AS inc,
            COALESCE(SUM(CASE WHEN m.kind = 'expense' THEN m.amount END), 0) AS exp
     FROM money_entries m WHERE ${m.sql} AND m.voided_at IS NULL`,
    m.params
  )!;
  const sales = round2(Number(s.cash) + Number(s.bank));
  const income = round2(sales + Number(e.inc));
  return {
    orders: Number(s.orders),
    voids: Number(s.voids),
    sales_cash: round2(Number(s.cash)),
    sales_bank: round2(Number(s.bank)),
    sales,
    other_income: round2(Number(e.inc)),
    income,
    expenses: round2(Number(e.exp)),
    net: round2(income - Number(e.exp)),
  };
}

function moneyLines(scope: Scope, kind: "income" | "expense"): MoneyLine[] {
  const m = where(scope, "m");
  return all<MoneyLine>(
    `SELECT m.category, ROUND(SUM(m.amount), 2) AS amount FROM money_entries m
     WHERE ${m.sql} AND m.kind = $kind AND m.voided_at IS NULL
     GROUP BY m.category ORDER BY amount DESC`,
    { ...m.params, kind }
  ).map((r) => ({ category: r.category, amount: Number(r.amount) }));
}

function incomeLines(scope: Scope, t: Totals): MoneyLine[] {
  const lines: MoneyLine[] = [];
  if (t.sales_cash) lines.push({ category: "مبيعات نقدية", amount: t.sales_cash });
  if (t.sales_bank) lines.push({ category: "مبيعات تحويل بنكي", amount: t.sales_bank });
  return lines.concat(moneyLines(scope, "income"));
}

export function productSales(scope: Scope): ProductSale[] {
  const o = where(scope, "o");
  return all<ProductSale>(
    `SELECT MAX(i.product_name) AS product, MAX(i.size_name) AS size, MAX(i.category) AS category,
            SUM(i.qty) AS qty, ROUND(SUM(i.line_total), 2) AS revenue,
            ROUND(SUM(COALESCE(i.weight_g, 0) * i.qty), 2) AS weight_g
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE ${o.sql} AND o.voided_at IS NULL
     GROUP BY COALESCE(i.product_id, i.product_name), COALESCE(i.size_id, i.size_name, '')
     ORDER BY qty DESC, revenue DESC`,
    o.params
  ).map((r) => ({ ...r, qty: Number(r.qty), revenue: Number(r.revenue), weight_g: Number(r.weight_g) }));
}

export function flavorUse(scope: Scope): FlavorUse[] {
  const o = where(scope, "o");
  return all<FlavorUse>(
    `SELECT MAX(f.value ->> 'name') AS name, ROUND(SUM(f.value ->> 'grams'), 0) AS grams, MAX(si.color) AS color
     FROM order_items i JOIN orders o ON o.id = i.order_id, json_each(i.flavors) f
     LEFT JOIN stock_items si ON si.id = f.value ->> 'id'
     WHERE ${o.sql} AND o.voided_at IS NULL
     GROUP BY f.value ->> 'id' ORDER BY grams DESC`,
    o.params
  ).map((r) => ({ name: r.name, grams: Number(r.grams), color: r.color ?? null }));
}

// --- كشف الوردية | shift statement (printed when a shift closes) ------------

export function shiftStatement(shiftId: string): ShiftStatement | null {
  const shift = shiftById(shiftId);
  if (!shift) return null;
  const scope = { shift: shiftId };
  const t = totals(scope);
  const others = Number(
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM shifts WHERE business_date = $d AND id <> $id",
      { d: shift.business_date, id: shiftId }
    )!.n
  );
  return {
    shop: getShop(),
    shift,
    totals: t,
    drawer: drawerFor(shiftId),
    income_lines: incomeLines(scope, t),
    expenses: listEntries({ from: shift.business_date, to: shift.business_date, shift: shiftId }).filter(
      (e) => e.kind === "expense"
    ),
    products: productSales(scope),
    day:
      others > 0
        ? {
            date: shift.business_date,
            shifts: others + 1,
            totals: totals({ from: shift.business_date, to: shift.business_date }),
          }
        : null,
  };
}

// --- كشف اليوم | daily statement ---------------------------------------------

export function dayStatement(date: string): DayStatement {
  const scope = { from: date, to: date };
  const t = totals(scope);
  const shiftIds = all<{ id: string }>("SELECT id FROM shifts WHERE business_date = $d ORDER BY opened_at", { d: date });
  return {
    date,
    totals: t,
    shifts: shiftIds
      .map((s) => shiftById(s.id))
      .filter((s): s is ShiftInfo => !!s)
      .map((s) => ({ ...s, totals: totals({ shift: s.id }) })),
    income_lines: incomeLines(scope, t),
    expense_lines: moneyLines(scope, "expense"),
    entries: listEntries({ from: date, to: date }),
    products: productSales(scope),
    flavors: flavorUse(scope),
  };
}

// --- الكشف الشهري | monthly statement ----------------------------------------

export function dayRows(from: string, to: string): DayRow[] {
  const orders = all<{ d: string; n: number; v: number }>(
    `SELECT business_date AS d, COUNT(*) AS n, ROUND(SUM(total), 2) AS v FROM orders
     WHERE business_date BETWEEN $from AND $to AND voided_at IS NULL GROUP BY business_date`,
    { from, to }
  );
  const money = all<{ d: string; inc: number; exp: number }>(
    `SELECT business_date AS d,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS inc,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount END), 0) AS exp
     FROM money_entries WHERE business_date BETWEEN $from AND $to AND voided_at IS NULL GROUP BY business_date`,
    { from, to }
  );
  const map = new Map<string, DayRow>();
  const row = (d: string) => {
    let r = map.get(d);
    if (!r) {
      r = { date: d, orders: 0, income: 0, expenses: 0, net: 0 };
      map.set(d, r);
    }
    return r;
  };
  for (const o of orders) {
    const r = row(o.d);
    r.orders = Number(o.n);
    r.income += Number(o.v);
  }
  for (const m of money) {
    const r = row(m.d);
    r.income += Number(m.inc);
    r.expenses += Number(m.exp);
  }
  return [...map.values()]
    .map((r) => ({ ...r, income: round2(r.income), expenses: round2(r.expenses), net: round2(r.income - r.expenses) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function monthStatement(ym: string): MonthStatement {
  const scope = { from: monthStart(ym), to: monthEnd(ym) };
  const t = totals(scope);
  return {
    month: ym,
    totals: t,
    income_lines: incomeLines(scope, t),
    expense_lines: moneyLines(scope, "expense"),
    products: productSales(scope),
    days: dayRows(scope.from, scope.to),
    flavors: flavorUse(scope),
  };
}

// --- لوحة التحكم | dashboard --------------------------------------------------

export function dashboard(from: string, to: string): Dashboard {
  const scope = { from, to };
  const t = totals(scope);
  const params = { from, to };
  const sales = productSales(scope);
  const items = sales.reduce((s, r) => s + r.qty, 0);

  const productMap = new Map<string, { name: string; category: string; qty: number; revenue: number }>();
  const catMap = new Map<string, { category: string; qty: number; revenue: number }>();
  for (const s of sales) {
    const p = productMap.get(s.product) ?? { name: s.product, category: s.category, qty: 0, revenue: 0 };
    p.qty += s.qty;
    p.revenue = round2(p.revenue + s.revenue);
    productMap.set(s.product, p);
    const key = s.category || "بدون فئة";
    const c = catMap.get(key) ?? { category: key, qty: 0, revenue: 0 };
    c.qty += s.qty;
    c.revenue = round2(c.revenue + s.revenue);
    catMap.set(key, c);
  }

  const hours = all<{ h: number; n: number; v: number; day: number }>(
    `SELECT CAST(strftime('%H', o.created_at, '+2 hours') AS INTEGER) AS h, COUNT(*) AS n, ROUND(SUM(o.total), 2) AS v,
            SUM(s.kind = 'day') AS day
     FROM orders o JOIN shifts s ON s.id = o.shift_id
     WHERE o.business_date BETWEEN $from AND $to AND o.voided_at IS NULL GROUP BY h`,
    params
  );
  const by_hour = Array.from({ length: 24 }, (_, hour) => {
    const r = hours.find((x) => Number(x.h) === hour);
    return { hour, orders: Number(r?.n ?? 0), revenue: Number(r?.v ?? 0), day_orders: Number(r?.day ?? 0) };
  });

  const wd = all<{ w: number; n: number; v: number; days: number }>(
    `SELECT CAST(strftime('%w', business_date) AS INTEGER) AS w, COUNT(*) AS n, ROUND(SUM(total), 2) AS v,
            COUNT(DISTINCT business_date) AS days
     FROM orders WHERE business_date BETWEEN $from AND $to AND voided_at IS NULL GROUP BY w`,
    params
  );
  // أسبوع يبدأ السبت كما في السودان | week starts on Saturday
  const by_weekday = [6, 0, 1, 2, 3, 4, 5].map((day) => {
    const r = wd.find((x) => Number(x.w) === day);
    return { day, orders: Number(r?.n ?? 0), revenue: Number(r?.v ?? 0), days: Number(r?.days ?? 0) };
  });

  const dayMap = new Map(dayRows(from, to).map((d) => [d.date, d]));
  const by_day = daysBetween(from, to).map((date) => {
    const d = dayMap.get(date);
    return { date, orders: d?.orders ?? 0, revenue: d ? round2(d.income) : 0 };
  });

  return {
    from,
    to,
    totals: { ...t, avg_ticket: t.orders ? round2(t.sales / t.orders) : 0, items },
    products: [...productMap.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    sizes: sales
      .filter((s) => s.size)
      .map((s) => ({ product: s.product, size: s.size as string, qty: s.qty, revenue: s.revenue })),
    categories: [...catMap.values()].sort((a, b) => b.revenue - a.revenue),
    by_hour,
    by_weekday,
    by_day,
    flavors: flavorUse(scope),
  };
}

// --- المخزون الشهري | monthly stock ledger -----------------------------------

export function stockMonth(ym: string): StockMonth {
  const from = monthStart(ym);
  const to = monthEnd(ym);
  const rows = all<{
    id: string;
    name: string;
    kind: "flavor" | "item";
    unit: Unit;
    active: number;
    opening: number;
    restocked: number;
    sold: number;
    adjusted: number;
  }>(
    `SELECT i.id, i.name, i.kind, i.unit, i.active,
       COALESCE(SUM(CASE WHEN m.business_date < $from THEN m.delta END), 0) AS opening,
       COALESCE(SUM(CASE WHEN m.business_date BETWEEN $from AND $to AND m.reason = 'restock' THEN m.delta END), 0) AS restocked,
       COALESCE(-SUM(CASE WHEN m.business_date BETWEEN $from AND $to AND m.reason IN ('sale', 'void') THEN m.delta END), 0) AS sold,
       COALESCE(SUM(CASE WHEN m.business_date BETWEEN $from AND $to AND m.reason IN ('adjust', 'waste') THEN m.delta END), 0) AS adjusted
     FROM stock_items i LEFT JOIN stock_moves m ON m.stock_item_id = i.id AND m.business_date <= $to
     GROUP BY i.id
     ORDER BY i.kind = 'flavor' DESC, i.sort, i.name`,
    { from, to }
  );
  const items = rows
    .map((r) => {
      const opening = round2(Number(r.opening));
      const restocked = round2(Number(r.restocked));
      const sold = round2(Number(r.sold));
      const adjusted = round2(Number(r.adjusted));
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        unit: r.unit,
        opening,
        restocked,
        sold,
        adjusted,
        closing: round2(opening + restocked - sold + adjusted),
        active: !!r.active,
      };
    })
    // أخفِ المواد المتوقفة التي لم تتحرك | hide archived items with no activity
    .filter((r) => r.active || r.opening || r.restocked || r.sold || r.adjusted)
    .map(({ active: _a, ...r }) => r);

  const restocks = all<RestockRow & { cost: number | null }>(
    `SELECT m.id, m.business_date AS date, m.created_at, i.name AS item, i.unit, m.delta AS qty,
            e.amount AS cost, m.note, COALESCE(s.name, '—') AS staff
     FROM stock_moves m
     JOIN stock_items i ON i.id = m.stock_item_id
     LEFT JOIN staff s ON s.id = m.staff_id
     LEFT JOIN money_entries e ON e.id = m.money_entry_id AND e.voided_at IS NULL
     WHERE m.reason = 'restock' AND m.business_date BETWEEN $from AND $to
     ORDER BY m.created_at DESC`,
    { from, to }
  ).map((r) => ({ ...r, qty: Number(r.qty), cost: r.cost == null ? null : Number(r.cost) }));

  return { month: ym, items, restocks };
}

/** أيام فيها نشاط | every date with any activity (for the first cloud upload) */
export function activeDates(): string[] {
  return all<{ d: string }>(
    `SELECT business_date AS d FROM orders UNION SELECT business_date FROM money_entries
     UNION SELECT business_date FROM stock_moves ORDER BY d`
  ).map((r) => r.d);
}
