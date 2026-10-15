"use client";

import { X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { ActionResult } from "@/lib/server/errors";

// عناصر الواجهة المشتركة | shared UI pieces.

export function Modal({
  title,
  children,
  onClose,
  size = "sm",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  // Rendered on <body>: an animated page (transform) would otherwise trap the
  // fixed overlay inside the page and crop it.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-[2px] grid place-items-center p-4" onMouseDown={onClose}>
      <div
        className={`w-full ${width} bg-white rounded-3xl shadow-lift animate-pop max-h-[94dvh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-ink-100">
          <h3 className="font-bold text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="btn-ghost w-9 h-9 rounded-xl" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-auto space-y-4">{children}</div>
      </div>
    </div>
  ,
    host
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

/** مجموعة أزرار مع عنوان (ليست label حتى لا يضغط العنوان أول زر) */
export function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <span className="label block">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400">{hint}</span>}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
  suffix,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className={`input tnum text-end ${suffix ? "ps-14" : ""}`}
      />
      {suffix && (
        <span className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-ink-400 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-start ring-1 transition ${
        checked ? "bg-sky-50 ring-sky-300" : "bg-white ring-ink-100 hover:bg-ink-50"
      }`}
    >
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-ink-400 mt-0.5">{hint}</span>}
      </span>
      <span
        className={`relative shrink-0 w-11 h-6 rounded-full transition ${checked ? "bg-sky" : "bg-ink-200"}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
            checked ? "right-0.5" : "right-[22px]"
          }`}
        />
      </span>
    </button>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm font-semibold text-red-700 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>;
}

export function OkNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2.5">{children}</p>;
}

/** تشغيل إجراء خادم مع حالة انتظار وخطأ | run a server action with pending + error */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) onOk?.(res.data);
      else setError(res.error);
    });
  }
  return { pending, error, setError, run };
}

export function SaveBar({
  pending,
  onCancel,
  label = "حفظ",
  disabled,
}: {
  pending: boolean;
  onCancel: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 pt-1">
      <button type="button" onClick={onCancel} className="btn-soft py-3">
        إلغاء
      </button>
      <button type="submit" disabled={pending || disabled} className="btn-go col-span-2 py-3 text-base">
        {pending ? "جاري الحفظ…" : label}
      </button>
    </div>
  );
}

/** حاوية الطباعة — تُرفق بالـ body | the slip's portal on <body> */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  if (!el) return null;
  return createPortal(<div className="print-root">{children}</div>, el);
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      {icon && <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-sky-50 text-sky-700 grid place-items-center">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-ink-400 mt-1">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-2xl bg-ink-100/70 p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition ${
            value === o.value ? "bg-white text-ink shadow-sm" : "text-ink-500 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
