import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Page, PageHeader } from "@/components/Page";
import { PrintButton } from "@/components/PrintHost";
import { DaySlip, MonthSlip, ShiftSlip } from "@/components/slips";
import { DayView, MonthView } from "@/components/views";
import { can } from "@/lib/perms";
import { dayStatement, monthStatement, shiftStatement } from "@/lib/server/reports";
import { getShop } from "@/lib/server/shop";
import { getSession } from "@/lib/session";
import { addDays, addMonths, isDate, isMonth, localDate, monthOf } from "@/lib/time";
import { SHIFT_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = { view?: string; date?: string; m?: string };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await getSession();
  if (!can(s, "reports")) redirect("/");
  const sp = await searchParams;
  const today = localDate();
  const view = sp.view === "month" ? "month" : "day";
  const date = isDate(sp.date) ? sp.date : today;
  const ym = isMonth(sp.m) ? sp.m : monthOf(today);
  const shop = getShop();

  const tab = (v: "day" | "month", label: string) => (
    <Link
      href={v === "day" ? `/statements?view=day&date=${date}` : `/statements?view=month&m=${ym}`}
      className={`px-4 py-2 rounded-xl text-sm font-semibold ${view === v ? "bg-white shadow-sm" : "text-ink-500"}`}
    >
      {label}
    </Link>
  );
  const nav = (href: string, icon: React.ReactNode, label: string, disabled = false) =>
    disabled ? (
      <span className="btn-soft px-3 py-2 opacity-30">{icon}</span>
    ) : (
      <Link href={href} className="btn-soft px-3 py-2" aria-label={label}>
        {icon}
      </Link>
    );

  if (view === "day") {
    const d = dayStatement(date);
    const closed = d.shifts.filter((x) => x.closed_at).map((x) => shiftStatement(x.id)!);
    return (
      <Page>
        <PageHeader
          title="الكشوفات"
          sub="كشف اليوم وكشف الشهر — الإيرادات والمصروفات وصافي الربح"
          icon={<FileText size={24} />}
          actions={
            <>
              {closed.map((st) => (
                <PrintButton key={st.shift.id} slip={<ShiftSlip s={st} />} label={`كشف ${SHIFT_LABEL[st.shift.kind]}`} />
              ))}
              <PrintButton slip={<DaySlip d={d} shop={shop} />} label="طباعة كشف اليوم" className="btn-dark px-4 py-2.5 text-sm" />
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl bg-ink-100/70 p-1 gap-1">
            {tab("day", "يومي")}
            {tab("month", "شهري")}
          </div>
          <div className="flex items-center gap-1.5">
            {nav(`/statements?view=day&date=${addDays(date, -1)}`, <ChevronRight size={18} />, "اليوم السابق")}
            <form className="inline-flex">
              <input type="hidden" name="view" value="day" />
              <input type="date" name="date" defaultValue={date} max={today} className="input !py-2 tnum" />
              <button type="submit" className="btn-soft px-3 ms-1.5">
                عرض
              </button>
            </form>
            {nav(`/statements?view=day&date=${addDays(date, 1)}`, <ChevronLeft size={18} />, "اليوم التالي", date >= today)}
            {date !== today && (
              <Link href="/statements?view=day" className="btn-ghost px-3 py-2 text-sm">
                اليوم
              </Link>
            )}
          </div>
        </div>
        <DayView d={d} />
      </Page>
    );
  }

  const m = monthStatement(ym);
  return (
    <Page>
      <PageHeader
        title="الكشوفات"
        sub="كشف اليوم وكشف الشهر — الإيرادات والمصروفات وصافي الربح"
        icon={<FileText size={24} />}
        actions={<PrintButton slip={<MonthSlip m={m} shop={shop} />} label="طباعة الكشف الشهري" className="btn-dark px-4 py-2.5 text-sm" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-2xl bg-ink-100/70 p-1 gap-1">
          {tab("day", "يومي")}
          {tab("month", "شهري")}
        </div>
        <div className="flex items-center gap-1.5">
          {nav(`/statements?view=month&m=${addMonths(ym, -1)}`, <ChevronRight size={18} />, "الشهر السابق")}
          <form className="inline-flex">
            <input type="hidden" name="view" value="month" />
            <input type="month" name="m" defaultValue={ym} max={monthOf(today)} className="input !py-2 tnum" />
            <button type="submit" className="btn-soft px-3 ms-1.5">
              عرض
            </button>
          </form>
          {nav(`/statements?view=month&m=${addMonths(ym, 1)}`, <ChevronLeft size={18} />, "الشهر التالي", ym >= monthOf(today))}
        </div>
      </div>
      <MonthView m={m} />
    </Page>
  );
}
