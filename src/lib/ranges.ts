import { addDays, addMonths, isDate, localDate, monthEnd, monthOf } from "./time";

// فترات التقارير الجاهزة | report period presets.

export const RANGE_PRESETS = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "7d", label: "آخر 7 أيام" },
  { key: "month", label: "هذا الشهر" },
  { key: "lastmonth", label: "الشهر الماضي" },
  { key: "30d", label: "آخر 30 يوماً" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"] | "custom";

export function resolveRange(
  p: { range?: string; from?: string; to?: string },
  fallback: RangeKey = "today"
): { key: RangeKey; from: string; to: string } {
  const today = localDate();
  const key = (p.range ?? (p.from || p.to ? "custom" : fallback)) as RangeKey;
  switch (key) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { key, from: y, to: y };
    }
    case "7d":
      return { key, from: addDays(today, -6), to: today };
    case "30d":
      return { key, from: addDays(today, -29), to: today };
    case "month":
      return { key, from: `${monthOf(today)}-01`, to: today };
    case "lastmonth": {
      const m = addMonths(monthOf(today), -1);
      return { key, from: `${m}-01`, to: monthEnd(m) };
    }
    case "custom": {
      const from = isDate(p.from) ? p.from : today;
      const to = isDate(p.to) ? p.to : from;
      return from <= to ? { key, from, to } : { key, from: to, to: from };
    }
    default:
      return { key: "today", from: today, to: today };
  }
}
