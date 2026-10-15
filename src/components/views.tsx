// عرض الكشوفات على الشاشة | statement views (used on the laptop and the phone).
// Colors follow src/lib/colors.ts: green = in, red = out, amber/violet = day/night.
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark, Moon, Sun, TrendingDown, TrendingUp } from "lucide-react";
import { COLOR, SHIFT_COLOR } from "@/lib/colors";
import { grams, money, num, pct } from "@/lib/format";
import { clock, longDate, monthLabel, shortDate } from "@/lib/time";
import { SHIFT_LABEL, type DayStatement, type MoneyLine, type MonthStatement, type ProductSale, type Totals } from "@/lib/types";

export function TotalsStrip({ t }: { t: Totals }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <InTile value={money(t.income)} hint={`${num(t.orders)} فاتورة`} />
      <OutTile value={money(t.expenses)} />
      <NetTile net={t.net} income={t.income} />
      <PayTile t={t} />
    </div>
  );
}

/** الإيرادات — أخضر مع سهم داخل | money in */
export function InTile({ value, hint, label = "الإيرادات" }: { value: string; hint?: string; label?: string }) {
  return (
    <div className="rounded-3xl p-4 shadow-card bg-inflow-soft ring-1 ring-inflow-ring">
      <p className="text-xs font-semibold text-inflow-text flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-inflow text-white grid place-items-center"><ArrowDownLeft size={13} strokeWidth={3} /></span>
        {label} <span className="font-normal text-ink-400">· داخل</span>
      </p>
      <p className="text-2xl font-bold tnum mt-1.5">{value}</p>
      {hint && <p className="text-xs mt-1 text-ink-500">{hint}</p>}
    </div>
  );
}

/** المصروفات — أحمر مع سهم خارج | money out */
export function OutTile({ value, hint, label = "المصروفات" }: { value: string; hint?: string; label?: string }) {
  return (
    <div className="rounded-3xl p-4 shadow-card bg-outflow-soft ring-1 ring-outflow-ring">
      <p className="text-xs font-semibold text-outflow-text flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-outflow text-white grid place-items-center"><ArrowUpRight size={13} strokeWidth={3} /></span>
        {label} <span className="font-normal text-ink-400">· خارج</span>
      </p>
      <p className="text-2xl font-bold tnum mt-1.5">{value}</p>
      {hint && <p className="text-xs mt-1 text-ink-500">{hint}</p>}
    </div>
  );
}

/** صافي الربح — أصفر إذا ربح، أحمر مع سهم هابط إذا خسارة | profit or loss */
export function NetTile({ net, income }: { net: number; income: number }) {
  const loss = net < 0;
  return (
    <div className="rounded-3xl p-4 shadow-card bg-ink-800 text-white">
      <p className="text-xs font-semibold text-ink-300 flex items-center gap-1.5">
        {loss ? <TrendingDown size={15} className="text-red-300" /> : <TrendingUp size={15} className="text-lemon" />}
        {loss ? "خسارة" : "صافي الربح"}
      </p>
      <p className={`text-2xl font-bold tnum mt-1.5 ${loss ? "text-red-300" : "text-lemon"}`}>{money(net)}</p>
      {income > 0 && <p className="text-xs mt-1 text-ink-300">هامش {pct(net, income)}</p>}
    </div>
  );
}

/** نقدي / تحويل — درجتان من الأخضر لأن الاثنين دخل | cash vs bank: two greens, both money in */
export function PayTile({ t }: { t: Totals }) {
  const cashPct = t.sales ? (t.sales_cash / t.sales) * 100 : 0;
  return (
    <div className="rounded-3xl p-4 shadow-card bg-white">
      <p className="text-xs font-semibold text-ink-400">المبيعات حسب طريقة الدفع</p>
      <div className="flex h-3 rounded-full overflow-hidden bg-ink-50 mt-3 gap-[2px]">
        {t.sales_cash > 0 && <span style={{ width: `${cashPct}%`, background: COLOR.cash }} />}
        {t.sales_bank > 0 && <span style={{ width: `${100 - cashPct}%`, background: COLOR.bank }} />}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        <p className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: COLOR.cash }} />
          <Banknote size={14} className="text-ink-400" /> نقدي
          <span className="flex-1" />
          <b className="tnum">{money(t.sales_cash)}</b>
          <span className="text-ink-400 tnum text-xs w-9 text-end">{pct(t.sales_cash, t.sales)}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: COLOR.bank }} />
          <Landmark size={14} className="text-ink-400" /> تحويل
          <span className="flex-1" />
          <b className="tnum">{money(t.sales_bank)}</b>
          <span className="text-ink-400 tnum text-xs w-9 text-end">{pct(t.sales_bank, t.sales)}</span>
        </p>
      </div>
      {t.voids > 0 && <p className="text-xs mt-1 text-ink-400">{num(t.voids)} فاتورة ملغاة</p>}
    </div>
  );
}

