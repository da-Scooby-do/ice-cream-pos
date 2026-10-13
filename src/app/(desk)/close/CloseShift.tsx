"use client";

import { ArrowRight, LogOut, Plus, Printer, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/actions/auth";
import { closeShiftAction, voidEntryAction } from "@/actions/sales";
import EntryDialog from "@/components/EntryDialog";
import Keypad from "@/components/Keypad";
import { ShiftSlip } from "@/components/slips";
import { ErrorNote, PrintPortal, useAction } from "@/components/ui";
import { money, num } from "@/lib/format";
import { printSlip } from "@/lib/print";
import { clock } from "@/lib/time";
import { SHIFT_LABEL, type ShiftStatement } from "@/lib/types";

// تقفيل الوردية | close the shift: add the shift's expenses, count the drawer,
// and print the statement (income, expenses, net profit, cash check).
export default function CloseShift({
  live,
  canExpense,
  canVoidEntries,
  expenseCategories,
}: {
  live: ShiftStatement;
  canExpense: boolean;
  canVoidEntries: boolean;
  expenseCategories: string[];
}) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [typing, setTyping] = useState(false);
  const [final, setFinal] = useState<ShiftStatement | null>(null);
  const [expOpen, setExpOpen] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const { pending, error, run } = useAction();
  const voider = useAction();

  const t = live.totals;
  const d = live.drawer;
  const countedNum = Number(counted || 0);
  const diff = Math.round((countedNum - d.expected) * 100) / 100;

  useEffect(() => {
    if (!final) return;
    const timer = setTimeout(async () => {
      const r = await printSlip();
      if (!r.ok) setPrintError(r.error ?? "تحقق من الطابعة");
    }, 80);
    return () => clearTimeout(timer);
  }, [final]);

  const close = () => run(() => closeShiftAction(live.shift.id, counted, note), setFinal);

  if (final) {
    return (
      <main className="min-h-dvh p-6 grid place-items-center">
        <div className="w-full max-w-4xl grid md:grid-cols-[1fr_340px] gap-5 animate-rise">
          <div className="card p-5 bg-ink-50 overflow-auto max-h-[88dvh]">
            <div className="bg-white shadow-card mx-auto w-fit rounded-xl">
              <ShiftSlip s={final} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="card p-5 text-center">
              <p className="text-sm text-ink-400">تم تقفيل {SHIFT_LABEL[final.shift.kind]} ✓</p>
              <p className="label mt-3">صافي الربح</p>
              <p className={`text-4xl font-bold tnum ${final.totals.net < 0 ? "text-red-700" : ""}`}>{money(final.totals.net)}</p>
              {final.drawer.diff != null && final.drawer.diff !== 0 && (
                <p className={`mt-2 font-bold ${final.drawer.diff < 0 ? "text-red-700" : "text-amber-700"}`}>
                  {final.drawer.diff < 0 ? "عجز" : "زيادة"} في الدرج: {money(Math.abs(final.drawer.diff))}
                </p>
              )}
            </div>
            <ErrorNote error={printError && `لم يُطبع الكشف: ${printError}`} />
            <button type="button" onClick={() => void printSlip()} className="btn-soft w-full py-3.5">
              <Printer size={18} /> طباعة الكشف مرة أخرى
            </button>
            <Link href="/shift" className="btn-go w-full py-3.5">
              <RotateCcw size={18} /> فتح وردية جديدة
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-dark w-full py-3.5">
                <LogOut size={18} /> خروج
              </button>
            </form>
          </div>
        </div>
        <PrintPortal>
          <ShiftSlip s={final} />
        </PrintPortal>
      </main>
    );
  }

  return (
    <main className="min-h-dvh p-5 lg:p-7">
      <div className="max-w-[1180px] mx-auto space-y-4 animate-rise">
        <div className="flex items-center gap-3">
          <Link href="/pos" className="btn-soft px-3 py-2 text-sm">
            <ArrowRight size={16} /> رجوع للكاشير
          </Link>
          <h1 className="text-2xl font-bold">تقفيل {SHIFT_LABEL[live.shift.kind]}</h1>
          <span className="text-sm text-ink-400">
            فُتحت {clock(live.shift.opened_at)} · {live.shift.opened_by} · {num(t.orders)} فاتورة
          </span>
        </div>

        <div className="grid lg:grid-cols-[1fr_1fr_380px] gap-4 items-start">
          {/* الإيرادات | income */}
          <section className="card p-5 space-y-2">
            <h2 className="font-bold text-emerald-800">الإيرادات</h2>
            {live.income_lines.length ? (
              live.income_lines.map((l) => (
                <div key={l.category} className="flex justify-between text-sm">
                  <span>{l.category}</span>
                  <span className="tnum font-semibold">{money(l.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-400">لا توجد مبيعات بعد</p>
            )}
            <div className="flex justify-between border-t border-ink-100 pt-2 font-bold">
              <span>الإجمالي</span>
              <span className="tnum">{money(t.income)}</span>
            </div>
          </section>

          {/* المصروفات | expenses */}
          <section className="card p-5 space-y-2">
            <div className="flex items-center">
              <h2 className="font-bold text-red-800">المصروفات</h2>
              <div className="flex-1" />
              {canExpense && (
                <button type="button" onClick={() => setExpOpen(true)} className="btn-soft px-3 py-1.5 text-sm">
                  <Plus size={15} /> إضافة مصروف
                </button>
              )}
            </div>
            {live.expenses.length ? (
              live.expenses.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p>
                      {e.category}
                      {e.drawer && <span className="text-[10px] text-ink-400"> · من الدرج</span>}
                    </p>
                    {e.note && <p className="text-xs text-ink-400 truncate">{e.note}</p>}
                  </div>
                  <span className="tnum font-semibold">{money(e.amount)}</span>
                  {canVoidEntries && (
                    <button
                      type="button"
                      title="إلغاء القيد"
                      disabled={voider.pending}
                      onClick={() => voider.run(() => voidEntryAction(e.id), () => router.refresh())}
                      className="w-6 h-6 rounded-lg grid place-items-center text-ink-300 hover:bg-red-50 hover:text-red-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-400">لا توجد مصروفات في هذه الوردية</p>
            )}
            <ErrorNote error={voider.error} />
            <div className="flex justify-between border-t border-ink-100 pt-2 font-bold">
              <span>الإجمالي</span>
              <span className="tnum">{money(t.expenses)}</span>
            </div>
            <div className="rounded-2xl bg-ink-800 text-white px-4 py-3 flex justify-between items-center mt-2">
              <span className="font-semibold">صافي الربح</span>
              <span className="text-2xl font-bold tnum text-lemon">{money(t.net)}</span>
            </div>
          </section>

          {/* الدرج | the cash count */}
          <section className="card p-5 space-y-3 lg:row-span-2">
            <div className="text-sm space-y-1">
              <Line l="رصيد الافتتاح" v={money(d.opening)} />
              <Line l="+ مبيعات نقدية" v={money(d.cash_sales)} />
              {d.cash_income > 0 && <Line l="+ إيرادات نقدية" v={money(d.cash_income)} />}
              {d.cash_expenses > 0 && <Line l="− مصروفات من الدرج" v={money(d.cash_expenses)} />}
              <div className="flex justify-between border-t border-ink-100 pt-1.5 font-bold">
                <span>المتوقع في الدرج</span>
                <span className="tnum">{money(d.expected)}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-ink-50 ring-1 ring-ink-100 p-3 text-center">
              <p className="label">النقدية المعدودة</p>
              <p className="text-3xl font-bold tnum">{money(countedNum)}</p>
              {counted !== "" && (
                <p
                  className={`mt-1 font-bold ${
                    diff === 0 ? "text-emerald-700" : diff < 0 ? "text-red-700" : "text-amber-700"
                  }`}
                >
                  {diff === 0 ? "مطابق ✓" : diff < 0 ? `عجز ${money(-diff)}` : `زيادة ${money(diff)}`}
                </p>
              )}
            </div>
            <Keypad
              value={counted}
              onChange={setCounted}
              allowDecimal
              maxLength={10}
              compact
              listen={!typing && !expOpen}
              onEnter={close}
              enterLabel={pending ? "جاري التقفيل…" : "تقفيل وطباعة الكشف"}
              enterDisabled={pending || counted === ""}
            />
            <input
              className="input text-sm"
              placeholder="ملاحظة (اختياري)"
              value={note}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(e) => setNote(e.target.value)}
            />
            <ErrorNote error={error} />
          </section>

          {live.products.length > 0 && (
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-bold mb-2">الأصناف المباعة في الوردية</h2>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {live.products.map((p, i) => (
                  <div key={i} className="flex justify-between border-b border-ink-50 py-1">
                    <span>
                      {p.product}
                      {p.size ? <span className="text-ink-400"> — {p.size}</span> : null}
                    </span>
                    <span className="tnum">
                      <b>{num(p.qty)}</b> <span className="text-ink-400">· {money(p.revenue)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {expOpen && <EntryDialog kind="expense" shiftOpen used={expenseCategories} onClose={() => setExpOpen(false)} />}
    </main>
  );
}

const Line = ({ l, v }: { l: string; v: string }) => (
  <div className="flex justify-between">
    <span className="text-ink-500">{l}</span>
    <span className="tnum">{v}</span>
  </div>
);
