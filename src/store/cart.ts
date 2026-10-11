"use client";

import { create } from "zustand";
import type { Extra, Flavor, Variant } from "@/lib/types";
import type { OrderItemInput } from "@/lib/actions";

// سلة الطلب | the active order.
// Kept entirely in memory: a counter sale lives for seconds, and the
// server recomputes every price from the database when it is submitted,
// so nothing here is trusted for money.

export type CartLine = {
  uid: string;
  variant: Variant;
  qty: number;
  weightGrams: number | null;
  flavors: { id: string; name_ar: string; color: string }[];
  extras: { id: string; name_ar: string; price: number }[];
};

/** سعر السطر | line price — display only; the server is authoritative. */
export function linePrice(line: CartLine): number {
  const base =
    line.variant.kind === "weight"
      ? ((line.variant.price_per_kg ?? 0) * (line.weightGrams ?? 0)) / 1000
      : line.variant.price ?? 0;
  const extras = line.extras.reduce((s, e) => s + Number(e.price), 0);
  return Math.round((base + extras) * line.qty * 100) / 100;
}

type CartState = {
  lines: CartLine[];
  activeUid: string | null;

  startLine: (variant: Variant) => void;
  setActive: (uid: string | null) => void;
  toggleFlavor: (flavor: Flavor) => void;
  toggleExtra: (extra: Extra) => void;
  setWeight: (grams: number | null) => void;
  setQty: (uid: string, qty: number) => void;
  removeLine: (uid: string) => void;
  clear: () => void;

  activeLine: () => CartLine | null;
  subtotal: () => number;
  toPayload: () => OrderItemInput[];
  isReady: () => boolean;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  activeUid: null,

  // اختيار نوع الصنف يبدأ سطراً جديداً | picking a product starts a line
  startLine: (variant) => {
    const line: CartLine = {
      uid: uid(),
      variant,
      qty: 1,
      weightGrams: null,
      flavors: [],
      extras: [],
    };
    set((s) => ({ lines: [...s.lines, line], activeUid: line.uid }));
  },

  setActive: (uid) => set({ activeUid: uid }),

  // النكهة تُضاف أو تُزال، وتتوقف عند الحد الأقصى للصنف
  toggleFlavor: (flavor) =>
    set((s) => {
      const lines = s.lines.map((l) => {
        if (l.uid !== s.activeUid) return l;
        const has = l.flavors.some((f) => f.id === flavor.id);
        if (has) {
          return { ...l, flavors: l.flavors.filter((f) => f.id !== flavor.id) };
        }
        if (l.flavors.length >= l.variant.max_flavors) return l; // at the limit
        return {
          ...l,
          flavors: [
            ...l.flavors,
            { id: flavor.id, name_ar: flavor.name_ar, color: flavor.color },
          ],
        };
      });
      return { lines };
    }),

  toggleExtra: (extra) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.uid !== s.activeUid) return l;
        const has = l.extras.some((e) => e.id === extra.id);
        return {
          ...l,
          extras: has
            ? l.extras.filter((e) => e.id !== extra.id)
            : [...l.extras, { id: extra.id, name_ar: extra.name_ar, price: Number(extra.price) }],
        };
      }),
    })),

  setWeight: (grams) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.uid === s.activeUid ? { ...l, weightGrams: grams } : l
      ),
    })),

  setQty: (uid, qty) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.uid === uid ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l
      ),
    })),

  removeLine: (uid) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.uid !== uid),
      activeUid: s.activeUid === uid ? null : s.activeUid,
    })),

  clear: () => set({ lines: [], activeUid: null }),

  activeLine: () => get().lines.find((l) => l.uid === get().activeUid) ?? null,

  subtotal: () =>
    Math.round(get().lines.reduce((s, l) => s + linePrice(l), 0) * 100) / 100,

  toPayload: () =>
    get().lines.map((l) => ({
      variant_id: l.variant.id,
      qty: l.qty,
      weight_grams: l.variant.kind === "weight" ? l.weightGrams : null,
      flavors: l.flavors.map((f) => ({ flavor_id: f.id, grams: null })),
      extras: l.extras.map((e) => ({ extra_id: e.id, qty: 1 })),
    })),

  // جاهزة للدفع؟ | every line must have what it needs
  isReady: () => {
    const { lines } = get();
    if (!lines.length) return false;
    return lines.every((l) => {
      if (l.variant.kind === "weight") {
        return (l.weightGrams ?? 0) > 0 && l.flavors.length > 0;
      }
      return l.flavors.length > 0;
    });
  },
}));
