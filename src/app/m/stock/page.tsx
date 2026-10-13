import Link from "next/link";
import { getSnapshot, listSnapshotKeys } from "@/lib/cloud/store";
import { money, qty } from "@/lib/format";
import { isMonth, monthLabel, shortDate } from "@/lib/time";
import type { StockLevel, StockMonth } from "@/lib/types";

export const dynamic = "force-dynamic";

// المخزون على الجوال | stock levels + the monthly ledger.
export default async function PhoneStock({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const months = await listSnapshotKeys("stockmonth:");
  const ym = isMonth(sp.month) ? sp.month : months[0]?.slice(11);
  const [levels, month] = await Promise.all([
    getSnapshot<StockLevel[]>("stock"),
    ym ? getSnapshot<StockMonth>(`stockmonth:${ym}`) : Promise.resolve(null),
  ]);
  const items = levels?.data ?? [];
  const low = items.filter((i) => i.low);

  return (
    <>
      {low.length > 0 && (
        <div className="rounded-3xl bg-red-50 ring-1 ring-red-200 p-4">
          <p className="font-bold text-red-800">تحتاج توريد ({low.length})</p>
          <p className="text-sm text-red-800/80 mt-1">{low.map((l) => `${l.name} (${qty(l.qty, l.unit)})`).join("، ")}</p>
        </div>
      )}
      <section className="card p-5">
        <h2 className="font-bold mb-2">المخزون الحالي</h2>
        <ul className="divide-y divide-ink-50">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between py-2 text-sm">
              <span className="font-semibold">{i.name}</span>
              <span className={`tnum ${i.low ? "text-red-700 font-bold" : ""}`}>{qty(i.qty, i.unit)}</span>
            </li>
          ))}
          {!items.length && <li className="text-sm text-ink-400 py-2">لا توجد بيانات</li>}
        </ul>
      </section>

      {month && (
        <section className="card p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {months.slice(0, 12).map((k) => (
              <Link
                key={k}
                href={`/m/stock?month=${k.slice(11)}`}
                className={`chip px-3 py-1.5 text-sm ${k.slice(11) === ym ? "bg-ink text-white" : "bg-ink-50"}`}
              >
                {monthLabel(k.slice(11))}
              </Link>
            ))}
          </div>
          <h2 className="font-bold">حركة المخزون — {monthLabel(month.data.month)}</h2>
          <div className="overflow-x-auto">
            <table className="table-x text-xs">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>أول الشهر</th>
                  <th>وارد</th>
                  <th>مستهلك</th>
                  <th>آخر الشهر</th>
                </tr>
              </thead>
              <tbody>
                {month.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.name}</td>
                    <td className="tnum">{qty(r.opening, r.unit)}</td>
                    <td className="tnum text-emerald-700">{r.restocked ? qty(r.restocked, r.unit) : "—"}</td>
                    <td className="tnum text-red-700">{r.sold ? qty(r.sold, r.unit) : "—"}</td>
                    <td className="tnum font-bold">{qty(r.closing, r.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {month.data.restocks.length > 0 && (
            <>
              <h3 className="font-bold pt-2">التوريدات</h3>
              <ul className="divide-y divide-ink-50 text-sm">
                {month.data.restocks.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 py-2">
                    <span>
                      <span className="tnum text-ink-400">{shortDate(r.date)}</span> {r.item}
                    </span>
                    <span className="tnum">
                      +{qty(r.qty, r.unit)}
                      {r.cost ? ` · ${money(r.cost)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
