"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { printSlip } from "@/lib/print";

// زر طباعة لأي قسيمة | print any slip from anywhere with one shared slot.

const useSlot = create<{ node: React.ReactNode | null; set: (n: React.ReactNode | null) => void }>((set) => ({
  node: null,
  set: (node) => set({ node }),
}));

export function PrintHost() {
  const node = useSlot((s) => s.node);
  if (!node || typeof document === "undefined") return null;
  return createPortal(<div className="print-root">{node}</div>, document.body);
}

export function PrintButton({
  slip,
  label = "طباعة",
  className = "btn-soft px-4 py-2.5 text-sm",
}: {
  slip: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const set = useSlot((s) => s.set);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        className={className}
        onClick={async () => {
          setMsg(null);
          set(slip);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const r = await printSlip();
          if (!r.ok) setMsg(r.error ?? "تعذرت الطباعة");
          set(null);
        }}
      >
        <Printer size={16} /> {label}
      </button>
      {msg && <span className="text-xs text-red-700 mt-1">{msg}</span>}
    </span>
  );
}
