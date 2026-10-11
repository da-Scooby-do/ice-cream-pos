import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getDailySales, getLowStock, getOpenShift, getRecentOrders, getShiftSummary, getTopFlavors,
} from "@/lib/queries";
import { money, num, weight } from "@/lib/money";
import ManagerNav from "@/components/ManagerNav";
import VoidButton from "./VoidButton";

export const dynamic = "force-dynamic";

// التقارير | dad's dashboard — readable on a phone from home.
export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const shift = await getOpenShift();
  const [daily, top, low, orders, live] = await Promise.all([
    getDailySales(),
    getTopFlavors(7),
    getLowStock(),
    getRecentOrders(20),
    shift ? getShiftSummary(shift.id) : Promise.resolve(null),
  ]);

  const today = daily[0];
  const maxGrams = Math.max(1, ...top.map((t) => t.grams));
  const PAY: Record<string, string> = { cash: "نقدي", card: "بطاقة", wallet: "محفظة" };

  return (
    <>
      <ManagerNav current="reports" />
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {/* الوردية الحالية | live shift */}
        <section className="bg-white rounded-3xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-choco">الوردية الحالية</h2>
            {live ? (
              <span className="text-xs font-bold bg-mint/10 text-mint rounded-full px-3 py-1">
                مفتوحة — {live.cashier}
              </span>
            ) : (
              <span className="text-xs font-bold bg-black/5 text-choco/50 rounded-full px-3 py-1">لا توجد وردية مفتوحة</span>
            )}
          </div>
          {live ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="الإجمالي" value={money(live.total_sales)} accent />
              <Tile label="نقدي" value={money(live.cash_sales)} />
              <Tile label="بطاقة / محفظة" value={money(live.card_sales)} />
              <Tile label="الفواتير" value={num(live.orders_count)} />
            </div>
          ) : (
            <p className="text-sm text-choco/50">
              اليوم: {today ? `${money(today.total_sales)} من ${num(today.orders_count)} فاتورة` : "لا مبيعات بعد"}
            </p>
          )}
        </section>

        {/* نقص المخزون | low stock */}
        {low.length > 0 && (
          <section className="bg-red-50 border border-red-200 rounded-3xl p-5">
            <h2 className="font-extrabold text-red-700 mb-2">⚠ يحتاج تعبئة ({num(low.length)})</h2>
            <div className="flex flex-wrap gap-2">
              {low.map((r) => (
                <span key={`${r.item_type}-${r.id}`} className="bg-white rounded-xl px-3 py-1.5 text-sm font-bold text-choco">
                  {r.name_ar}{" "}
                  <span className="text-red-600 tnum text-xs">
                    {r.unit === "gram" ? weight(r.stock) : num(r.stock)}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* المبيعات اليومية | daily sales */}
          <section className="bg-white rounded-3xl shadow-sm p-5">
            <h2 className="font-extrabold text-choco mb-3">المبيعات اليومية</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-choco/40">لا توجد مبيعات بعد</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-choco/40 text-xs">
                    <th className="text-start font-bold pb-2">اليوم</th>
                    <th className="text-start font-bold pb-2">فواتير</th>
                    <th className="text-start font-bold pb-2">نقدي</th>
                    <th className="text-end font-bold pb-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={String(d.day)} className="border-t border-black/5">
                      <td className="py-2 tnum">{String(d.day)}</td>
                      <td className="py-2 tnum">{num(d.orders_count)}</td>
                      <td className="py-2 tnum text-choco/60">{money(d.cash_sales)}</td>
                      <td className="py-2 tnum text-end font-bold">{money(d.total_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* أكثر النكهات | top flavors */}
          <section className="bg-white rounded-3xl shadow-sm p-5">
            <h2 className="font-extrabold text-choco mb-3">أكثر النكهات مبيعاً — آخر 7 أيام</h2>
            {top.length === 0 ? (
              <p className="text-sm text-choco/40">لا توجد بيانات بعد</p>
            ) : (
              <ul className="space-y-2">
                {top.map((f) => (
                  <li key={f.name_ar}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-choco">{f.name_ar}</span>
                      <span className="tnum text-choco/60">{weight(f.grams)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-cream overflow-hidden">
                      <div className="h-full rounded-full bg-berry" style={{ width: `${(f.grams / maxGrams) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* آخر الفواتير | recent orders */}
        <section className="bg-white rounded-3xl shadow-sm p-5">
          <h2 className="font-extrabold text-choco mb-3">آخر الفواتير</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-choco/40">لا توجد فواتير بعد</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="tnum font-bold text-choco w-14">#{num(o.order_no)}</span>
                  <span className="tnum text-choco/50 flex-1">
                    {new Intl.DateTimeFormat("ar-SD-u-nu-latn", { timeStyle: "short", dateStyle: "short", timeZone: "Africa/Khartoum" }).format(new Date(o.created_at))}
                  </span>
                  <span className="text-choco/60">{PAY[o.payment_method]}</span>
                  <span className={`tnum font-bold w-28 text-end ${o.status === "void" ? "line-through text-choco/30" : "text-choco"}`}>
                    {money(o.total)}
                  </span>
                  {o.status === "completed" ? (
                    <VoidButton orderId={o.id} orderNo={o.order_no} />
                  ) : (
                    <span className="text-xs text-red-500 w-14 text-center">ملغاة</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? "bg-berry text-white" : "bg-cream text-choco"}`}>
      <p className={`text-xs font-bold ${accent ? "text-white/70" : "text-choco/50"}`}>{label}</p>
      <p className="text-lg font-extrabold tnum mt-0.5">{value}</p>
    </div>
  );
}
