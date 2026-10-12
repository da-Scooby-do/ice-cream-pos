"use server";

// الأوامر | mutations. Every one of these runs on the server, re-checks
// the session, and lets Postgres do the pricing + stock maths.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
export async function loginAction(pin: string): Promise<ActionResult> {
  try {
    if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "الرقم السري من 4 إلى 6 أرقام" };

    // The PIN alone identifies the person, so wrong guesses are throttled
    // per device in the database (8 failures per 10 minutes).
    const h = await headers();
    const ip =
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    const { data, error } = await db().rpc("login_with_pin", { p_pin: pin, p_ip: ip });
    if (error) throw new Error(error.message);

    const staff = (data as { id: string; name: string; role: "cashier" | "manager" }[] | null)?.[0];
    if (!staff) return { ok: false, error: "الرقم السري غير صحيح" };

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
// إدارة الأصناف | add / edit products, flavors, extras, packaging.
// Manager only. Nothing is ever hard-deleted: old orders reference these
// rows, so "removing" an item hides it (is_active = false) instead.
// ---------------------------------------------------------------------

const KINDS = ["scoop", "cup", "weight", "cone"] as const;
const PACK_KINDS = ["cup", "cone", "spoon", "biscuit", "bag"] as const;

function cleanName(v: unknown): string {
  const name = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("اكتب الاسم");
  if (name.length > 40) throw new Error("الاسم طويل جداً (40 حرفاً كحد أقصى)");
  return name;
}

function numberIn(v: unknown, label: string, min: number, max: number, int = false): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw new Error(`${label} — أدخل رقماً ${int ? "صحيحاً " : ""}بين ${min} و ${max}`);
  }
  return n;
}

function optionalId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** Postgres unique-violation → a message the manager can act on. */
function dbError(e: { code?: string; message: string }): Error {
  if (e.code === "23505") return new Error("هذا الاسم مستخدم من قبل");
  return new Error(e.message);
}

function revalidateCatalog() {
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/pos");
}

/** رصيد البداية لصنف جديد يُسجَّل كحركة توريد | opening stock is logged as a restock. */
async function logOpeningStock(
  itemType: "flavor" | "packaging" | "extra",
  id: string,
  qty: number,
  staffId: string
) {
  if (!qty) return;
  const { error } = await db().from("inventory_movements").insert({
    item_type: itemType,
    flavor_id: itemType === "flavor" ? id : null,
    packaging_id: itemType === "packaging" ? id : null,
    extra_id: itemType === "extra" ? id : null,
    qty_delta: qty,
    unit: itemType === "flavor" ? "gram" : "piece",
    reason: "restock",
    staff_id: staffId,
    note: "رصيد البداية",
  });
  if (error) throw dbError(error);
}

export type VariantInput = {
  id?: string;
  name_ar: string;
  kind: (typeof KINDS)[number];
  price?: number | null;
  price_per_kg?: number | null;
  scoops?: number | null;
  grams_per_scoop?: number | null;
  max_flavors: number;
  packaging_id?: string | null;
  spoon_packaging_id?: string | null;
  sort_order?: number;
  is_active: boolean;
};

