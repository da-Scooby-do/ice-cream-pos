// قراءات السيرفر | server-side reads, used by Server Components.
import { db } from "./supabase";
import type {
  AdminExtra, AdminFlavor, AdminIngredient, AdminPackaging, AdminStaff, AdminVariant,
  Extra, Flavor, LowStockRow, ShiftSummary, Variant,
} from "./types";

export async function getSettings() {
  const { data, error } = await db()
    .from("shop_settings")
    .select("shop_name,phone,address,currency,receipt_footer,default_scoop_grams")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getOpenShift(): Promise<{ id: string; staff_id: string; opening_cash: number; opened_at: string } | null> {
  const { data, error } = await db()
    .from("shifts")
    .select("id,staff_id,opening_cash,opened_at")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const { data, error } = await db().rpc("shift_summary", { p_shift_id: shiftId });
  if (error) throw new Error(error.message);
  return data as ShiftSummary;
}

export async function getLowStock(): Promise<LowStockRow[]> {
  const { data, error } = await db()
    .from("v_low_stock")
    .select("item_type,id,name_ar,stock,threshold,unit");
  if (error) throw new Error(error.message);
  return (data ?? []) as LowStockRow[];
}

/** كل ما تحتاجه شاشة الكاشير | everything the POS screen needs, in one trip. */
export async function getPosCatalog() {
  const client = db();
  const [flavors, variants, extras, settings, lowStock] = await Promise.all([
    client.from("flavors")
      .select("id,name_ar,color,stock_grams,low_stock_grams")
      .eq("is_active", true).order("sort_order"),
    client.from("product_variants")
      .select("id,name_ar,kind,category,scoops,grams_per_scoop,price,price_per_kg,max_flavors,sort_order")
      .eq("is_active", true).order("sort_order"),
    client.from("extras")
      .select("id,name_ar,price,stock_qty,low_stock_qty")
      .eq("is_active", true).eq("kind", "topping").order("sort_order"),
    getSettings(),
    getLowStock(),
  ]);

  for (const r of [flavors, variants, extras]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    flavors: (flavors.data ?? []) as Flavor[],
    variants: (variants.data ?? []) as Variant[],
    extras: (extras.data ?? []) as Extra[],
    settings,
    lowStock,
  };
}

/** المبيعات اليومية لآخر 30 يوم | last 30 days of sales. */
export async function getDailySales() {
  const { data, error } = await db()
    .from("v_daily_sales")
    .select("day,orders_count,total_sales,cash_sales,card_sales,discounts")
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** أكثر النكهات مبيعاً خلال فترة | best-selling flavors over N days. */
export async function getTopFlavors(days = 7) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await db()
    .from("order_item_flavors")
    .select("name_ar,grams,order_items!inner(order_id,orders!inner(created_at,status))")
    .gte("order_items.orders.created_at", since)
    .eq("order_items.orders.status", "completed");
  if (error) throw new Error(error.message);

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { name_ar: string; grams: number }[]) {
    totals.set(row.name_ar, (totals.get(row.name_ar) ?? 0) + Number(row.grams));
  }
  return [...totals.entries()]
    .map(([name_ar, grams]) => ({ name_ar, grams: Math.round(grams) }))
    .sort((a, b) => b.grams - a.grams);
}

