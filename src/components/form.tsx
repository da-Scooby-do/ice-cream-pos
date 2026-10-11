"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";
import Modal from "./Modal";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-choco/60">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-choco/40">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border-2 border-black/10 bg-cream px-3 py-2.5 text-choco select-text focus:border-berry outline-none";

export function NumberInput({
  value, onChange, step = "any",
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} tnum`}
      dir="ltr"
    />
  );
}

export function FormShell({
  title, error, pending, onClose, onSave, children,
}: {
  title: string;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="space-y-4"
      >
        {children}
        {error && (
          <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>
        )}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn py-3.5 bg-cream text-choco border border-black/10">
            إلغاء
          </button>
          <button type="submit" disabled={pending} className="btn col-span-2 py-3.5 text-lg bg-mint text-white">
            {pending ? "جاري الحفظ…" : "حفظ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** حفظ ثم إغلاق | run a save action, close on success, show the error otherwise. */
export function useSave(onClose: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (run: () => Promise<ActionResult>) => {
    setError(null);
    start(async () => {
      const res = await run();
      if (res.ok) onClose();
      else setError(res.error);
    });
  };
  return { pending, error, save };
}

export const str = (v: number | null | undefined, fallback = "") =>
  v == null || Number.isNaN(Number(v)) ? fallback : String(Number(v));

