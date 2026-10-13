"use client";

import { create } from "zustand";
import { round2 } from "@/lib/format";
import type { Extra, OrderItemInput, Product, Size, StockItem } from "@/lib/types";

// سلة الطلب | the order being rung up. Lives in memory for seconds; the
// server recomputes every price from the database when it is paid.

export type CartLine = {
  uid: string;
  product: Product;
  size: Size | null;
  qty: number;
  weight_g: number | null;
  flavors: { id: string; name: string; color: string | null }[];
  extras: { id: string; name: string; price: number }[];
};

export function maxFlavors(l: CartLine): number {
  return l.product.pricing === "weight" ? l.product.max_flavors : (l.size?.scoops ?? 0);
}

export function linePrice(l: CartLine): number {
  const base =
    l.product.pricing === "weight"
      ? ((l.product.price_per_kg ?? 0) * (l.weight_g ?? 0)) / 1000
      : (l.size?.price ?? 0);
  const extras = l.extras.reduce((s, e) => s + e.price, 0);
  return round2((base + extras) * l.qty);
}

/** ما الذي ينقص هذا السطر؟ | what is this line still missing? */
export function missing(l: CartLine): "size" | "weight" | "flavor" | null {
  if (l.product.pricing === "size" && !l.size) return "size";
  if (l.product.pricing === "weight" && !(l.weight_g && l.weight_g > 0)) return "weight";
  if (maxFlavors(l) > 0 && l.flavors.length === 0) return "flavor";
  return null;
}

type CartState = {
  lines: CartLine[];
  activeUid: string | null;
  start: (p: Product) => void;
  setActive: (uid: string | null) => void;
  setSize: (size: Size) => void;
  setWeight: (g: number) => void;
  toggleFlavor: (f: StockItem) => void;
  toggleExtra: (x: Extra) => void;
  setQty: (uid: string, qty: number) => void;
  remove: (uid: string) => void;
  clear: () => void;
};

const uid = () => crypto.randomUUID();

const patchActive = (s: CartState, fn: (l: CartLine) => CartLine) => ({
  lines: s.lines.map((l) => (l.uid === s.activeUid ? fn(l) : l)),
});

export const useCart = create<CartState>((set) => ({
  lines: [],
  activeUid: null,

  // اختيار صنف يبدأ سطراً جديداً؛ الحجم الوحيد يُختار تلقائياً
  start: (product) => {
    const only = product.pricing === "size" && product.sizes.length === 1 ? product.sizes[0] : null;
    const line: CartLine = { uid: uid(), product, size: only, qty: 1, weight_g: null, flavors: [], extras: [] };
    set((s) => ({ lines: [...s.lines, line], activeUid: line.uid }));
  },

  setActive: (activeUid) => set({ activeUid }),

  setSize: (size) =>
    set((s) =>
      patchActive(s, (l) => ({ ...l, size, flavors: l.flavors.slice(0, Math.max(size.scoops, 0)) }))
    ),

  setWeight: (g) => set((s) => patchActive(s, (l) => ({ ...l, weight_g: g }))),

  toggleFlavor: (f) =>
    set((s) =>
      patchActive(s, (l) => {
        if (l.flavors.some((x) => x.id === f.id)) return { ...l, flavors: l.flavors.filter((x) => x.id !== f.id) };
        const max = maxFlavors(l);
        if (max <= 0) return l;
        const next = { id: f.id, name: f.name, color: f.color };
        // عند الحد: نكهة واحدة تُستبدل، وإلا لا شيء | at the limit: a single pick swaps
        if (l.flavors.length >= max) return max === 1 ? { ...l, flavors: [next] } : l;
        return { ...l, flavors: [...l.flavors, next] };
      })
    ),

  toggleExtra: (x) =>
    set((s) =>
      patchActive(s, (l) =>
        l.extras.some((e) => e.id === x.id)
          ? { ...l, extras: l.extras.filter((e) => e.id !== x.id) }
          : { ...l, extras: [...l.extras, { id: x.id, name: x.name, price: x.price }] }
      )
    ),

  setQty: (id, qty) =>
    set((s) => ({ lines: s.lines.map((l) => (l.uid === id ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l)) })),

  remove: (id) =>
    set((s) => {
      const lines = s.lines.filter((l) => l.uid !== id);
      return { lines, activeUid: s.activeUid === id ? (lines.at(-1)?.uid ?? null) : s.activeUid };
    }),

  clear: () => set({ lines: [], activeUid: null }),
}));

export function cartTotal(lines: CartLine[]): number {
  return round2(lines.reduce((s, l) => s + linePrice(l), 0));
}

export function toPayload(lines: CartLine[]): OrderItemInput[] {
  return lines.map((l) => ({
    product_id: l.product.id,
    size_id: l.size?.id ?? null,
    qty: l.qty,
    weight_g: l.product.pricing === "weight" ? l.weight_g : null,
    flavor_ids: l.flavors.map((f) => f.id),
    extra_ids: l.extras.map((e) => e.id),
  }));
}
