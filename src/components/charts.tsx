"use client";

import { useState } from "react";
import { COLOR } from "@/lib/colors";

// رسوم بيانية بسيطة | small charts. Every color means one thing (see
// src/lib/colors.ts): bars are ≤24px with a 4px rounded data end, a hairline
// baseline, the peak labelled, and every bar has a hover tooltip.

/**
 * short = the text shown above the peak column; color = what the bar means;
 * parts = a stacked column (bottom first), e.g. day + night receipts in one hour.
 */
export type Col = {
  key: string;
  label: string;
  value: number;
  tip: string;
  short: string;
  color?: string;
  parts?: { value: number; color: string }[];
};

/** أعمدة رأسية | vertical columns (hours, weekdays, days) */
export function Columns({
  data,
  height = 170,
  showEvery = 1,
  color = COLOR.count,
}: {
  data: Col[];
  height?: number;
  showEvery?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  return (
    <div className="w-full" dir="rtl">
      <div className="relative flex items-end gap-[2px] border-b border-ink-100" style={{ height }}>
        {data.map((d, i) => {
          const h = max ? Math.max(d.value > 0 ? 3 : 0, (d.value / max) * (height - 26)) : 0;
          return (
            <div
              key={d.key}
              className="relative flex-1 h-full flex items-end justify-center cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {i === peak && (
                <span
                  className="absolute text-[11px] font-bold text-ink whitespace-nowrap tnum"
                  style={{ bottom: h + 4 }}
                >
                  {d.short}
                </span>
              )}
              {d.parts ? (
                <span
                  className="flex flex-col-reverse w-full max-w-[24px] gap-[2px] transition-opacity"
                  style={{ height: h, opacity: hover === null || hover === i ? 1 : 0.55 }}
                >
                  {d.parts
                    .filter((pt) => pt.value > 0)
                    .map((pt, k, arr) => (
                      <span
                        key={k}
                        className={k === arr.length - 1 ? "rounded-t-[4px]" : ""}
                        style={{ flexGrow: pt.value, flexBasis: 0, background: pt.color, minHeight: 2 }}
                      />
                    ))}
                </span>
              ) : (
                <span
                  className="block w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                  style={{ height: h, background: d.color ?? color, opacity: hover === null || hover === i ? 1 : 0.55 }}
                />
              )}
              {hover === i && (
                <span className="absolute z-10 bottom-full mb-1 rounded-xl bg-ink-800 text-white text-xs px-2.5 py-1.5 whitespace-nowrap shadow-lift pointer-events-none">
                  <b>{d.label}</b> · <span className="tnum">{d.tip}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] mt-1.5">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-ink-400 tnum whitespace-nowrap overflow-visible">
            {i % showEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export type Row = { key: string; label: string; sub?: string; value: number; valueText: string; tip?: string; color?: string };

/** أشرطة أفقية مرتبة | ranked horizontal bars (best sellers) */
export function RankBars({ rows, limit = 8, color = COLOR.count }: { rows: Row[]; limit?: number; color?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => r.value));
  if (!shown.length) return <p className="text-sm text-ink-400 py-6 text-center">لا توجد بيانات في هذه الفترة</p>;
  return (
    <ul className="space-y-2.5">
      {shown.map((r, i) => (
        <li
          key={r.key}
          className="relative"
          onMouseEnter={() => setHover(r.key)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="flex items-baseline gap-2 text-sm mb-1">
            <span className="w-5 text-ink-300 tnum text-xs">{i + 1}</span>
            <span className="font-semibold truncate">{r.label}</span>
            {r.sub && <span className="text-ink-400 text-xs truncate">{r.sub}</span>}
            <span className="flex-1" />
            <span className="tnum font-bold">{r.valueText}</span>
          </div>
          <div className="ms-7 h-3 rounded-full bg-ink-50">
            <div
              className="h-3 rounded-full transition-opacity"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                background: r.color ?? color,
                boxShadow: "inset 0 0 0 1px rgba(24,26,28,.08)",
                opacity: hover === null || hover === r.key ? 1 : 0.55,
              }}
            />
          </div>
          {hover === r.key && r.tip && (
            <span className="absolute z-10 start-7 -top-7 rounded-xl bg-ink-800 text-white text-xs px-2.5 py-1.5 whitespace-nowrap shadow-lift pointer-events-none tnum">
              {r.tip}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** مفتاح الألوان تحت الرسم | the chart's color key */
export function Legend({ items }: { items: { color: string; label: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-ink-500">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