export function Lines({ title, lines, total, tone }: { title: string; lines: MoneyLine[]; total: number; tone: "good" | "bad" }) {
  return (
    <section className="card p-5">
      <h3 className={`font-bold mb-2 flex items-center gap-2 ${tone === "good" ? "text-inflow-text" : "text-outflow-text"}`}>
        <span className={`w-6 h-6 rounded-full text-white grid place-items-center ${tone === "good" ? "bg-inflow" : "bg-outflow"}`}>
          {tone === "good" ? <ArrowDownLeft size={15} strokeWidth={3} /> : <ArrowUpRight size={15} strokeWidth={3} />}
        </span>
        {title}
      </h3>
      {lines.length ? (
        <ul className="space-y-1.5 text-sm">
          {lines.map((l) => (
            <li key={l.category} className="flex items-center gap-3">
              <span className="flex-1">{l.category}</span>
              <span className="w-24 h-1.5 rounded-full bg-ink-50 overflow-hidden hidden sm:block">
                <span
                  className={`block h-full rounded-full ${tone === "good" ? "bg-inflow" : "bg-outflow"}`}
                  style={{ width: `${total ? Math.max(4, (l.amount / total) * 100) : 0}%` }}
                />
              </span>
              <span className="tnum font-semibold w-28 text-end">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-400">لا يوجد</p>
      )}
      <div className="flex justify-between border-t border-ink-100 mt-3 pt-2 font-bold">
        <span>الإجمالي</span>
        <span className="tnum">{money(total)}</span>
      </div>
    </section>
  );
}

/** الأصناف × الأحجام | products sold, grouped by product with its sizes */
export function ProductsSold({ rows, title = "الأصناف المباعة" }: { rows: ProductSale[]; title?: string }) {
  const groups = new Map<string, ProductSale[]>();
  for (const r of rows) groups.set(r.product, [...(groups.get(r.product) ?? []), r]);
  const sorted = [...groups.entries()].sort(
    (a, b) => b[1].reduce((s, x) => s + x.qty, 0) - a[1].reduce((s, x) => s + x.qty, 0)
  );
  return (
    <section className="card p-5">
      <h3 className="font-bold mb-3">{title}</h3>
      {sorted.length ? (
        <div className="overflow-x-auto">
          <table className="table-x">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الحجم</th>
                <th className="!text-end">العدد</th>
                <th className="!text-end">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(([product, sizes]) =>
                sizes.map((z, i) => (
                  <tr key={`${product}-${i}`} className={i === 0 ? "border-t-2 border-ink-100" : ""}>
                    <td className="font-semibold">{i === 0 ? product : ""}</td>
                    <td className="text-ink-500">
                      {z.size ?? (z.weight_g ? `بالوزن (${grams(z.weight_g)})` : "—")}
                    </td>
                    <td className="text-end tnum font-bold">{num(z.qty)}</td>
                    <td className="text-end tnum whitespace-nowrap">{money(z.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-400">لا توجد مبيعات</p>
      )}
    </section>
  );
}

/** كل نكهة بلونها الذي اختاره المدير | each flavor in its own color */
export function FlavorsUsed({ rows }: { rows: { name: string; grams: number; color?: string | null }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.grams));
  return (
    <section className="card p-5">
      <h3 className="font-bold">استهلاك النكهات</h3>
      <p className="text-xs text-ink-400 mb-3">كل نكهة بلونها</p>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <span className="w-24 truncate flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10" style={{ background: r.color || COLOR.count }} />
              {r.name}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-ink-50 overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(r.grams / max) * 100}%`, background: r.color || COLOR.count, boxShadow: "inset 0 0 0 1px rgba(24,26,28,.10)" }}
              />
            </span>
            <span className="tnum w-20 text-end font-semibold">{grams(r.grams)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DayView({ d }: { d: DayStatement }) {
  return (
    <div className="space-y-4">
      <p className="text-lg font-bold">{longDate(d.date)}</p>
      <TotalsStrip t={d.totals} />
      {d.shifts.length > 0 && (
        <section className="card p-5">
          <h3 className="font-bold mb-2">الورديات</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {d.shifts.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl ring-1 p-4 text-sm space-y-1 border-t-4 ${s.kind === "day" ? "bg-day-soft ring-day-ring" : "bg-night-soft ring-night-ring"}`}
                style={{ borderTopColor: SHIFT_COLOR[s.kind] }}
              >
                <div className="flex items-center gap-2">
                  {s.kind === "day" ? <Sun size={17} color={COLOR.day} /> : <Moon size={17} color={COLOR.night} />}
                  <p className="font-bold">{SHIFT_LABEL[s.kind]}</p>
                  {!s.closed_at && <span className="chip bg-emerald-50 text-emerald-800">مفتوحة</span>}
                </div>
                <p className="text-ink-500">
                  {clock(s.opened_at)} — {s.closed_at ? clock(s.closed_at) : "الآن"} · {s.opened_by}
                </p>
                <div className="flex justify-between">
                  <span className="text-inflow-text">+ الإيرادات</span>
                  <span className="tnum font-semibold">{money(s.totals.income)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-outflow-text">− المصروفات</span>
                  <span className="tnum font-semibold">{money(s.totals.expenses)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-black/5 pt-1">
                  <span>= الصافي</span>
                  <span className={`tnum ${s.totals.net < 0 ? "text-outflow-text" : ""}`}>{money(s.totals.net)}</span>
                </div>
                {s.counted_cash != null && s.expected_cash != null && s.counted_cash !== s.expected_cash && (
                  <p className={s.counted_cash < s.expected_cash ? "text-outflow-text font-semibold" : "text-ink-600 font-semibold"}>
                    ⚠ {s.counted_cash < s.expected_cash ? "عجز" : "زيادة"} في الدرج:{" "}
                    {money(Math.abs(s.counted_cash - s.expected_cash))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Lines title="الإيرادات" lines={d.income_lines} total={d.totals.income} tone="good" />
        <Lines title="المصروفات" lines={d.expense_lines} total={d.totals.expenses} tone="bad" />
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <ProductsSold rows={d.products} />
        <FlavorsUsed rows={d.flavors} />
      </div>
    </div>
  );
}

export function MonthView({ m }: { m: MonthStatement }) {
  const workDays = m.days.filter((d) => d.orders > 0);
  const best = [...workDays].sort((a, b) => b.income - a.income)[0];
  const maxIncome = Math.max(1, ...m.days.map((d) => d.income));
  return (
    <div className="space-y-4">
      <p className="text-lg font-bold">{monthLabel(m.month)}</p>
      <TotalsStrip t={m.totals} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Info label="أيام العمل" value={num(workDays.length)} />
        <Info label="متوسط الإيراد اليومي" value={money(workDays.length ? m.totals.income / workDays.length : 0)} />
        <Info label="أفضل يوم" value={best ? `${shortDate(best.date)} — ${money(best.income)}` : "—"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Lines title="الإيرادات" lines={m.income_lines} total={m.totals.income} tone="good" />
        <Lines title="المصروفات حسب الفئة" lines={m.expense_lines} total={m.totals.expenses} tone="bad" />
      </div>
      <ProductsSold rows={m.products} title="الأصناف والأحجام المباعة في الشهر" />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <section className="card p-5">
          <h3 className="font-bold mb-3">الأيام</h3>
          {m.days.length ? (
            <div className="overflow-x-auto">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>اليوم</th>
                    <th className="!text-end">فواتير</th>
                    <th className="!text-end">الإيرادات</th>
                    <th className="!text-end">المصروفات</th>
                    <th className="!text-end">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {m.days.map((d) => (
                    <tr key={d.date}>
                      <td className="whitespace-nowrap">
                        {shortDate(d.date)}
                        <span className="block h-1 mt-1 rounded-full bg-inflow" style={{ width: `${(d.income / maxIncome) * 100}%` }} />
                      </td>
                      <td className="text-end tnum">{num(d.orders)}</td>
                      <td className="text-end tnum whitespace-nowrap text-inflow-text">{money(d.income)}</td>
                      <td className="text-end tnum whitespace-nowrap text-outflow-text">{d.expenses ? money(d.expenses) : "—"}</td>
                      <td className={`text-end tnum whitespace-nowrap font-semibold ${d.net < 0 ? "text-outflow-text" : ""}`}>
                        {d.net < 0 ? "▼ " : ""}
                        {money(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-400">لا توجد حركة في هذا الشهر</p>
          )}
        </section>
        <FlavorsUsed rows={m.flavors} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white shadow-card p-4">
      <p className="text-xs font-semibold text-ink-400">{label}</p>
      <p className="font-bold tnum mt-1">{value}</p>
    </div>
  );
}
