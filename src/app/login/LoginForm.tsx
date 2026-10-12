"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "@/lib/actions";
import Keypad from "@/components/Keypad";

// الدخول بالرقم السري فقط — لا تظهر أسماء الموظفين
// PIN-only login: no staff names are shown; the PIN identifies the person.
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
        router.replace("/");
      } else {
        setError(res.error);
        setPin("");
      }
    });
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
      <div
        dir="ltr"
        aria-label="الرقم السري"
        className="h-20 rounded-2xl bg-cream border-2 border-black/10 flex items-center justify-center gap-3"
      >
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full ${i < pin.length ? "bg-choco" : "bg-choco/15"}`}
          />
        ))}
      </div>

      <Keypad
        value={pin}
        onChange={(v) => {
          setError(null);
          setPin(v);
        }}
        maxLength={6}
        onEnter={submit}
        enterLabel={pending ? "جاري الدخول…" : "دخول"}
        enterDisabled={pending || pin.length < 4}
      />

      {error && (
        <p className="text-center text-sm font-bold text-red-600 bg-red-50 rounded-xl py-3">
          {error}
        </p>
      )}
    </div>
  );
}
