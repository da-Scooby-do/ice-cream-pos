import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { Page, PageHeader, Stat } from "@/components/Page";
import RangePicker from "@/components/RangePicker";
import { money } from "@/lib/format";
import { can } from "@/lib/perms";
import { resolveRange } from "@/lib/ranges";
import { listEntries, usedCategories } from "@/lib/server/money";
import { totals } from "@/lib/server/reports";
import { currentShift } from "@/lib/server/shifts";
import { getSession } from "@/lib/session";
import { shortDate } from "@/lib/time";
import MoneyBoard from "./MoneyBoard";

export const dynamic = "force-dynamic";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const s = await getSession();
  if (!can(s, "expenses")) redirect("/");
  const r = resolveRange(await searchParams);
  const t = totals({ from: r.from, to: r.to });
  const shift = currentShift();
  return (
    <Page>
      <PageHeader
        title="الإيرادات والمصروفات"
        sub={r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} — ${shortDate(r.to)}`}
        icon={<Wallet size={24} />}
      />
      <RangePicker value={r.key} from={r.from} to={r.to} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="إجمالي الإيرادات" value={money(t.income)} tone="good" hint={`مبيعات ${money(t.sales)} + أخرى ${money(t.other_income)}`} />
        <Stat label="إجمالي المصروفات" value={money(t.expenses)} tone="bad" />
        <Stat label="صافي الربح" value={money(t.net)} tone="dark" />
      </div>
      <MoneyBoard
        totals={t}
        entries={listEntries({ from: r.from, to: r.to })}
        shiftId={shift?.id ?? null}
        me={s!.id}
        isAdmin={s!.role === "admin"}
        usedIncome={usedCategories("income")}
        usedExpense={usedCategories("expense")}
      />
    </Page>
  );
}
