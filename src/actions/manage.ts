"use server";

import { revalidatePath } from "next/cache";
import { act, fail } from "@/lib/server/errors";
import { saveExtra, saveProduct, saveStockItem } from "@/lib/server/catalog";
import { saveShop } from "@/lib/server/shop";
import { changeOwnPin, createStaff, deleteStaff, updateStaff } from "@/lib/server/staff";
import { adjustStock, restock } from "@/lib/server/stock";
import { requireDesk } from "@/lib/session";

// الإدارة: الأصناف، المخزون، الموظفون، المحل | catalog, stock, staff, shop.

const refresh = () => revalidatePath("/", "layout");

export async function saveStockItemAction(input: Record<string, unknown>) {
  return act(async () => {
    const s = await requireDesk("products");
    const r = saveStockItem(s.id, input);
    refresh();
    return r;
  });
}

export async function saveProductAction(input: Record<string, unknown>) {
  return act(async () => {
    await requireDesk("products");
    const r = saveProduct(input);
    refresh();
    return r;
  });
}

export async function saveExtraAction(input: Record<string, unknown>) {
  return act(async () => {
    await requireDesk("products");
    const r = saveExtra(input);
    refresh();
    return r;
  });
}

export async function restockAction(input: {
  stock_item_id: string;
  qty: number;
  cost: string;
  note: string;
  drawer: boolean;
}) {
  return act(async () => {
    const s = await requireDesk("stock_add");
    const r = restock(s.id, input);
    refresh();
    return r;
  });
}

export async function adjustStockAction(input: { stock_item_id: string; mode: string; value: number; note: string }) {
  return act(async () => {
    const s = await requireDesk("stock_edit");
    const r = adjustStock(s.id, input);
    refresh();
    return r;
  });
}

export async function saveStaffAction(input: {
  id?: string;
  name: string;
  pin: string;
  role: string;
  perms: string[];
  active: boolean;
}) {
  return act(async () => {
    const s = await requireDesk("admin");
    const r = input.id ? await updateStaff(s.id, { ...input, id: input.id }) : await createStaff(input);
    refresh();
    return r;
  });
}

export async function deleteStaffAction(id: string) {
  return act(async () => {
    const s = await requireDesk("admin");
    deleteStaff(s.id, id);
    refresh();
    return null;
  });
}

export async function changeOwnPinAction(current: string, next: string, again: string) {
  return act(async () => {
    const s = await requireDesk();
    if (next !== again) fail("الرقمان الجديدان غير متطابقين");
    await changeOwnPin(s.id, current, next);
    return null;
  });
}

export async function saveShopAction(input: Record<string, unknown>) {
  return act(async () => {
    await requireDesk("admin");
    const r = saveShop(input);
    refresh();
    return r;
  });
}
