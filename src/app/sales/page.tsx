import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  SALES_PAGE_SIZE, getAllStaffNames, getSalesHistory, khartoumToday, type SalesFilter,
} from "@/lib/queries";
import { money, num, weight } from "@/lib/money";
import ManagerNav from "@/components/ManagerNav";
import VoidButton from "../reports/VoidButton";

export const dynamic = "force-dynamic";

const PAY: Record<string, string> = { cash: "نقدي", card: "بطاقة", wallet: "محفظة" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// سجل المبيعات | every sale, filterable — manager only, works on a phone.
export default async function SalesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const sp = await searchParams;
  const today = khartoumToday();
  let from = DATE_RE.test(one(sp.from)) ? one(sp.from) : today;
  let to = DATE_RE.test(one(sp.to)) ? one(sp.to) : from;
  if (to < from) [from, to] = [to, from];

  const method = ["cash", "card", "wallet"].includes(one(sp.method))
    ? (one(sp.method) as SalesFilter["method"])
    : undefined;
  const status = ["completed", "void"].includes(one(sp.status))
    ? (one(sp.status) as SalesFilter["status"])
    : undefined;
  const staffId = /^[0-9a-f-]{36}$/i.test(one(sp.staff)) ? one(sp.staff) : undefined;
  const page = Math.max(0, Number.parseInt(one(sp.page), 10) || 0);

  const [{ rows, count, summary }, staff] = await Promise.all([
    getSalesHistory({ from, to, staffId, method, status, page }),
    getAllStaffNames(),
  ]);
  const pages = Math.max(1, Math.ceil(count / SALES_PAGE_SIZE));

  const link = (over: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const merged = { from, to, staff: staffId, method, status, page: 0, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && !(k === "page" && v === 0)) q.set(k, String(v));
    }
    return `/sales?${q.toString()}`;
  };

  const monthStart = today.slice(0, 8) + "01";
  const presets = [
    { label: "اليوم", from: today, to: today },
    { label: "أمس", from: khartoumToday(-1), to: khartoumToday(-1) },
    { label: "آخر 7 أيام", from: khartoumToday(-6), to: today },
    { label: "هذا الشهر", from: monthStart, to: today },
  ];

  const fmtTime = new Intl.DateTimeFormat("ar-SD-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    ...(from === to ? { timeStyle: "short" as const } : { dateStyle: "short" as const, timeStyle: "short" as const }),
  });
  const fmtDay = (d: string) =>
    new Intl.DateTimeFormat("ar-SD-u-nu-latn", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  return (
    <>
      <ManagerNav current="sales" />
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {/* الفترة والفلاتر | period + filters */}
        <section className="bg-white rounded-3xl shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-choco me-2">سجل المبيعات</h1>
            {presets.map((p) => {
              const on = p.from === from && p.to === to;
              return (
                <Link
                  key={p.label}
                  href={link({ from: p.from, to: p.to })}
                  className={`btn px-3 py-1.5 text-sm ${on ? "bg-berry text-white" : "bg-cream text-choco border border-black/10"}`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>

          <form action="/sales" className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
            <label className="space-y-1">
              <span className="text-xs font-bold text-choco/50">من</span>
              <input type="date" name="from" defaultValue={from} className="w-full rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm tnum select-text" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-choco/50">إلى</span>
              <input type="date" name="to" defaultValue={to} className="w-full rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm tnum select-text" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-choco/50">الموظف</span>
              <select name="staff" defaultValue={staffId ?? ""} className="w-full rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm">
                <option value="">الكل</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.deleted_at ? " (محذوف)" : ""}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-choco/50">الدفع</span>
              <select name="method" defaultValue={method ?? ""} className="w-full rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm">
                <option value="">الكل</option>
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="wallet">محفظة</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-choco/50">الحالة</span>
              <select name="status" defaultValue={status ?? ""} className="w-full rounded-xl border-2 border-black/10 bg-cream px-2 py-2 text-sm">
                <option value="">الكل</option>
                <option value="completed">مكتملة</option>
                <option value="void">ملغاة</option>
              </select>
            </label>
            <button type="submit" className="btn py-2.5 text-sm bg-choco text-white">عرض</button>
          </form>
        </section>

        {/* الإجماليات | totals for the whole period */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Tile label="إجمالي المبيعات" value={money(summary.total)} accent />
          <Tile label="عدد الفواتير" value={num(summary.orders)} />
          <Tile label="نقدي" value={money(summary.cash)} />
          <Tile label="بطاقة / محفظة" value={money(summary.card)} />
          <Tile
            label="ملغاة"
            value={summary.voids ? `${num(summary.voids)} · ${money(summary.voided_total)}` : "0"}
          />
        </section>

        <p className="text-xs text-choco/50 px-1">
          {from === to ? fmtDay(from) : `${fmtDay(from)} — ${fmtDay(to)}`} · {num(count)} فاتورة
          {count > SALES_PAGE_SIZE && ` · صفحة ${num(page + 1)} من ${num(pages)}`}
        </p>

        {/* الفواتير | the orders — tap one to see what was in it */}
        <section className="bg-white rounded-3xl shadow-sm">
          {rows.length === 0 ? (
            <p className="text-center text-sm text-choco/40 py-14">لا توجد مبيعات في هذه الفترة</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {rows.map((o) => {
                const isVoid = o.status === "void";
                const itemCount = o.order_items.reduce((s, it) => s + it.qty, 0);
                return (
                  <li key={o.id}>
                    <details className="group">
                      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-cream/60">
                        <span className="tnum font-extrabold text-choco w-14 shrink-0">#{num(o.order_no)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-choco tnum">{fmtTime.format(new Date(o.created_at))}</span>
                          <span className="block text-xs text-choco/50 truncate">
                            {o.staff?.name ?? "—"} · {PAY[o.payment_method]} · {num(itemCount)} صنف
                          </span>
                        </span>
                        {isVoid && (
                          <span className="text-[10px] font-bold bg-red-50 text-red-600 rounded-full px-2 py-0.5 shrink-0">ملغاة</span>
                        )}
                        <span className={`tnum font-extrabold shrink-0 ${isVoid ? "line-through text-choco/30" : "text-choco"}`}>
                          {money(o.total)}
                        </span>
                        <span className="text-choco/30 text-xs transition-transform group-open:rotate-180">▾</span>
                      </summary>

                      <div className="px-4 pb-4 pt-1 space-y-3 bg-cream/40">
                        <ul className="space-y-2">
                          {o.order_items.map((it, i) => (
                            <li key={i} className="text-sm">
                              <div className="flex justify-between gap-3">
                                <span className="font-bold text-choco">
                                  {it.qty > 1 ? `${num(it.qty)} × ` : ""}
                                  {it.name_ar}
                                  {it.weight_grams ? ` (${weight(it.weight_grams)})` : ""}
                                </span>
                                <span className="tnum text-choco">{money(it.line_total)}</span>
                              </div>
                              {it.order_item_flavors.length > 0 && (
                                <p className="text-xs text-choco/60">النكهات: {it.order_item_flavors.map((f) => f.name_ar).join(" + ")}</p>
                              )}
                              {it.order_item_extras.length > 0 && (
                                <p className="text-xs text-mint">إضافات: {it.order_item_extras.map((e) => e.name_ar).join(" + ")}</p>
                              )}
                            </li>
                          ))}
                        </ul>

                        <div className="border-t border-dashed border-black/15 pt-2 text-sm space-y-0.5">
                          {Number(o.discount) > 0 && (
                            <Line label="خصم" value={`- ${money(o.discount)}`} />
                          )}
                          <Line label="الإجمالي" value={money(o.total)} strong />
                          <Line label="الدفع" value={PAY[o.payment_method]} />
                          {o.paid_amount != null && Number(o.change_amount) > 0 && (
                            <Line label="المستلم / الباقي" value={`${money(o.paid_amount)} / ${money(o.change_amount)}`} />
                          )}
                        </div>

                        {isVoid ? (
                          <p className="text-xs font-bold text-red-600">سبب الإلغاء: {o.void_reason || "—"}</p>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-choco/40">إلغاء الفاتورة يعيد مخزونها</span>
                            <VoidButton orderId={o.id} orderNo={o.order_no} />
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {pages > 1 && (
          <nav className="flex items-center justify-center gap-2">
            {page > 0 && (
              <Link href={link({ page: page - 1 })} className="btn px-4 py-2 text-sm bg-white text-choco border border-black/10">
                → الأحدث
              </Link>
            )}
            <span className="text-sm text-choco/50 tnum">{num(page + 1)} / {num(pages)}</span>
            {page + 1 < pages && (
              <Link href={link({ page: page + 1 })} className="btn px-4 py-2 text-sm bg-white text-choco border border-black/10">
                الأقدم ←
              </Link>
            )}
          </nav>
        )}
      </main>
    </>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? "bg-berry text-white" : "bg-white shadow-sm text-choco"}`}>
      <p className={`text-xs font-bold ${accent ? "text-white/70" : "text-choco/50"}`}>{label}</p>
      <p className="text-lg font-extrabold tnum mt-0.5">{value}</p>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-extrabold text-choco" : "text-choco/70"}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
