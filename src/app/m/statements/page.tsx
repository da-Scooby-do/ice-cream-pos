import Link from "next/link";
import { DayView, MonthView } from "@/components/views";
import { getSnapshot, listSnapshotKeys } from "@/lib/cloud/store";
import { isDate, isMonth, longDate, monthLabel } from "@/lib/time";
import type { DayStatement, MonthStatement } from "@/lib/types";

export const dynamic = "force-dynamic";

// الكشوفات على الجوال | day & month statements from the cloud copy.
export default async function PhoneStatements({ searchParams }: { searchParams: Promise<{ day?: string; month?: string }> }) {
  const sp = await searchParams;
  if (isDate(sp.day)) {
    const snap = await getSnapshot<DayStatement>(`day:${sp.day}`);
    return (
      <>
        <Link href="/m/statements" className="btn-soft px-4 py-2 text-sm">
          ← كل الكشوفات
        </Link>
        {snap ? <DayView d={snap.data} /> : <p className="card p-6 text-center text-ink-500">لا يوجد كشف لهذا اليوم</p>}
      </>
    );
  }
  if (isMonth(sp.month)) {
    const snap = await getSnapshot<MonthStatement>(`month:${sp.month}`);
    return (
      <>
        <Link href="/m/statements" className="btn-soft px-4 py-2 text-sm">
          ← كل الكشوفات
        </Link>
        {snap ? <MonthView m={snap.data} /> : <p className="card p-6 text-center text-ink-500">لا يوجد كشف لهذا الشهر</p>}
      </>
    );
  }

  const [months, days] = await Promise.all([listSnapshotKeys("month:"), listSnapshotKeys("day:")]);
  return (
    <>
      <section className="card p-5">
        <h2 className="font-bold mb-3">الكشف الشهري</h2>
        <div className="flex flex-wrap gap-2">
          {months.map((k) => (
            <Link key={k} href={`/m/statements?month=${k.slice(6)}`} className="btn-soft px-4 py-2 text-sm">
              {monthLabel(k.slice(6))}
            </Link>
          ))}
          {!months.length && <p className="text-sm text-ink-400">لا يوجد بعد</p>}
        </div>
      </section>
      <section className="card p-5">
        <h2 className="font-bold mb-3">كشف اليوم</h2>
        <ul className="divide-y divide-ink-50">
          {days.slice(0, 60).map((k) => (
            <li key={k}>
              <Link href={`/m/statements?day=${k.slice(4)}`} className="flex py-2.5 text-sm hover:text-sky-700">
                {longDate(k.slice(4))}
              </Link>
            </li>
          ))}
          {!days.length && <li className="text-sm text-ink-400">لا يوجد بعد</li>}
        </ul>
      </section>
    </>
  );
}
