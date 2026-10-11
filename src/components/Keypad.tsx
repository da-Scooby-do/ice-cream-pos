"use client";

// لوحة أرقام كبيرة | a big numeric keypad.
// Works with a mouse, a touchscreen, or the ThinkPad's number row —
// physical keys are bound too so a fast cashier never needs the mouse.
import { useEffect } from "react";

export default function Keypad({
  value,
  onChange,
  onEnter,
  maxLength = 8,
  allowDecimal = false,
  enterLabel = "تم",
  enterDisabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  maxLength?: number;
  allowDecimal?: boolean;
  enterLabel?: string;
  enterDisabled?: boolean;
}) {
  function push(ch: string) {
    if (ch === "." ) {
      if (!allowDecimal || value.includes(".")) return;
      onChange((value || "0") + ".");
      return;
    }
    if (value.length >= maxLength) return;
    // no leading zeros
    onChange(value === "0" ? ch : value + ch);
  }

  // اختصارات الكيبورد | physical keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onChange(value.slice(0, -1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        onChange("");
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

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => push(k)}
          className="btn py-5 text-2xl bg-cream border-2 border-black/10 text-choco tnum hover:bg-berry/5"
        >
          {k}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange(value.slice(0, -1))}
        className="btn py-5 text-xl bg-amber-50 border-2 border-amber-200 text-amber-700"
        aria-label="حذف"
      >
        ⌫
      </button>

      <button
        type="button"
        onClick={() => push("0")}
        className="btn py-5 text-2xl bg-cream border-2 border-black/10 text-choco tnum hover:bg-berry/5"
      >
        0
      </button>

      {allowDecimal ? (
        <button
          type="button"
          onClick={() => push(".")}
          className="btn py-5 text-2xl bg-cream border-2 border-black/10 text-choco"
        >
          .
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onChange("")}
          className="btn py-5 text-base bg-cream border-2 border-black/10 text-choco/60"
        >
          مسح
        </button>
      )}

      {onEnter && (
        <button
          type="button"
          onClick={onEnter}
          disabled={enterDisabled}
          className="btn col-span-3 py-5 text-xl bg-mint text-white"
        >
          {enterLabel}
        </button>
      )}
    </div>
  );
}
