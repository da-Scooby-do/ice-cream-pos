// عرض الكشوفات على الشاشة | statement views (used on the laptop and the phone).
import { grams, money, num, pct } from "@/lib/format";
import { clock, longDate, monthLabel, shortDate } from "@/lib/time";
import { SHIFT_LABEL, type DayStatement, type MoneyLine, type MonthStatement, type ProductSale, type Totals } from "@/lib/types";

export function TotalsStrip({ t }: { t: Totals }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile label="الإيرادات" value={money(t.income)} tone="good" hint={`${num(t.orders)} فاتورة`} />
      <Tile label="المصروفات" value={money(t.expenses)} tone="bad" />
      <Tile label="صافي الربح" value={money(t.net)} tone="dark" hint={t.income ? `هامش ${pct(t.net, t.income)}` : undefined} />
      <Tile
        label="المبيعات"
        value={
          <span className="block text-sm font-semibold space-y-0.5">
            <span className="flex justify-between gap-2"><span className="text-ink-400">نقدي</span>{money(t.sales_cash)}</span>
            <span className="flex justify-between gap-2"><span className="text-ink-400">تحويل</span>{money(t.sales_bank)}</span>
          </span>
        }
        hint={t.voids ? `${num(t.voids)} فاتورة ملغاة` : undefined}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "plain" | "good" | "bad" | "dark";
}) {
  const cls = {
    plain: "bg-white",
    good: "bg-emerald-50 ring-1 ring-emerald-200",
    bad: "bg-red-50 ring-1 ring-red-200",
    dark: "bg-ink-800 text-white",
  }[tone];
  return (
    <div className={`rounded-3xl p-4 shadow-card ${cls}`}>
      <p className={`text-xs font-semibold ${tone === "dark" ? "text-ink-300" : "text-ink-400"}`}>{label}</p>
      <p className={`text-2xl font-bold tnum mt-1 ${tone === "dark" ? "text-lemon" : ""}`}>{value}</p>
      {hint && <p className={`text-xs mt-1 ${tone === "dark" ? "text-ink-300" : "text-ink-400"}`}>{hint}</p>}
    </div>
  );
}

export function Lines({ title, lines, total, tone }: { title: string; lines: MoneyLine[]; total: number; tone: "good" | "bad" }) {
  return (
    <section className="card p-5">
      <h3 className={`font-bold mb-2 ${tone === "good" ? "text-emerald-800" : "text-red-800"}`}>{title}</h3>
      {lines.length ? (
        <ul className="space-y-1.5 text-sm">
          {lines.map((l) => (
            <li key={l.category} className="flex items-center gap-3">
              <span className="flex-1">{l.category}</span>
              <span className="w-24 h-1.5 rounded-full bg-ink-50 overflow-hidden hidden sm:block">
                <span
                  className={`block h-full rounded-full ${tone === "good" ? "bg-emerald-500" : "bg-red-400"}`}
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

export function FlavorsUsed({ rows }: { rows: { name: string; grams: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.grams));
  return (
    <section className="card p-5">
      <h3 className="font-bold mb-3">استهلاك النكهات</h3>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <span className="w-24 truncate">{r.name}</span>
            <span className="flex-1 h-2.5 rounded-full bg-ink-50 overflow-hidden">
              <span className="block h-full rounded-full bg-sky" style={{ width: `${(r.grams / max) * 100}%` }} />
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
              <div key={s.id} className="rounded-2xl ring-1 ring-ink-100 p-4 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{SHIFT_LABEL[s.kind]}</p>
                  {!s.closed_at && <span className="chip bg-emerald-50 text-emerald-800">مفتوحة</span>}
                </div>
                <p className="text-ink-500">
                  {clock(s.opened_at)} — {s.closed_at ? clock(s.closed_at) : "الآن"} · {s.opened_by}
                </p>
                <div className="flex justify-between">
                  <span>الإيرادات</span>
                  <span className="tnum font-semibold">{money(s.totals.income)}</span>
                </div>
                <div className="flex justify-between">
                  <span>المصروفات</span>
                  <span className="tnum font-semibold">{money(s.totals.expenses)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>الصافي</span>
                  <span className="tnum">{money(s.totals.net)}</span>
                </div>
                {s.counted_cash != null && s.expected_cash != null && s.counted_cash !== s.expected_cash && (
                  <p className={s.counted_cash < s.expected_cash ? "text-red-700 font-semibold" : "text-amber-700 font-semibold"}>
                    {s.counted_cash < s.expected_cash ? "عجز" : "زيادة"} في الدرج:{" "}
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
                        <span className="block h-1 mt-1 rounded-full bg-sky/70" style={{ width: `${(d.income / maxIncome) * 100}%` }} />
                      </td>
                      <td className="text-end tnum">{num(d.orders)}</td>
                      <td className="text-end tnum whitespace-nowrap">{money(d.income)}</td>
                      <td className="text-end tnum whitespace-nowrap">{money(d.expenses)}</td>
                      <td className={`text-end tnum whitespace-nowrap font-semibold ${d.net < 0 ? "text-red-700" : ""}`}>{money(d.net)}</td>
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
