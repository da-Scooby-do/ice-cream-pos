import { CalendarDays, Clock, Crown, Ruler } from "lucide-react";
import { money, num, pct } from "@/lib/format";
import { hourLabel, shortDate, WEEKDAYS } from "@/lib/time";
import type { Dashboard } from "@/lib/types";
import { Columns, RankBars } from "./charts";
import { FlavorsUsed } from "./views";

// لوحة التحكم | the dashboard: what sells, which sizes, when it's busy.
export default function DashboardView({ d }: { d: Dashboard }) {
  const t = d.totals;
  const topProduct = d.products[0];
  const topSize = [...d.sizes].sort((a, b) => b.qty - a.qty)[0];
  const peakHour = [...d.by_hour].sort((a, b) => b.orders - a.orders)[0];
  const avgDay = (w: Dashboard["by_weekday"][number]) => (w.days ? w.orders / w.days : 0);
  const peakDay = [...d.by_weekday].sort((a, b) => avgDay(b) - avgDay(a))[0];

  // نطاق الساعات التي فيها نشاط | the hours the shop is actually open
  const active = d.by_hour.filter((h) => h.orders > 0).map((h) => h.hour);
  const lo = active.length ? Math.min(...active) : 8;
  const hi = active.length ? Math.max(...active) : 23;
  const hours = d.by_hour.slice(Math.max(0, lo - 1), Math.min(24, hi + 2));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="الإيرادات" value={money(t.income)} hint={`${num(t.orders)} فاتورة`} />
        <Kpi label="متوسط الفاتورة" value={money(t.avg_ticket)} hint={`${num(t.items)} صنف مباع`} />
        <Kpi label="المصروفات" value={money(t.expenses)} />
        <Kpi label="صافي الربح" value={money(t.net)} hint={t.income ? `هامش ${pct(t.net, t.income)}` : undefined} dark />
        <Kpi label="نقدي / تحويل" value={`${pct(t.sales_cash, t.sales)} / ${pct(t.sales_bank, t.sales)}`} hint="من المبيعات" />
      </div>

      {t.orders > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Insight icon={<Crown size={18} />} label="الأكثر مبيعاً" value={topProduct?.name ?? "—"} hint={topProduct ? `${num(topProduct.qty)} مرة` : ""} />
          <Insight
            icon={<Ruler size={18} />}
            label="الحجم الأكثر طلباً"
            value={topSize ? `${topSize.product} — ${topSize.size}` : "—"}
            hint={topSize ? `${num(topSize.qty)} مرة` : ""}
          />
          <Insight
            icon={<Clock size={18} />}
            label="وقت الذروة"
            value={peakHour?.orders ? `${hourLabel(peakHour.hour)} – ${hourLabel((peakHour.hour + 1) % 24)}` : "—"}
            hint={peakHour?.orders ? `${num(peakHour.orders)} فاتورة في هذه الساعة` : ""}
          />
          <Insight
            icon={<CalendarDays size={18} />}
            label="أزحم يوم في الأسبوع"
            value={peakDay && peakDay.orders ? WEEKDAYS[peakDay.day] : "—"}
            hint={peakDay && peakDay.days ? `متوسط ${num(Math.round(avgDay(peakDay)))} فاتورة` : ""}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="card p-5">
          <h3 className="font-bold">الأصناف الأكثر مبيعاً</h3>
          <p className="text-xs text-ink-400 mb-4">عدد المرات المباعة</p>
          <RankBars
            rows={d.products.map((p) => ({
              key: p.name,
              label: p.name,
              sub: p.category,
              value: p.qty,
              valueText: num(p.qty),
              tip: `الإيراد ${money(p.revenue)}`,
            }))}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold">الأحجام الأكثر طلباً</h3>
          <p className="text-xs text-ink-400 mb-4">كل صنف بحجمه</p>
          <RankBars
            rows={[...d.sizes]
              .sort((a, b) => b.qty - a.qty)
              .map((z) => ({
                key: `${z.product}-${z.size}`,
                label: z.size,
                sub: z.product,
                value: z.qty,
                valueText: num(z.qty),
                tip: `الإيراد ${money(z.revenue)}`,
              }))}
          />
        </section>
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <section className="card p-5">
          <h3 className="font-bold">أوقات الزحمة خلال اليوم</h3>
          <p className="text-xs text-ink-400 mb-5">عدد الفواتير في كل ساعة — مجموع الفترة</p>
          <Columns
            data={hours.map((h) => ({
              key: String(h.hour),
              label: hourLabel(h.hour),
              value: h.orders,
              tip: `${num(h.orders)} فاتورة · ${money(h.revenue)}`,
              short: num(h.orders),
            }))}
            showEvery={hours.length > 14 ? 2 : 1}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold">أيام الأسبوع</h3>
          <p className="text-xs text-ink-400 mb-5">متوسط الفواتير في اليوم</p>
          <Columns
            data={d.by_weekday.map((w) => ({
              key: String(w.day),
              label: WEEKDAYS[w.day],
              value: avgDay(w),
              tip: `متوسط ${num(Math.round(avgDay(w)))} فاتورة · ${num(w.days)} أيام عمل`,
              short: num(Math.round(avgDay(w))),
            }))}
          />
        </section>
      </div>

      {d.by_day.length > 1 && d.by_day.length <= 62 && (
        <section className="card p-5">
          <h3 className="font-bold">الإيرادات اليومية</h3>
          <p className="text-xs text-ink-400 mb-5">
            {shortDate(d.from)} — {shortDate(d.to)}
          </p>
          <Columns
            data={d.by_day.map((x) => ({
              key: x.date,
              label: x.date.slice(8),
              value: x.revenue,
              tip: `${shortDate(x.date)} · ${money(x.revenue)} · ${num(x.orders)} فاتورة`,
              short: num(x.revenue),
            }))}
            showEvery={d.by_day.length > 20 ? 3 : 1}
          />
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <FlavorsUsed rows={d.flavors} />
        {d.categories.length > 0 && (
          <section className="card p-5">
            <h3 className="font-bold mb-3">حسب الفئة</h3>
            <table className="table-x">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th className="!text-end">العدد</th>
                  <th className="!text-end">الإيراد</th>
                  <th className="!text-end">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {d.categories.map((c) => (
                  <tr key={c.category}>
                    <td className="font-semibold">{c.category}</td>
                    <td className="text-end tnum">{num(c.qty)}</td>
                    <td className="text-end tnum">{money(c.revenue)}</td>
                    <td className="text-end tnum text-ink-500">{pct(c.revenue, t.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, dark }: { label: string; value: string; hint?: string; dark?: boolean }) {
  return (
    <div className={`rounded-3xl p-4 shadow-card ${dark ? "bg-ink-800 text-white" : "bg-white"}`}>
      <p className={`text-xs font-semibold ${dark ? "text-ink-300" : "text-ink-400"}`}>{label}</p>
      <p className={`text-xl font-bold tnum mt-1 ${dark ? "text-lemon" : ""}`}>{value}</p>
      {hint && <p className={`text-xs mt-1 ${dark ? "text-ink-300" : "text-ink-400"}`}>{hint}</p>}
    </div>
  );
}

function Insight({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl p-4 bg-lemon-50 ring-1 ring-lemon-200 flex gap-3">
      <span className="w-10 h-10 shrink-0 rounded-2xl bg-lemon text-ink grid place-items-center">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        <p className="font-bold truncate">{value}</p>
        {hint && <p className="text-xs text-ink-500 tnum">{hint}</p>}
      </div>
    </div>
  );
}
