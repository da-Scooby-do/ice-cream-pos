"use client";

import { useState, useTransition } from "react";
import { adjustStockAction } from "@/lib/actions";
import { stockAmount } from "@/lib/money";

type Unit = "gram" | "ml" | "piece" | "portion";

// what the manager types in: kg for flavors, litres for milk
const UNIT_WORD: Record<Unit, string> = { gram: "كجم", ml: "لتر", piece: "حبة", portion: "حصة" };

/** عرض الرصيد | a stock amount for display (grams shown in kg, ml in litres). */
function shownStock(stock: number, unit: Unit) {
  return stockAmount(stock, unit);
}

// صف مخزون | one stock row.
// The manager types an amount, then either:
//   «+ توريد» adds it to what's there (a delivery; negative = waste), or
//   «تعيين»   makes the stock exactly that amount (after counting).
export function StockRow({
  type, id, name, stock, threshold, unit,
}: {
  type: "flavor" | "packaging" | "extra";
  id: string;
  name: string;
  stock: number;
  threshold: number;
  unit: Unit;
}) {
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const low = stock <= threshold;
  const entered = Number(qty);
  const valid = qty.trim() !== "" && Number.isFinite(entered);

  function run(mode: "add" | "set") {
    if (!valid || (mode === "add" && entered === 0)) return;
    // flavors are typed in kg (stored in grams), milk in litres (stored in ml)
    const amount = unit === "gram" || unit === "ml" ? Math.round(entered * 1000) : entered;
    setMsg(null);
    start(async () => {
      const res = await adjustStockAction(type, id, mode, amount);
      if (res.ok) {
        setQty("");
        setMsg({ ok: true, text: `تم ✓ المتوفر الآن ${shownStock(res.data, unit)}` });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <li className="py-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold text-choco">{name}</span>
        <span className={`tnum text-sm font-bold ${low ? "text-red-600" : "text-choco/70"}`}>
          {low && "⚠ "}
          {shownStock(stock, unit)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type="number"
            inputMode="decimal"
            step={unit === "gram" || unit === "ml" ? "0.1" : "1"}
            value={qty}
            onChange={(e) => {
              setMsg(null);
              setQty(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && run("add")}
            placeholder="الكمية"
            dir="ltr"
            className="w-full rounded-xl border-2 border-black/10 bg-cream pl-12 pr-3 py-2 text-sm tnum select-text focus:border-berry outline-none"
          />
          <span className="absolute inset-y-0 left-3 flex items-center text-xs text-choco/40 pointer-events-none">
            {UNIT_WORD[unit]}
          </span>
        </div>
        <button
          type="button"
          onClick={() => run("add")}
          disabled={pending || !valid || entered === 0}
          title="يضيف الكمية إلى الموجود (رقم سالب = تالف)"
          className="btn px-3 py-2 text-sm bg-mint text-white shrink-0"
        >
          + توريد
        </button>
        <button
          type="button"
          onClick={() => run("set")}
          disabled={pending || !valid || entered < 0}
          title="يجعل الرصيد مساوياً لهذه الكمية بعد الجرد"
          className="btn px-3 py-2 text-sm bg-choco text-white shrink-0"
        >
          تعيين
        </button>
      </div>

      {msg && (
        <p className={`text-xs font-bold ${msg.ok ? "text-mint" : "text-red-600"}`}>{msg.text}</p>
      )}
    </li>
  );
}
