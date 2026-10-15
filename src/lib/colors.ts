// معاني الألوان | what every color means — the same everywhere in the app.
//
//   inflow  (أخضر)    money or stock coming IN: income, sales, deliveries
//   outflow (أحمر)    money or stock going OUT: expenses, stock used, shortages
//   count   (أزرق)    how many: items sold, receipts
//   day     (كهرماني ☀) the day shift      night (بنفسجي 🌙) the night shift
//   lemon   (أصفر)     a highlight: best seller, peak time
//   flavors           each flavor keeps the color the admin picked for it
//
// Green/red are status colors: they always come with an icon or a sign
// (+ / −, ↓ / ↑) so they never carry meaning by color alone. Day/night/count
// were validated together for color-blind separation (dataviz validator).
import type { ShiftKind } from "./types";

export const COLOR = {
  inflow: "#0ca30c",
  outflow: "#d03b3b",
  count: "#0094CE",
  day: "#c98500",
  night: "#6250d6",
  cash: "#0b7a0b", // both are money in: cash the dark green…
  bank: "#5cbf5c", // …bank transfer the light green
} as const;

export const SHIFT_COLOR: Record<ShiftKind, string> = { day: COLOR.day, night: COLOR.night };

/** ساعة اليوم ← الوردية (كما يقترحها البرنامج عند الفتح) | hour → shift */
export const shiftOfHour = (h: number): ShiftKind => (h >= 5 && h < 15 ? "day" : "night");
