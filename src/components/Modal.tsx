"use client";

// نافذة منبثقة | a dialog. Esc closes it.
import { useEffect } from "react";

export default function Modal({
  title, children, onClose, wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-sm"} bg-white rounded-3xl shadow-2xl p-5 space-y-4 max-h-[95dvh] overflow-auto`}>
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-choco text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-cream text-choco/60 font-bold"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
