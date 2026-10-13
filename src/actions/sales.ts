"use server";

import { revalidatePath } from "next/cache";
import { act, fail } from "@/lib/server/errors";
import { makeBackup } from "@/lib/server/backup";
import { addEntry, voidEntry } from "@/lib/server/money";
import { createOrder, receipt, voidOrder } from "@/lib/server/orders";
import { shiftStatement } from "@/lib/server/reports";
import { closeShift, openShift } from "@/lib/server/shifts";
import { syncSoon } from "@/lib/server/sync";
import { requireDesk } from "@/lib/session";
import type { OrderItemInput, Payment } from "@/lib/types";

// البيع والوردية والمصروفات | the counter's actions.

export async function createOrderAction(items: OrderItemInput[], payment: Payment, paid: number | null) {
  return act(async () => {
    const s = await requireDesk("sell");
    return createOrder(s.id, { items, payment, paid });
  });
}

export async function receiptAction(orderId: string) {
  return act(async () => {
    await requireDesk("sell", "sales");
    return receipt(orderId) ?? fail("الفاتورة غير موجودة");
  });
}

export async function voidOrderAction(orderId: string, reason: string) {
  return act(async () => {
    const s = await requireDesk("void");
    voidOrder(s, orderId, reason);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function openShiftAction(kind: string, openingCash: string) {
  return act(async () => {
    const s = await requireDesk("sell");
    const shift = openShift(s.id, { kind, opening_cash: openingCash });
    revalidatePath("/", "layout");
    return shift;
  });
}

export async function closeShiftAction(shiftId: string, counted: string, note: string) {
  return act(async () => {
    const s = await requireDesk("sell");
    const id = closeShift(s.id, { shift_id: shiftId, counted_cash: counted, note });
    try {
      makeBackup("shift");
    } catch (e) {
      console.error("[backup after shift]", e);
    }
    syncSoon();
    // No revalidatePath here: the close page would re-render, find no open
    // shift and redirect before the statement is shown and printed.
    return shiftStatement(id)!;
  });
}

export async function addEntryAction(input: {
  kind: string;
  category: string;
  amount: string;
  note: string;
  drawer: boolean;
}) {
  return act(async () => {
    const s = await requireDesk("expenses");
    const e = addEntry(s.id, input);
    revalidatePath("/", "layout");
    return e;
  });
}

export async function voidEntryAction(id: string) {
  return act(async () => {
    const s = await requireDesk("expenses");
    voidEntry(s, id);
    revalidatePath("/", "layout");
    return null;
  });
}
