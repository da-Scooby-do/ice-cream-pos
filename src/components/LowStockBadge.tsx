"use client";

// تنبيه النقص | the red badge. One glance tells dad what to restock.
import { useState } from "react";
import { num, stockAmount } from "@/lib/money";
import type { LowStockRow } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  flavor: "نكهة",
  packaging: "تعبئة",
  extra: "إضافة",
};

export default function LowStockBadge({ rows }: { rows: LowStockRow[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn px-4 py-2 text-sm bg-red-600 text-white animate-pulse"
      >
        ⚠ نقص مخزون ({num(rows.length)})
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-black/10 p-3 z-40 max-h-80 overflow-auto">
          <p className="text-xs font-bold text-choco/50 mb-2">أصناف تحتاج تعبئة</p>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li
                key={`${r.item_type}-${r.id}`}
                className="flex items-center justify-between text-sm bg-red-50 rounded-xl px-3 py-2"
              >
                <span className="font-bold text-choco">
                  {r.name_ar}
                  <span className="text-[10px] font-normal text-choco/40 ms-1">
                    {TYPE_LABEL[r.item_type]}
                  </span>
                </span>
                <span className="tnum text-red-700 font-bold text-xs">
                  {stockAmount(r.stock, r.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
