import { CalendarDays, Clock, Crown, IceCreamCone, Moon, Palette, Ruler, Sun, Wallet } from "lucide-react";
import { COLOR, shiftOfHour, SHIFT_COLOR } from "@/lib/colors";
import { money, num, pct } from "@/lib/format";
import { hourLabel, shortDate, WEEKDAYS } from "@/lib/time";
import type { Dashboard } from "@/lib/types";
import { Columns, Legend, RankBars } from "./charts";
import { FlavorsUsed, InTile, NetTile, OutTile, PayTile } from "./views";

// لوحة التحكم | the dashboard, in four sections the owner can jump between:
// المال (money) · المبيعات (what sells) · الأوقات (when it's busy) · النكهات.
// Colors keep one meaning everywhere — see src/lib/colors.ts.
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
      {/* تنقل سريع + مفتاح الألوان | jump to a section, and what the colors mean */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <nav className="flex flex-wrap gap-2" aria-label="أقسام لوحة التحكم">
          <Jump href="#money" icon={<Wallet size={15} />} label="المال" />
          <Jump href="#selling" icon={<IceCreamCone size={15} />} label="المبيعات" />
          <Jump href="#times" icon={<Clock size={15} />} label="الأوقات" />
          {d.flavors.length > 0 && <Jump href="#flavors" icon={<Palette size={15} />} label="النكهات" />}
        </nav>
        <span className="hidden lg:block w-px h-6 bg-ink-100" />
        <Legend
          items={[
            { color: COLOR.inflow, label: "داخل (إيرادات)" },
            { color: COLOR.outflow, label: "خارج (مصروفات)" },
            { color: COLOR.count, label: "عدد المبيعات" },
            { color: COLOR.day, label: "☀ صباحية" },
            { color: COLOR.night, label: "🌙 مسائية" },
          ]}
        />
      </div>

      {/* ── المال | money ─────────────────────────────────────── */}
      <Section id="money" icon={<Wallet size={18} />} title="المال">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <InTile value={money(t.income)} hint={`${num(t.orders)} فاتورة · متوسط ${money(t.avg_ticket)}`} />
          <OutTile value={money(t.expenses)} />
          <NetTile net={t.net} income={t.income} />
          <PayTile t={t} />
        </div>
        {d.by_day.length > 1 && d.by_day.length <= 62 && (
          <section className="card p-5">
            <h3 className="font-bold">الإيرادات اليومية</h3>
            <p className="text-xs text-ink-400 mb-5">
              {shortDate(d.from)} — {shortDate(d.to)} · كل عمود دخل يوم واحد
            </p>
            <Columns
              color={COLOR.inflow}
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
      </Section>

      {/* ── المبيعات | what sells ───────────────────────────────── */}
      <Section id="selling" icon={<IceCreamCone size={18} />} title="ماذا يُباع">
        {t.orders > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Insight icon={<Crown size={18} />} label="الأكثر مبيعاً" value={topProduct?.name ?? "—"} hint={topProduct ? `${num(topProduct.qty)} مرة` : ""} />
            <Insight
              icon={<Ruler size={18} />}
              label="الحجم الأكثر طلباً"
              value={topSize ? `${topSize.product} — ${topSize.size}` : "—"}
              hint={topSize ? `${num(topSize.qty)} مرة` : ""}
            />
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <section className="card p-5">
            <h3 className="font-bold">الأصناف الأكثر مبيعاً</h3>
            <p className="text-xs text-ink-400 mb-4">عدد المرات المباعة · مرّر على الشريط لرؤية الإيراد</p>
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
        {d.categories.length > 0 && (
          <section className="card p-5">
            <h3 className="font-bold mb-3">حسب الفئة</h3>
            <table className="table-x">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th className="!text-end">العدد</th>
                  <th className="!text-end">الإيراد</th>
                  <th className="w-1/3">النسبة من المبيعات</th>
                </tr>
              </thead>
              <tbody>
                {d.categories.map((c) => (
                  <tr key={c.category}>
                    <td className="font-semibold">{c.category}</td>
                    <td className="text-end tnum">{num(c.qty)}</td>
                    <td className="text-end tnum text-inflow-text">{money(c.revenue)}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded-full bg-ink-50 overflow-hidden">
                          <span className="block h-full rounded-full bg-inflow" style={{ width: pct(c.revenue, t.sales) }} />
                        </span>
                        <span className="tnum text-ink-500 text-xs w-9 text-end">{pct(c.revenue, t.sales)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </Section>

      {/* ── الأوقات | when it's busy ─────────────────────────────── */}
      <Section id="times" icon={<Clock size={18} />} title="متى يزدحم المحل">
        {t.orders > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
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
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
          <section className="card p-5">
            <h3 className="font-bold">أوقات الزحمة خلال اليوم</h3>
            <p className="text-xs text-ink-400 mb-5">عدد الفواتير في كل ساعة — ملوّنة حسب الوردية</p>
            <Columns
              data={hours.map((h) => {
                // the real shift each receipt was sold in (older phone snapshots: by the clock)
                const day = h.day_orders ?? (shiftOfHour(h.hour) === "day" ? h.orders : 0);
                const night = h.orders - day;
                return {
                  key: String(h.hour),
                  label: hourLabel(h.hour),
                  value: h.orders,
                  tip: `${num(h.orders)} فاتورة · ${money(h.revenue)}${day ? ` · ☀ ${num(day)}` : ""}${night ? ` · 🌙 ${num(night)}` : ""}`,
                  short: num(h.orders),
                  parts: [
                    { value: day, color: SHIFT_COLOR.day },
                    { value: night, color: SHIFT_COLOR.night },
                  ],
                };
              })}
              showEvery={hours.length > 14 ? 2 : 1}
            />
            <Legend
              items={[
                { color: COLOR.day, label: <><Sun size={12} className="inline" /> الوردية الصباحية</> },
                { color: COLOR.night, label: <><Moon size={12} className="inline" /> الوردية المسائية</> },
              ]}
            />
          </section>
          <section className="card p-5">
            <h3 className="font-bold">أيام الأسبوع</h3>
            <p className="text-xs text-ink-400 mb-5">متوسط عدد الفواتير في اليوم</p>
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
      </Section>

      {/* ── النكهات | flavors ────────────────────────────────────── */}
      {d.flavors.length > 0 && (
        <Section id="flavors" icon={<Palette size={18} />} title="النكهات">
          <FlavorsUsed rows={d.flavors} />
        </Section>
      )}
    </div>
  );
}

function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-4">
      <h2 className="flex items-center gap-2 text-lg font-bold pt-2">
        <span className="w-8 h-8 rounded-xl bg-ink-800 text-white grid place-items-center">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Jump({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold bg-ink-50 hover:bg-sky-50 ring-1 ring-ink-100">
      {icon}
      {label}
    </a>
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