export async function saveVariantAction(input: VariantInput): Promise<ActionResult> {
  try {
    await requireManager();
    if (!KINDS.includes(input.kind)) throw new Error("نوع الصنف غير صحيح");

    const isWeight = input.kind === "weight";
    const row = {
      name_ar: cleanName(input.name_ar),
      kind: input.kind,
      // the price_present check needs exactly the right price column
      price: isWeight ? null : numberIn(input.price, "السعر", 0, 100_000_000),
      price_per_kg: isWeight ? numberIn(input.price_per_kg, "سعر الكيلو", 0, 100_000_000) : null,
      scoops: isWeight ? null : numberIn(input.scoops, "عدد السكوبات", 1, 10, true),
      grams_per_scoop: isWeight ? null : numberIn(input.grams_per_scoop, "جرام السكوب", 1, 500),
      max_flavors: numberIn(input.max_flavors, "أقصى عدد نكهات", 1, 8, true),
      packaging_id: optionalId(input.packaging_id),
      spoon_packaging_id: optionalId(input.spoon_packaging_id),
      sort_order: numberIn(input.sort_order ?? 0, "الترتيب", 0, 9999, true),
      is_active: !!input.is_active,
    };

    const client = db();
    const { error } = input.id
      ? await client.from("product_variants").update(row).eq("id", input.id)
      : await client.from("product_variants").insert(row);
    if (error) throw dbError(error);

    revalidateCatalog();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export type FlavorInput = {
  id?: string;
  name_ar: string;
  color: string;
  low_stock_grams: number;
  opening_stock_grams?: number;
  sort_order?: number;
  is_active: boolean;
};

export async function saveFlavorAction(input: FlavorInput): Promise<ActionResult> {
  try {
    const s = await requireManager();
    if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error("اختر لوناً صحيحاً");

    const row = {
      name_ar: cleanName(input.name_ar),
      color: input.color,
      low_stock_grams: numberIn(input.low_stock_grams, "حد التنبيه", 0, 1_000_000),
      sort_order: numberIn(input.sort_order ?? 0, "الترتيب", 0, 9999, true),
      is_active: !!input.is_active,
    };

    const client = db();
    if (input.id) {
      const { error } = await client.from("flavors").update(row).eq("id", input.id);
      if (error) throw dbError(error);
    } else {
      const opening = numberIn(input.opening_stock_grams ?? 0, "الرصيد", 0, 10_000_000);
      const { data, error } = await client
        .from("flavors").insert({ ...row, stock_grams: opening }).select("id").single();
      if (error) throw dbError(error);
      await logOpeningStock("flavor", data.id, opening, s.staffId);
    }

    revalidateCatalog();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export type ExtraInput = {
  id?: string;
  name_ar: string;
  price: number;
  low_stock_qty: number;
  opening_stock?: number;
  sort_order?: number;
  is_active: boolean;
};

export async function saveExtraAction(input: ExtraInput): Promise<ActionResult> {
  try {
    const s = await requireManager();
    const row = {
      name_ar: cleanName(input.name_ar),
      price: numberIn(input.price, "السعر", 0, 100_000_000),
      low_stock_qty: numberIn(input.low_stock_qty, "حد التنبيه", 0, 1_000_000),
      sort_order: numberIn(input.sort_order ?? 0, "الترتيب", 0, 9999, true),
      is_active: !!input.is_active,
    };

    const client = db();
    if (input.id) {
      const { error } = await client.from("extras").update(row).eq("id", input.id);
      if (error) throw dbError(error);
    } else {
      const opening = numberIn(input.opening_stock ?? 0, "الرصيد", 0, 10_000_000);
      const { data, error } = await client
        .from("extras").insert({ ...row, stock_qty: opening }).select("id").single();
      if (error) throw dbError(error);
      await logOpeningStock("extra", data.id, opening, s.staffId);
    }

    revalidateCatalog();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export type PackagingInput = {
  id?: string;
  name_ar: string;
  kind: (typeof PACK_KINDS)[number];
  low_stock_qty: number;
  opening_stock?: number;
  sort_order?: number;
  is_active: boolean;
};

export async function savePackagingAction(input: PackagingInput): Promise<ActionResult> {
  try {
    const s = await requireManager();
    if (!PACK_KINDS.includes(input.kind)) throw new Error("نوع التعبئة غير صحيح");

    const row = {
      name_ar: cleanName(input.name_ar),
      kind: input.kind,
      low_stock_qty: numberIn(input.low_stock_qty, "حد التنبيه", 0, 1_000_000),
      sort_order: numberIn(input.sort_order ?? 0, "الترتيب", 0, 9999, true),
      is_active: !!input.is_active,
    };

    const client = db();
    if (input.id) {
      const { error } = await client.from("packaging").update(row).eq("id", input.id);
      if (error) throw dbError(error);
    } else {
      const opening = numberIn(input.opening_stock ?? 0, "الرصيد", 0, 10_000_000, true);
      const { data, error } = await client
        .from("packaging").insert({ ...row, stock_qty: opening }).select("id").single();
      if (error) throw dbError(error);
      await logOpeningStock("packaging", data.id, opening, s.staffId);
    }

    revalidateCatalog();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// الموظفون | add / edit staff. Manager only.
// Guards against locking the shop out: a manager can't demote or disable
// themselves, and the last active manager can't be removed.
// ---------------------------------------------------------------------
export type StaffInput = {
  id?: string;
  name: string;
  role: "cashier" | "manager";
  /** required when adding; when editing, empty keeps the current PIN */
  pin?: string;
  is_active: boolean;
};

export async function saveStaffAction(input: StaffInput): Promise<ActionResult> {
  try {
    const me = await requireManager();
    const name = cleanName(input.name);
    if (input.role !== "cashier" && input.role !== "manager") {
      throw new Error("الصلاحية غير صحيحة");
    }
    const pin = String(input.pin ?? "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) throw new Error("الرقم السري من 4 إلى 6 أرقام");

    const client = db();

    if (!input.id) {
      if (!pin) throw new Error("اكتب رقماً سرياً للموظف الجديد");
      const { data: id, error } = await client.rpc("create_staff", {
        p_name: name,
        p_role: input.role,
        p_pin: pin,
      });
      if (error) throw dbError(error);
      if (!input.is_active) {
        const { error: e2 } = await client.from("staff").update({ is_active: false }).eq("id", id);
        if (e2) throw dbError(e2);
      }
    } else {
      const losesManager = input.role !== "manager" || !input.is_active;

      if (input.id === me.staffId && losesManager) {
        throw new Error("لا يمكنك إيقاف حسابك أو إلغاء صلاحية المدير عن نفسك");
      }

      if (losesManager) {
        const { data: current, error: e1 } = await client
          .from("staff").select("role,is_active").eq("id", input.id).single();
        if (e1) throw dbError(e1);

        if (current.role === "manager" && current.is_active) {
          const { count, error: e2 } = await client
            .from("staff")
            .select("id", { count: "exact", head: true })
            .eq("role", "manager")
            .eq("is_active", true)
            .neq("id", input.id);
          if (e2) throw dbError(e2);
          if (!count) throw new Error("يجب أن يبقى مدير واحد نشط على الأقل");
        }
      }

      const { data: updated, error } = await client
        .from("staff")
        .update({ name, role: input.role, is_active: !!input.is_active })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("id");
      if (error) throw dbError(error);
      if (!updated?.length) throw new Error("الموظف غير موجود");

      if (pin) {
        const { error: e3 } = await client.rpc("set_staff_pin", { p_staff_id: input.id, p_pin: pin });
        if (e3) throw dbError(e3);
      }
    }

    revalidatePath("/staff");
    revalidatePath("/login");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * حذف موظف | remove a staff member. They disappear from the staff list
 * and the login screen; the row is archived so past receipts, shifts and
 * Z-reports keep their name.
 */
export async function deleteStaffAction(staffId: string): Promise<ActionResult> {
  try {
    const me = await requireManager();
    if (staffId === me.staffId) throw new Error("لا يمكنك حذف حسابك بنفسك");

    const client = db();
    const { data: target, error: e1 } = await client
      .from("staff").select("role,is_active").eq("id", staffId).is("deleted_at", null).maybeSingle();
    if (e1) throw dbError(e1);
    if (!target) throw new Error("الموظف غير موجود");

    if (target.role === "manager" && target.is_active) {
      const { count, error: e2 } = await client
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("role", "manager")
        .eq("is_active", true)
        .is("deleted_at", null)
        .neq("id", staffId);
      if (e2) throw dbError(e2);
      if (!count) throw new Error("يجب أن يبقى مدير واحد نشط على الأقل");
    }

    const { error } = await client.rpc("archive_staff", { p_staff_id: staffId });
    if (error) throw dbError(error);

    revalidatePath("/staff");
    revalidatePath("/login");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// إعدادات المحل | shop name, contact details and receipt footer.
// ---------------------------------------------------------------------
export type SettingsInput = {
  shop_name: string;
  phone: string;
  address: string;
  receipt_footer: string;
};

function optionalText(v: unknown, label: string, max: number): string | null {
  const t = String(v ?? "").trim().replace(/[ \t]+/g, " ");
  if (t.length > max) throw new Error(`${label} طويل جداً (${max} حرفاً كحد أقصى)`);
  return t === "" ? null : t;
}

export async function saveSettingsAction(input: SettingsInput): Promise<ActionResult> {
  try {
    await requireManager();
    const shopName = String(input.shop_name ?? "").trim().replace(/\s+/g, " ");
    if (!shopName) throw new Error("اكتب اسم المحل");
    if (shopName.length > 40) throw new Error("اسم المحل طويل جداً (40 حرفاً كحد أقصى)");

    const { error } = await db()
      .from("shop_settings")
      .update({
        shop_name: shopName,
        phone: optionalText(input.phone, "رقم الهاتف", 30),
        address: optionalText(input.address, "العنوان", 80),
        receipt_footer: optionalText(input.receipt_footer, "تذييل الفاتورة", 120),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw dbError(error);

    // the name appears on every screen and receipt
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
