import { all, get, nowIso, run, tx, uid } from "../db/sqlite";
import { round2 } from "../format";
import { can, type Who } from "../perms";
import type { OrderItemInput, OrderRow, Payment, Receipt, ReceiptItem, ShiftKind } from "../types";
import { amount, fail, oneOf, text } from "./errors";
import { getShop } from "./shop";
import { currentShift } from "./shifts";

// البيع | selling. Prices come from the database, never from the screen,
// and the sale, its items and every stock deduction commit together.

type ProductRow = {
  id: string;
  name: string;
  category: string;
  pricing: "size" | "weight";
  price_per_kg: number | null;
  max_flavors: number;
  scoop_grams: number | null;
  active: number;
};
type SizeRow = { id: string; product_id: string; name: string; price: number; scoops: number; active: number };
type FlavorRow = { id: string; name: string };
type ExtraRow = { id: string; name: string; price: number; stock_item_id: string | null; qty: number };

export function createOrder(
  staffId: string,
  input: { items: unknown; payment: unknown; paid: unknown }
): Receipt {
  const payment = oneOf(input.payment, ["cash", "bank"] as const, "طريقة الدفع");
  const items = (Array.isArray(input.items) ? input.items : []) as OrderItemInput[];
  if (!items.length) fail("الطلب فارغ");
  if (items.length > 50) fail("الطلب كبير جداً");

  return tx(() => {
    const shift = currentShift() ?? fail("لا توجد وردية مفتوحة — افتح وردية أولاً");
    const shop = getShop();
    const use = new Map<string, number>(); // stock_item_id → amount used
    const add = (sid: string | null, q: number) => {
      if (sid && q > 0) use.set(sid, (use.get(sid) ?? 0) + q);
    };

    const lines = items.map((it, idx) => {
      const n = Math.round(amount(it?.qty ?? 1, "الكمية", { min: 1, max: 99 }));
      const p =
        get<ProductRow>("SELECT * FROM products WHERE id = $id", { id: String(it?.product_id ?? "") }) ??
        fail(`الصنف رقم ${idx + 1} غير موجود`);
      if (!p.active) fail(`الصنف «${p.name}» متوقف`);
      const scoopGrams = Number(p.scoop_grams ?? shop.scoop_grams);

      let base = 0;
      let size: SizeRow | null = null;
      let weight: number | null = null;
      let flavorGrams = 0; // total grams of ice cream for ONE unit
      let maxFlavors = 0;

      if (p.pricing === "size") {
        size =
          get<SizeRow>("SELECT * FROM product_sizes WHERE id = $id AND product_id = $pid", {
            id: String(it?.size_id ?? ""),
            pid: p.id,
          }) ?? fail(`اختر حجم «${p.name}»`);
        if (!size.active) fail(`الحجم «${size.name}» متوقف`);
        base = Number(size.price);
        maxFlavors = Number(size.scoops);
        flavorGrams = maxFlavors * scoopGrams;
      } else {
        weight = amount(it?.weight_g, "الوزن", { min: 1, max: 50000, allowZero: false });
        base = (Number(p.price_per_kg) * weight) / 1000;
        maxFlavors = Number(p.max_flavors);
        flavorGrams = weight;
      }

      // النكهات | flavors
      const flavorIds = [...new Set((Array.isArray(it?.flavor_ids) ? it.flavor_ids : []).map(String))];
      if (maxFlavors > 0 && flavorIds.length === 0) fail(`اختر نكهة لـ«${p.name}»`);
      if (flavorIds.length > Math.max(maxFlavors, 0)) {
        fail(maxFlavors ? `«${p.name}»: الحد ${maxFlavors} نكهات` : `«${p.name}» بدون نكهات`);
      }
      const flavors = flavorIds.map((fid) => {
        const f =
          get<FlavorRow>("SELECT id, name FROM stock_items WHERE id = $id AND kind = 'flavor' AND active = 1", {
            id: fid,
          }) ?? fail("نكهة غير متوفرة");
        const g = round2((flavorGrams / flavorIds.length) * n);
        add(f.id, g);
        return { id: f.id, name: f.name, grams: g };
      });

      // الإضافات | extras
      const extraIds = [...new Set((Array.isArray(it?.extra_ids) ? it.extra_ids : []).map(String))];
      const extras = extraIds.map((eid) => {
        const x =
          get<ExtraRow>("SELECT id, name, price, stock_item_id, qty FROM extras WHERE id = $id AND active = 1", {
            id: eid,
          }) ?? fail("إضافة غير متوفرة");
        add(x.stock_item_id, Number(x.qty) * n);
        return { id: x.id, name: x.name, price: Number(x.price) };
      });

      // ما يستهلكه الصنف: كوب، ملعقة، حليب… | cups, spoons, milk…
      const recipe = all<{ stock_item_id: string; qty: number }>(
        `SELECT stock_item_id, qty FROM recipe_lines
         WHERE product_id = $pid AND (size_id IS NULL OR size_id = $sid)`,
        { pid: p.id, sid: size?.id ?? "" }
      );
      for (const r of recipe) add(r.stock_item_id, Number(r.qty) * n);

      const unit = round2(base + extras.reduce((s, e) => s + e.price, 0));
      return {
        id: uid(),
        product: p,
        size,
        qty: n,
        unit,
        weight,
        total: round2(unit * n),
        flavors,
        extras,
      };
    });

    const total = round2(lines.reduce((s, l) => s + l.total, 0));
    let paid: number | null = null;
    let change: number | null = null;
    if (payment === "cash") {
      paid =
        input.paid === null || input.paid === undefined || input.paid === ""
          ? total
          : amount(input.paid, "المبلغ المستلم", { min: 0 });
      if (paid < total) fail("المبلغ المستلم أقل من الإجمالي");
      change = round2(paid - total);
    }

    const orderId = uid();
    const number = Number(get<{ n: number }>("SELECT COALESCE(MAX(number), 0) + 1 AS n FROM orders")!.n);
    const now = nowIso();
    run(
      `INSERT INTO orders (id, number, shift_id, staff_id, business_date, created_at, payment, total, paid, change, updated_at)
       VALUES ($id, $number, $shift, $staff, $date, $now, $payment, $total, $paid, $change, $now)`,
      { id: orderId, number, shift: shift.id, staff: staffId, date: shift.business_date, now, payment, total, paid, change }
    );
    for (const l of lines) {
      run(
        `INSERT INTO order_items (id, order_id, product_id, size_id, product_name, size_name, category, qty,
           unit_price, weight_g, line_total, flavors, extras, updated_at)
         VALUES ($id, $order, $pid, $sid, $pname, $sname, $cat, $qty, $unit, $weight, $total, $flavors, $extras, $now)`,
        {
          id: l.id,
          order: orderId,
          pid: l.product.id,
          sid: l.size?.id ?? null,
          pname: l.product.name,
          sname: l.size?.name ?? null,
          cat: l.product.category,
          qty: l.qty,
          unit: l.unit,
          weight: l.weight,
          total: l.total,
          flavors: JSON.stringify(l.flavors),
          extras: JSON.stringify(l.extras),
          now,
        }
      );
    }
    for (const [sid, q] of use) {
      const delta = -round2(q);
      run("UPDATE stock_items SET qty = qty + $delta, updated_at = $now WHERE id = $id", { id: sid, delta, now });
      run(
        `INSERT INTO stock_moves (id, stock_item_id, delta, reason, order_id, staff_id, business_date, created_at, updated_at)
         VALUES ($id, $sid, $delta, 'sale', $order, $staff, $date, $now, $now)`,
        { id: uid(), sid, delta, order: orderId, staff: staffId, date: shift.business_date, now }
      );
    }
    return receipt(orderId)!;
  });
}

