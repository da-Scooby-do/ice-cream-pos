"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { openShiftAction, logoutAction } from "@/lib/actions";
import { money } from "@/lib/money";
import Keypad from "@/components/Keypad";

export default function OpenShiftForm() {
  const router = useRouter();
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await openShiftAction(Number(cash || 0));
      if (res.ok) router.replace("/pos");
      else setError(res.error);
    });
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-bold text-choco/70">نقدية الافتتاح</label>
        <div className="h-20 rounded-2xl bg-cream border-2 border-black/10 grid place-items-center text-3xl font-extrabold text-choco tnum">
          {money(Number(cash || 0))}
        </div>
      </div>

      <Keypad
        value={cash}
        onChange={setCash}
        maxLength={9}
        allowDecimal
        onEnter={submit}
        enterLabel={pending ? "جاري الفتح…" : "فتح الوردية"}
        enterDisabled={pending}
      />

      {error && (
        <p className="text-center text-sm font-bold text-red-600 bg-red-50 rounded-xl py-3">
          {error}
        </p>
      )}

      <form action={logoutAction}>
        <button type="submit" className="w-full text-sm text-choco/50 py-2">
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}
