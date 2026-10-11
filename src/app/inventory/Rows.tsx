"use client";

import { useState, useTransition } from "react";
import { restockAction, updatePriceAction } from "@/lib/actions";
import { money, num, weight } from "@/lib/money";

export function RestockRow({
  type, id, name, stock, threshold, unit,
}: {
  type: "flavor" | "packaging" | "extra";
  id: string;
  name: string;
  stock: number;
  threshold: number;
  unit: "gram" | "piece" | "portion";
}) {
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const low = stock <= threshold;
  const shown = unit === "gram" ? weight(stock) : num(stock);

  function save() {
    const n = Number(qty);
    if (!n) return;
    setMsg(null);
    start(async () => {
      const res = await restockAction(type, id, n);
      if (res.ok) {
        setQty("");
        setMsg({ ok: true, text: "تم" });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <li className="flex items-center gap-2 py-2.5">
      <span className="flex-1 min-w-0">
        <span className="font-bold text-choco text-sm">{name}</span>
        <span className={`block text-xs tnum ${low ? "text-red-600 font-bold" : "text-choco/50"}`}>
          {low && "⚠ "}المتوفر: {shown}
        </span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={unit === "gram" ? "جرام" : "عدد"}
        className="w-24 rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm tnum select-text"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending || !Number(qty)}
        className="btn px-3 py-2 text-sm bg-mint text-white"
      >
        {pending ? "…" : "إضافة"}
      </button>
      {msg && (
        <span className={`text-xs font-bold ${msg.ok ? "text-mint" : "text-red-600"}`}>{msg.text}</span>
      )}
    </li>
  );
}

export function PriceRow({
  id, name, price, perKg,
}: {
  id: string;
  name: string;
  price: number;
  perKg: boolean;
}) {
  const [val, setVal] = useState(String(price));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = Number(val) !== price;

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updatePriceAction(id, Number(val));
      setMsg(res.ok ? { ok: true, text: "تم" } : { ok: false, text: res.error });
    });
  }

  return (
    <li className="flex items-center gap-2 py-2.5">
      <span className="flex-1 min-w-0">
        <span className="font-bold text-choco text-sm">{name}</span>
        <span className="block text-xs text-choco/50 tnum">
          {money(price)}{perKg ? " / كجم" : ""}
        </span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        className="w-28 rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm tnum select-text"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="btn px-3 py-2 text-sm bg-choco text-white"
      >
        {pending ? "…" : "حفظ"}
      </button>
      {msg && (
        <span className={`text-xs font-bold ${msg.ok ? "text-mint" : "text-red-600"}`}>{msg.text}</span>
      )}
    </li>
  );
}