/** إلغاء فاتورة يعيد ما استهلكته للمخزون | a void returns its stock */
export function voidOrder(actor: Who & { id: string }, orderId: string, reasonIn: unknown) {
  const reason = text(reasonIn, "سبب الإلغاء", { max: 120 });
  tx(() => {
    const o =
      get<{ id: string; voided_at: string | null; shift_id: string; closed_at: string | null; business_date: string }>(
        `SELECT o.id, o.voided_at, o.shift_id, s.closed_at, o.business_date
         FROM orders o JOIN shifts s ON s.id = o.shift_id WHERE o.id = $id`,
        { id: orderId }
      ) ?? fail("الفاتورة غير موجودة");
    if (o.voided_at) fail("الفاتورة ملغاة بالفعل");
    if (actor.role !== "admin") {
      if (!can(actor, "void")) fail("ليست لديك صلاحية إلغاء الفواتير");
      if (o.closed_at) fail("لا يمكن إلغاء فاتورة من وردية مقفولة — اطلب من المدير");
    }
    const now = nowIso();
    run(
      "UPDATE orders SET voided_at = $now, voided_by = $by, void_reason = $reason, updated_at = $now WHERE id = $id",
      { id: orderId, now, by: actor.id, reason }
    );
    const moves = all<{ stock_item_id: string; delta: number }>(
      "SELECT stock_item_id, delta FROM stock_moves WHERE order_id = $id AND reason = 'sale'",
      { id: orderId }
    );
    for (const m of moves) {
      const back = -Number(m.delta);
      run("UPDATE stock_items SET qty = qty + $d, updated_at = $now WHERE id = $id", { id: m.stock_item_id, d: back, now });
      run(
        `INSERT INTO stock_moves (id, stock_item_id, delta, reason, order_id, staff_id, business_date, created_at, updated_at)
         VALUES ($id, $sid, $d, 'void', $order, $staff, $date, $now, $now)`,
        { id: uid(), sid: m.stock_item_id, d: back, order: orderId, staff: actor.id, date: o.business_date, now }
      );
    }
  });
}

