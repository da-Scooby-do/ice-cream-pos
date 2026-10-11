"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginAction } from "@/lib/actions";
import type { Staff } from "@/lib/types";
import Keypad from "@/components/Keypad";

export default function LoginForm({ staff }: { staff: Staff[] }) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await loginAction(staffId, pin);
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
      {/* اختيار الموظف | who is on the counter */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-choco/70">الموظف</label>
        <div className="grid grid-cols-2 gap-2">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStaffId(s.id)}
              className={`btn py-4 text-base border-2 ${
                staffId === s.id
                  ? "border-berry bg-berry/10 text-berry"
                  : "border-black/10 text-choco/70"
              }`}
            >
              {s.name}
              {s.role === "manager" && (
                <span className="block text-xs font-normal opacity-60">مدير</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* الرقم السري | PIN */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-choco/70">الرقم السري</label>
        <div
          dir="ltr"
          className="h-16 rounded-2xl bg-cream border-2 border-black/10 grid place-items-center text-3xl tracking-[0.5em] tnum"
        >
          {"•".repeat(pin.length) || <span className="text-choco/20 text-base tracking-normal">••••</span>}
        </div>
      </div>

      <Keypad
        value={pin}
        onChange={setPin}
        maxLength={6}
        onEnter={submit}
        enterLabel={pending ? "جاري الدخول…" : "دخول"}
        enterDisabled={pending || pin.length < 4 || !staffId}
      />

      {error && (
        <p className="text-center text-sm font-bold text-red-600 bg-red-50 rounded-xl py-3">
          {error}
        </p>
      )}
    </div>
  );
}
