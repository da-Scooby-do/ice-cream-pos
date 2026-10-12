// تنسيق المبالغ بالجنيه السوداني | SDG formatting.
// Latin digits on purpose: they stay legible on the 80mm thermal roll
// and are what the shop's price list uses.
const nf = new Intl.NumberFormat("ar-SD-u-nu-latn", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const CURRENCY = "ج.س";

export function money(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `${nf.format(Number.isFinite(n) ? n : 0)} ${CURRENCY}`;
}

export function num(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return nf.format(Number.isFinite(n) ? n : 0);
}

// 1500 ml → "1.5 لتر" ، 300 ml → "300 مل"
export function volume(ml: number | null | undefined): string {
  const v = Number(ml ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "0 مل";
  return v >= 1000 ? `${nf.format(v / 1000)} لتر` : `${nf.format(v)} مل`;
}

/** كمية مخزون بوحدتها | a stock amount in its own unit */
export function stockAmount(amount: number, unit: string): string {
  if (unit === "gram") return weight(amount);
  if (unit === "ml") return volume(amount);
  return `${nf.format(Number(amount) || 0)} ${unit === "piece" ? "حبة" : "حصة"}`;
}

// 1250 g → "1.25 كجم" ، 300 g → "300 جرام"
export function weight(grams: number | null | undefined): string {
  const g = Number(grams ?? 0);
  if (!Number.isFinite(g) || g <= 0) return "—";
  return g >= 1000 ? `${nf.format(g / 1000)} كجم` : `${nf.format(g)} جرام`;
}