type RawItem = {
  product_name: string;
  size_name: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  weight_g: number | null;
  flavors: string;
  extras: string;
};

function parseNames(json: string): string[] {
  try {
    return (JSON.parse(json) as { name: string }[]).map((x) => x.name);
  } catch {
    return [];
  }
}

export function receipt(orderId: string): Receipt | null {
  const o = get<{
    id: string;
    number: number;
    created_at: string;
    cashier: string;
    payment: Payment;
    total: number;
    paid: number | null;
    change: number | null;
    voided_at: string | null;
  }>(
    `SELECT o.id, o.number, o.created_at, s.name AS cashier, o.payment, o.total, o.paid, o.change, o.voided_at
     FROM orders o JOIN staff s ON s.id = o.staff_id WHERE o.id = $id`,
    { id: orderId }
  );
  if (!o) return null;
  const items = all<RawItem>(
    `SELECT product_name, size_name, qty, unit_price, line_total, weight_g, flavors, extras
     FROM order_items WHERE order_id = $id ORDER BY rowid`,
    { id: orderId }
  ).map(
    (i): ReceiptItem => ({
      name: i.product_name,
      size: i.size_name,
      qty: Number(i.qty),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
      weight_g: i.weight_g == null ? null : Number(i.weight_g),
      flavors: parseNames(i.flavors),
      extras: parseNames(i.extras),
    })
  );
  return {
    order_id: o.id,
    number: Number(o.number),
    created_at: o.created_at,
    cashier: o.cashier,
    payment: o.payment,
    total: Number(o.total),
    paid: o.paid == null ? null : Number(o.paid),
    change: o.change == null ? null : Number(o.change),
    items,
    voided: !!o.voided_at,
  };
}

export type OrderFilter = {
  from: string;
  to: string;
  staff?: string | null;
  payment?: Payment | null;
  status?: "paid" | "void" | null;
  shift?: string | null;
  limit?: number;
  offset?: number;
};

export function listOrders(f: OrderFilter): { rows: OrderRow[]; count: number; paid: number; total: number } {
  const where = [
    "o.business_date BETWEEN $from AND $to",
    f.staff ? "o.staff_id = $staff" : null,
    f.payment ? "o.payment = $payment" : null,
    f.status === "paid" ? "o.voided_at IS NULL" : f.status === "void" ? "o.voided_at IS NOT NULL" : null,
    f.shift ? "o.shift_id = $shift" : null,
  ]
    .filter(Boolean)
    .join(" AND ");
  const params = {
    from: f.from,
    to: f.to,
    staff: f.staff ?? null,
    payment: f.payment ?? null,
    shift: f.shift ?? null,
    limit: f.limit ?? 50,
    offset: f.offset ?? 0,
  };
  const rows = all<{
    id: string;
    number: number;
    created_at: string;
    business_date: string;
    kind: ShiftKind;
    closed_at: string | null;
    cashier: string;
    payment: Payment;
    total: number;
    voided_at: string | null;
    void_reason: string | null;
    summary: string | null;
  }>(
    `SELECT o.id, o.number, o.created_at, o.business_date, sh.kind, sh.closed_at, st.name AS cashier,
            o.payment, o.total, o.voided_at, o.void_reason,
            (SELECT group_concat(CASE WHEN qty > 1 THEN qty || '× ' ELSE '' END || product_name ||
                    COALESCE(' ' || size_name, ''), '، ')
             FROM order_items WHERE order_id = o.id) AS summary
     FROM orders o
     JOIN staff st ON st.id = o.staff_id
     JOIN shifts sh ON sh.id = o.shift_id
     WHERE ${where}
     ORDER BY o.number DESC
     LIMIT $limit OFFSET $offset`,
    params
  );
  const agg = get<{ n: number; paid: number; total: number }>(
    `SELECT COUNT(*) AS n, COUNT(CASE WHEN o.voided_at IS NULL THEN 1 END) AS paid,
            COALESCE(SUM(CASE WHEN o.voided_at IS NULL THEN o.total END), 0) AS total
     FROM orders o WHERE ${where}`,
    params
  )!;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      number: Number(r.number),
      created_at: r.created_at,
      business_date: r.business_date,
      shift_kind: r.kind,
      shift_open: !r.closed_at,
      cashier: r.cashier,
      payment: r.payment,
      total: Number(r.total),
      voided: !!r.voided_at,
      void_reason: r.void_reason,
      summary: r.summary ?? "",
    })),
    count: Number(agg.n),
    paid: Number(agg.paid),
    total: Number(agg.total),
  };
}
