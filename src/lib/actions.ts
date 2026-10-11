"use server";

// الأوامر | mutations. Every one of these runs on the server, re-checks
// the session, and lets Postgres do the pricing + stock maths.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import {
  clearSession, requireManager, requireSession, setSession,
} from "./session";
import type { PaymentMethod, Receipt } from "./types";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : "حدث خطأ غير متوقع";
  // Postgres raises our Arabic messages verbatim; strip the SQL prefix.
  return { ok: false, error: msg.replace(/^.*?:\s*/, "").trim() || msg };
}

// ---------------------------------------------------------------------
// تسجيل الدخول | PIN login
// ---------------------------------------------------------------------
export async function loginAction(
  staffId: string,
  pin: string
): Promise<ActionResult> {
  try {
    if (!staffId) return { ok: false, error: "اختر الموظف" };
    if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "الرقم السري من 4 إلى 6 أرقام" };

    const client = db();
    const { data: valid, error } = await client.rpc("verify_staff_pin", {
      p_staff_id: staffId,
      p_pin: pin,
    });
    if (error) throw new Error(error.message);
    if (!valid) return { ok: false, error: "الرقم السري غير صحيح" };

    const { data: staff, error: e2 } = await client
      .from("staff").select("id,name,role").eq("id", staffId).single();
    if (e2) throw new Error(e2.message);

    await setSession({ staffId: staff.id, name: staff.name, role: staff.role });
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

// ---------------------------------------------------------------------
// الوردية | shift open / close
// ---------------------------------------------------------------------
export async function openShiftAction(openingCash: number): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const cash = Number(openingCash);
    if (!Number.isFinite(cash) || cash < 0) {
      return { ok: false, error: "أدخل مبلغ افتتاح صحيح" };
    }

    const { error } = await db().rpc("open_shift", {
      p_staff_id: s.staffId,
      p_opening_cash: cash,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function closeShiftAction(
  shiftId: string,
  countedCash: number,
  note?: string
): Promise<ActionResult<unknown>> {
  try {
    await requireSession();
    const cash = Number(countedCash);
    if (!Number.isFinite(cash) || cash < 0) {
      return { ok: false, error: "أدخل المبلغ المعدود في الدرج" };
    }

    const { data, error } = await db().rpc("close_shift", {
      p_shift_id: shiftId,
      p_counted_cash: cash,
      p_note: note ?? null,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// إنشاء فاتورة | the sale itself
// ---------------------------------------------------------------------
export type OrderItemInput = {
  variant_id: string;
  qty: number;
  weight_grams?: number | null;
  flavors: { flavor_id: string; grams?: number | null }[];
  extras: { extra_id: string; qty: number }[];
};

export async function createOrderAction(
  items: OrderItemInput[],
  paymentMethod: PaymentMethod,
  discount = 0,
  paidAmount?: number | null
): Promise<ActionResult<Receipt>> {
  try {
    const s = await requireSession();
    if (!items?.length) return { ok: false, error: "الفاتورة فارغة" };

    const { data, error } = await db().rpc("create_order", {
      p_staff_id: s.staffId,
      p_payment_method: paymentMethod,
      p_items: items,
      p_discount: discount,
      p_paid_amount: paidAmount ?? null,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/pos");
    return {
      ok: true,
      data: { ...(data as Receipt), cashier: s.name, payment_method: paymentMethod },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function voidOrderAction(
  orderId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const s = await requireManager();
    if (!reason?.trim()) return { ok: false, error: "اكتب سبب الإلغاء" };

    const { error } = await db().rpc("void_order", {
      p_order_id: orderId,
      p_staff_id: s.staffId,
      p_reason: reason.trim(),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/reports");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// المخزون | restock. Adds stock and writes an audit row.
// ---------------------------------------------------------------------
export async function restockAction(
  itemType: "flavor" | "packaging" | "extra",
  itemId: string,
  qty: number,
  note?: string
): Promise<ActionResult> {
  try {
    const s = await requireManager();
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount === 0) {
      return { ok: false, error: "أدخل كمية صحيحة" };
    }

    const client = db();
    const table = itemType === "flavor" ? "flavors" : itemType === "packaging" ? "packaging" : "extras";
    const column = itemType === "flavor" ? "stock_grams" : "stock_qty";
    const unit = itemType === "flavor" ? "gram" : "piece";

    const { data: row, error: readErr } = await client
      .from(table).select(`id,${column}`).eq("id", itemId).single();
    if (readErr) throw new Error(readErr.message);

    const current = Number((row as Record<string, unknown>)[column] ?? 0);
    const { error: upErr } = await client
      .from(table).update({ [column]: current + amount }).eq("id", itemId);
    if (upErr) throw new Error(upErr.message);

    const { error: movErr } = await client.from("inventory_movements").insert({
      item_type: itemType,
      flavor_id: itemType === "flavor" ? itemId : null,
      packaging_id: itemType === "packaging" ? itemId : null,
      extra_id: itemType === "extra" ? itemId : null,
      qty_delta: amount,
      unit,
      reason: amount > 0 ? "restock" : "adjustment",
      staff_id: s.staffId,
      note: note ?? null,
    });
    if (movErr) throw new Error(movErr.message);

    revalidatePath("/inventory");
    revalidatePath("/pos");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// الأسعار | update a price (manager only)
// ---------------------------------------------------------------------
export async function updatePriceAction(
  variantId: string,
  price: number
): Promise<ActionResult> {
  try {
    await requireManager();
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: "أدخل سعراً صحيحاً" };

    const client = db();
    const { data: v, error } = await client
      .from("product_variants").select("kind").eq("id", variantId).single();
    if (error) throw new Error(error.message);

    const patch = v.kind === "weight" ? { price_per_kg: p } : { price: p };
    const { error: upErr } = await client
      .from("product_variants").update(patch).eq("id", variantId);
    if (upErr) throw new Error(upErr.message);

    revalidatePath("/inventory");
    revalidatePath("/pos");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
