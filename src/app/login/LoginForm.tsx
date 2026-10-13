"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "@/actions/auth";
import Keypad from "@/components/Keypad";

// الدخول بالرقم السري فقط — لا تظهر أسماء الموظفين
export default function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await loginAction(pin);
      if (res.ok) {
        router.replace(res.data.home);
        router.refresh();
      } else {
        setError(res.error);
        setPin("");
      }
    });
  }

  return (
    <div className="card p-5 space-y-4">
      <div
        dir="ltr"
        aria-label="الرقم السري"
        className={`h-16 rounded-2xl bg-ink-50 ring-1 flex items-center justify-center gap-3 transition ${
          error ? "ring-red-300 bg-red-50" : "ring-ink-100"
        }`}
      >
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full transition ${i < pin.length ? "bg-ink scale-110" : "bg-ink-200"}`}
          />
        ))}
      </div>

      <Keypad
        value={pin}
        onChange={(v) => {
          setError(null);
          setPin(v);
        }}
        maxLength={8}
        onEnter={submit}
        enterLabel={pending ? "جاري الدخول…" : "دخول"}
        enterDisabled={pending || pin.length < 4}
      />

      {error && <p className="text-center text-sm font-semibold text-red-700 bg-red-50 rounded-xl py-2.5">{error}</p>}
    </div>
  );
}