/** آخر الفواتير | recent orders, for the void screen. */
export async function getRecentOrders(limit = 25) {
  const { data, error } = await db()
    .from("orders")
    .select("id,order_no,total,payment_method,status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** المخزون الكامل | full stock list for the inventory page. */
export async function getInventory() {
  const client = db();
  const [flavors, packaging, extras] = await Promise.all([
    client.from("flavors").select("id,name_ar,stock_grams,low_stock_grams,is_active").order("sort_order"),
    client.from("packaging").select("id,name_ar,kind,stock_qty,low_stock_qty,is_active").order("sort_order"),
    client.from("extras").select("id,name_ar,stock_qty,low_stock_qty,unit,kind,is_active").order("sort_order"),
  ]);
  for (const r of [flavors, packaging, extras]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    flavors: flavors.data ?? [],
    packaging: packaging.data ?? [],
    extras: (extras.data ?? []).filter((x) => x.kind !== "ingredient"),
    ingredients: (extras.data ?? []).filter((x) => x.kind === "ingredient"),
  };
}

/** كل الأصناف مع المخفية | the full catalog, hidden items included, for the manager. */
export async function getCatalogAdmin() {
  const client = db();
  const [variants, flavors, extras, packaging] = await Promise.all([
    client.from("product_variants")
      .select("id,name_ar,kind,category,scoops,grams_per_scoop,price,price_per_kg,max_flavors,packaging_id,spoon_packaging_id,ingredient_id,ingredient_qty,sort_order,is_active")
      .order("sort_order"),
    client.from("flavors")
      .select("id,name_ar,color,stock_grams,low_stock_grams,sort_order,is_active")
      .order("sort_order"),
    client.from("extras")
      .select("id,name_ar,price,stock_qty,low_stock_qty,sort_order,is_active,kind")
      .order("sort_order"),
    client.from("packaging")
      .select("id,name_ar,kind,stock_qty,low_stock_qty,sort_order,is_active")
      .order("sort_order"),
  ]);
  for (const r of [variants, flavors, extras, packaging]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    variants: (variants.data ?? []) as AdminVariant[],
    flavors: (flavors.data ?? []) as AdminFlavor[],
    extras: (extras.data ?? []).filter((x) => x.kind !== "ingredient") as AdminExtra[],
    ingredients: (extras.data ?? []).filter((x) => x.kind === "ingredient") as AdminIngredient[],
    packaging: (packaging.data ?? []) as AdminPackaging[],
  };
}

/** الموظفون مع آخر وردية | all staff (inactive too) with their latest shift. */
export async function getStaffAdmin(): Promise<AdminStaff[]> {
  const { data, error } = await db()
    .from("staff")
    .select("id,name,role,is_active,created_at,shifts(opened_at)")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("role", { ascending: false })
    .order("name")
    .order("opened_at", { referencedTable: "shifts", ascending: false })
    .limit(1, { referencedTable: "shifts" });
  if (error) throw new Error(error.message);

  type Row = Omit<AdminStaff, "last_shift_at"> & { shifts: { opened_at: string }[] | null };
  return ((data ?? []) as Row[]).map(({ shifts, ...r }) => ({
    ...r,
    last_shift_at: shifts?.[0]?.opened_at ?? null,
  }));
}

// ---------------------------------------------------------------------
// سجل المبيعات | sales history
// ---------------------------------------------------------------------
export const SALES_PAGE_SIZE = 50;

/** اليوم بتوقيت الخرطوم | today's date in Khartoum, as YYYY-MM-DD */
export function khartoumToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum" }).format(d);
}

/** [from 00:00, day after `to` 00:00) in Khartoum time (UTC+2, no DST) */
function dayBounds(from: string, to: string) {
  const end = new Date(`${to}T00:00:00+02:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { fromIso: new Date(`${from}T00:00:00+02:00`).toISOString(), toIso: end.toISOString() };
}

export type SalesFilter = {
  from: string;
  to: string;
  staffId?: string;
  method?: "cash" | "card" | "wallet";
  status?: "completed" | "void";
  page: number;
};

export type SaleRow = {
  id: string;
  order_no: number;
  created_at: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: "cash" | "card" | "wallet";
  paid_amount: number | null;
  change_amount: number | null;
  status: "completed" | "void";
  void_reason: string | null;
  staff: { name: string } | null;
  order_items: {
    name_ar: string;
    qty: number;
    line_total: number;
    weight_grams: number | null;
    order_item_flavors: { name_ar: string }[];
    order_item_extras: { name_ar: string }[];
  }[];
};

export type SalesSummary = {
  orders: number;
  total: number;
  cash: number;
  card: number;
  discounts: number;
  voids: number;
  voided_total: number;
};

export async function getSalesHistory(f: SalesFilter) {
  const { fromIso, toIso } = dayBounds(f.from, f.to);
  const client = db();

  let q = client
    .from("orders")
    .select(
      "id,order_no,created_at,subtotal,discount,total,payment_method,paid_amount,change_amount,status,void_reason," +
        "staff(name)," +
        "order_items(name_ar,qty,line_total,weight_grams,order_item_flavors(name_ar),order_item_extras(name_ar))",
      { count: "exact" }
    )
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (f.staffId) q = q.eq("staff_id", f.staffId);
  if (f.method) q = q.eq("payment_method", f.method);
  if (f.status) q = q.eq("status", f.status);

  const start = f.page * SALES_PAGE_SIZE;
  const [list, summary] = await Promise.all([
    q.order("created_at", { ascending: false }).range(start, start + SALES_PAGE_SIZE - 1),
    // totals cover the whole period, not just this page
    client.rpc("sales_summary", {
      p_from: fromIso,
      p_to: toIso,
      p_staff: f.staffId ?? null,
      p_method: f.method ?? null,
    }),
  ]);
  if (list.error) throw new Error(list.error.message);
  if (summary.error) throw new Error(summary.error.message);

  return {
    rows: (list.data ?? []) as unknown as SaleRow[],
    count: list.count ?? 0,
    summary: summary.data as SalesSummary,
  };
}

/** كل الأسماء، بما فيها المحذوفون، لفلتر السجل | every name, removed staff included */
export async function getAllStaffNames() {
  const { data, error } = await db()
    .from("staff")
    .select("id,name,deleted_at")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; deleted_at: string | null }[];
}
