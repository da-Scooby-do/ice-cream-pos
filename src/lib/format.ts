// تنسيق المبالغ والكميات | money & quantity formatting (SDG).
// Latin digits on purpose: they stay legible on the 80mm thermal roll
// and match the shop's price list.

// By hand rather than Intl, so every screen and every printer shows the
// exact same "1,250.5" whatever ICU version is underneath.
const nf = {
  format(v: number): string {
    const neg = v < 0;
    const fixed = Math.abs(Math.round(v * 100) / 100).toFixed(2);
    const [int, dec] = fixed.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const frac = dec.replace(/0+$/, "");
    return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
  },
};

export const CURRENCY = "ج.س";

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function money(amount: unknown): string {
  return `${nf.format(n(amount))} ${CURRENCY}`;
}

export function num(amount: unknown): string {
  return nf.format(n(amount));
}

/** signed money: "+1,500" / "−300" */
export function signedMoney(amount: unknown): string {
  const v = n(amount);
  return `${v < 0 ? "−" : v > 0 ? "+" : ""}${nf.format(Math.abs(v))} ${CURRENCY}`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export type Unit = "g" | "ml" | "pcs";

export const UNIT_LABEL: Record<Unit, string> = {
  g: "جرام",
  ml: "مل",
  pcs: "حبة",
};

/** الكمية بوحدتها، مع التحويل للكيلو واللتر | 1500 g → "1.5 كجم" */
export function qty(amount: unknown, unit: Unit | string): string {
  const v = n(amount);
  const neg = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (unit === "g") return a >= 1000 ? `${neg}${nf.format(a / 1000)} كجم` : `${neg}${nf.format(a)} جم`;
  if (unit === "ml") return a >= 1000 ? `${neg}${nf.format(a / 1000)} لتر` : `${neg}${nf.format(a)} مل`;
  return `${neg}${nf.format(a)} حبة`;
}

/** "350 جم" / "1.2 كجم" for a weighed sale */
export function grams(g: unknown): string {
  return qty(g, "g");
}

/** The unit people actually type stock in: kg for grams, litres for ml. */
export const INPUT_UNIT: Record<Unit, { label: string; factor: number }> = {
  g: { label: "كجم", factor: 1000 },
  ml: { label: "لتر", factor: 1000 },
  pcs: { label: "حبة", factor: 1 },
};

export function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}
