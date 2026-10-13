"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGE_PRESETS, type RangeKey } from "@/lib/ranges";

// اختيار الفترة | period picker (writes ?range= / ?from=&to= to the URL).
export default function RangePicker({ value, from, to }: { value: RangeKey; from: string; to: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`${path}?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-2xl bg-ink-100/70 p-1 gap-1">
        {RANGE_PRESETS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => go({ range: r.key, from: null, to: null })}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
              value === r.key ? "bg-white shadow-sm" : "text-ink-500 hover:text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div
        className={`inline-flex items-center gap-1.5 rounded-2xl px-2 py-1 ring-1 ${
          value === "custom" ? "bg-white ring-sky" : "bg-white/60 ring-ink-100"
        }`}
      >
        <CalendarDays size={16} className="text-ink-400" />
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && go({ range: "custom", from: e.target.value, to })}
          className="bg-transparent text-sm tnum outline-none"
          aria-label="من"
        />
        <span className="text-ink-300">←</span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && go({ range: "custom", from, to: e.target.value })}
          className="bg-transparent text-sm tnum outline-none"
          aria-label="إلى"
        />
      </div>
    </div>
  );
}
