// قراءات السيرفر | server-side reads, used by Server Components.
import { db } from "./supabase";
import type {
  AdminExtra, AdminFlavor, AdminPackaging, AdminStaff, AdminVariant,
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
      .select("id,name_ar,kind,scoops,grams_per_scoop,price,price_per_kg,max_flavors,sort_order")
      .eq("is_active", true).order("sort_order"),
    client.from("extras")
      .select("id,name_ar,price,stock_qty,low_stock_qty")
      .eq("is_active", true).order("sort_order"),
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
    client.from("extras").select("id,name_ar,stock_qty,low_stock_qty,unit,is_active").order("sort_order"),
  ]);
  for (const r of [flavors, packaging, extras]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    flavors: flavors.data ?? [],
    packaging: packaging.data ?? [],
    extras: extras.data ?? [],
  };
}

/** كل الأصناف مع المخفية | the full catalog, hidden items included, for the manager. */
export async function getCatalogAdmin() {
  const client = db();
  const [variants, flavors, extras, packaging] = await Promise.all([
    client.from("product_variants")
      .select("id,name_ar,kind,scoops,grams_per_scoop,price,price_per_kg,max_flavors,packaging_id,spoon_packaging_id,sort_order,is_active")
      .order("sort_order"),
    client.from("flavors")
      .select("id,name_ar,color,stock_grams,low_stock_grams,sort_order,is_active")
      .order("sort_order"),
    client.from("extras")
      .select("id,name_ar,price,stock_qty,low_stock_qty,sort_order,is_active")
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
    extras: (extras.data ?? []) as AdminExtra[],
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
