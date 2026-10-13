"use client";

import { ArrowDownToLine, ArrowUpFromLine, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { voidEntryAction } from "@/actions/sales";
import EntryDialog from "@/components/EntryDialog";
import { ErrorNote, useAction } from "@/components/ui";
import { money } from "@/lib/format";
import { clock, shortDate } from "@/lib/time";
import type { EntryRow, Totals } from "@/lib/types";

// سجلّان: الإيرادات والمصروفات | two ledgers side by side.
export default function MoneyBoard({
  totals,
  entries,
  shiftId,
  me,
  isAdmin,
  usedIncome,
  usedExpense,
}: {
  totals: Totals;
  entries: EntryRow[];
  shiftId: string | null;
  me: string;
  isAdmin: boolean;
  usedIncome: string[];
  usedExpense: string[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"income" | "expense" | null>(null);
  const voider = useAction();
  const incomes = entries.filter((e) => e.kind === "income");
  const expenses = entries.filter((e) => e.kind === "expense");

  const canVoid = (e: EntryRow) => isAdmin || (!!shiftId && e.shift_id === shiftId && e.staff_id === me);

  const List = ({ rows }: { rows: EntryRow[] }) => (
    <ul className="divide-y divide-ink-50">
      {rows.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {e.category}
              {e.drawer && <span className="chip bg-ink-50 text-ink-500 ms-2">من الدرج</span>}
            </p>
            {e.note && <p className="text-xs text-ink-500 mt-0.5">{e.note}</p>}
            <p className="text-[11px] text-ink-400 mt-0.5 tnum">
              {shortDate(e.business_date)} · {clock(e.created_at)} · {e.staff}
            </p>
          </div>
          <span className="tnum font-bold">{money(e.amount)}</span>
          {canVoid(e) && (
            <button
              type="button"
              title="إلغاء القيد"
              disabled={voider.pending}
              onClick={() => {
                if (confirm(`إلغاء قيد «${e.category}» بمبلغ ${money(e.amount)}؟`)) {
                  voider.run(() => voidEntryAction(e.id), () => router.refresh());
                }
              }}
              className="w-7 h-7 rounded-lg grid place-items-center text-ink-300 hover:bg-red-50 hover:text-red-700"
            >
              <X size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <ErrorNote error={voider.error} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 grid place-items-center">
              <ArrowDownToLine size={18} />
            </span>
            <h2 className="font-bold text-lg">الإيرادات</h2>
            <div className="flex-1" />
            <button type="button" onClick={() => setDialog("income")} className="btn-soft px-3 py-2 text-sm">
              <Plus size={16} /> إيراد آخر
            </button>
          </div>
          <div className="rounded-2xl bg-emerald-50/60 ring-1 ring-emerald-100 px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>مبيعات نقدية</span>
              <span className="tnum font-semibold">{money(totals.sales_cash)}</span>
            </div>
            <div className="flex justify-between">
              <span>مبيعات تحويل بنكي</span>
              <span className="tnum font-semibold">{money(totals.sales_bank)}</span>
            </div>
          </div>
          {incomes.length > 0 ? <List rows={incomes} /> : <p className="text-sm text-ink-400 py-4">لا توجد إيرادات أخرى في هذه الفترة.</p>}
          <div className="flex justify-between border-t border-ink-100 pt-3 mt-1 font-bold">
            <span>الإجمالي</span>
            <span className="tnum">{money(totals.income)}</span>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-red-100 text-red-800 grid place-items-center">
              <ArrowUpFromLine size={18} />
            </span>
            <h2 className="font-bold text-lg">المصروفات</h2>
            <div className="flex-1" />
            <button type="button" onClick={() => setDialog("expense")} className="btn-go px-3 py-2 text-sm">
              <Plus size={16} /> مصروف
            </button>
          </div>
          {expenses.length > 0 ? <List rows={expenses} /> : <p className="text-sm text-ink-400 py-4">لا توجد مصروفات في هذه الفترة.</p>}
          <div className="flex justify-between border-t border-ink-100 pt-3 mt-1 font-bold">
            <span>الإجمالي</span>
            <span className="tnum">{money(totals.expenses)}</span>
          </div>
        </section>
      </div>
      {dialog && (
        <EntryDialog
          kind={dialog}
          shiftOpen={!!shiftId}
          used={dialog === "income" ? usedIncome : usedExpense}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
