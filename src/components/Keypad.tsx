"use client";

// لوحة أرقام كبيرة | a big numeric keypad.
// Works with a mouse, a touchscreen, or the laptop keyboard — physical keys
// are bound too, so a fast cashier never needs the mouse.
import { Delete } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

export default function Keypad({
  value,
  onChange,
  onEnter,
  maxLength = 8,
  allowDecimal = false,
  enterLabel = "تم",
  enterDisabled = false,
  compact = false,
  listen = true,
}: {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  maxLength?: number;
  allowDecimal?: boolean;
  enterLabel?: React.ReactNode;
  enterDisabled?: boolean;
  compact?: boolean;
  /** bind the physical keyboard (turn off when a text input has focus) */
  listen?: boolean;
}) {
  // The latest value, updated on every key — not only when React re-renders —
  // so fast typing never drops a digit.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);

  function emit(next: string) {
    latest.current = next;
    onChange(next);
  }

  function push(ch: string) {
    const cur = latest.current;
    if (ch === ".") {
      if (!allowDecimal || cur.includes(".")) return;
      emit((cur || "0") + ".");
      return;
    }
    if (cur.length >= maxLength) return;
    emit(cur === "0" ? ch : cur + ch);
  }

  useEffect(() => {
    if (!listen) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        emit(latest.current.slice(0, -1));
      } else if (e.key === "." || e.key === ",") {
        e.preventDefault();
        push(".");
      } else if (e.key === "Enter" && onEnter && !enterDisabled) {
        e.preventDefault();
        onEnter();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pad = compact ? "py-3 text-xl" : "py-4 text-2xl";
  const key = `btn ${pad} bg-ink-50 hover:bg-sky-50 ring-1 ring-ink-100 text-ink tnum font-semibold`;

  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
        <button key={k} type="button" onClick={() => push(k)} className={key}>
          {k}
        </button>
      ))}
      {allowDecimal ? (
        <button type="button" onClick={() => push(".")} className={key}>
          .
        </button>
      ) : (
        <button type="button" onClick={() => emit("")} className={`${key} !text-sm text-ink-500`}>
          مسح
        </button>
      )}
      <button type="button" onClick={() => push("0")} className={key}>
        0
      </button>
      <button
        type="button"
        onClick={() => emit(latest.current.slice(0, -1))}
        className={`btn ${pad} bg-cone/15 text-ink ring-1 ring-cone/30 hover:bg-cone/25`}
        aria-label="حذف"
      >
        <Delete size={22} />
      </button>
      {onEnter && (
        <button
          type="button"
          onClick={onEnter}
          disabled={enterDisabled}
          className={`btn-go col-span-3 ${compact ? "py-3.5 text-base" : "py-4 text-lg"}`}
          dir="rtl"
        >
          {enterLabel}
        </button>
      )}
    </div>
  );
}
