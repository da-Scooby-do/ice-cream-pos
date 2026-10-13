// الوقت بتوقيت الخرطوم | Khartoum time.
//
// Sudan is UTC+2 all year (no daylight saving), so a fixed offset is exact
// and does not depend on how the laptop's Windows time zone is set.
// Timestamps are stored in UTC (ISO strings); "business dates" are the
// shop's calendar day, YYYY-MM-DD.

const OFFSET_MS = 2 * 60 * 60 * 1000;

function shifted(d: Date | string | number): Date {
  return new Date(new Date(d).getTime() + OFFSET_MS);
}

/** YYYY-MM-DD في الخرطوم */
export function localDate(d: Date | string | number = new Date()): string {
  return shifted(d).toISOString().slice(0, 10);
}

/** الساعة 0–23 في الخرطوم */
export function localHour(d: Date | string | number): number {
  return shifted(d).getUTCHours();
}

/** اليوم من الأسبوع 0=الأحد … 6=السبت */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthStart(ym: string): string {
  return `${ym}-01`;
}

export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const isMonth = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

// Formatting is done by hand (not Intl) so the server, the browser and the
// phone always print exactly the same text — ICU versions differ.
const pad = (n: number) => String(n).padStart(2, "0");

function parts(ts: string | number | Date) {
  const t = shifted(ts);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}

/** "الإثنين، 13 أكتوبر 2026" for a business date */
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(date)]}، ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "13/10/2026" */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "أكتوبر 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "9:41 م" */
export function clock(ts: string | null | undefined): string {
  if (!ts) return "—";
  const { h, min } = parts(ts);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(min)} ${h < 12 ? "ص" : "م"}`;
}

/** "13/10/2026 9:41 م" */
export function stamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  const { y, m, d } = parts(ts);
  return `${pad(d)}/${pad(m)}/${y} ${clock(ts)}`;
}

/** "9 ص" for an hour bucket */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? "ص" : "م";
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v} ${suffix}`;
}
