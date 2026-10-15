"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { openShiftAction } from "@/actions/sales";
import Keypad from "@/components/Keypad";
import { ErrorNote, useAction } from "@/components/ui";
import { money, num } from "@/lib/format";
import type { ShiftKind, Totals } from "@/lib/types";

// فتح الوردية | open a shift: day or night, and the cash already in the drawer.
export default function OpenShiftForm({ name, suggested, today }: { name: string; suggested: ShiftKind; today: Totals }) {
  const router = useRouter();
  const [kind, setKind] = useState<ShiftKind>(suggested);
  const [cash, setCash] = useState("");
  const { pending, error, run } = useAction();

  const open = () =>
    run(() => openShiftAction(kind, cash || "0"), () => {
      router.replace("/pos");
      router.refresh();
    });

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-3xl grid md:grid-cols-2 gap-5 animate-rise">
        <div className="card p-6 space-y-5">
          <div>
            <p className="text-sm text-ink-400">أهلاً {name} 👋</p>
            <h1 className="text-2xl font-bold">فتح وردية جديدة</h1>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["day", "صباحية", Sun],
                ["night", "مسائية", Moon],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`btn flex-col py-6 text-lg ring-2 ${
                  kind === k
                    ? k === "day"
                      ? "bg-day text-white ring-day-text"
                      : "bg-night text-white ring-night-text"
                    : k === "day"
                      ? "bg-white ring-ink-100 text-day-text"
                      : "bg-white ring-ink-100 text-night-text"
                }`}
              >
                <Icon size={30} />
                الوردية {label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-ink-50 ring-1 ring-ink-100 p-4">
            <p className="label">النقدية الموجودة في الدرج الآن</p>
            <p className="text-3xl font-bold tnum mt-1">{money(Number(cash || 0))}</p>
          </div>
          {today.orders > 0 && (
            <p className="text-sm text-ink-500 bg-lemon-50 ring-1 ring-lemon-200 rounded-2xl px-4 py-3">
              اليوم حتى الآن: {num(today.orders)} فاتورة · إيرادات {money(today.income)} · صافي {money(today.net)}
            </p>
          )}
          <ErrorNote error={error} />
        </div>
        <div className="card p-6">
          <Keypad
            value={cash}
            onChange={setCash}
            allowDecimal
            maxLength={10}
            onEnter={open}
            enterLabel={pending ? "جاري الفتح…" : "فتح الوردية وبدء البيع"}
            enterDisabled={pending}
          />
        </div>
      </div>
    </main>
  );
}
