// قسائم الطباعة 80 ملم | the 80mm printed slips: receipt, shift statement,
// day statement and month statement. Plain markup + the .slip CSS, so the
// same component prints from the laptop and renders on the phone.
/* eslint-disable @next/next/no-img-element */
import { grams, money, num, qty } from "@/lib/format";
import { clock, longDate, monthLabel, shortDate, stamp } from "@/lib/time";
import {
  PAYMENT_LABEL,
  SHIFT_LABEL,
  type DayStatement,
  type MonthStatement,
  type ProductSale,
  type Receipt,
  type Shop,
  type ShiftStatement,
  type StockMonth,
  type Totals,
} from "@/lib/types";

function Header({ shop, title }: { shop: Shop; title?: string }) {
  return (
    <>
      <img src="/brand/mono.svg" alt="" className="s-logo" />
      <div className="s-title">{shop.name}</div>
      {shop.address && <div className="s-sub">{shop.address}</div>}
      {shop.phone && <div className="s-sub">{shop.phone}</div>}
      {title && <div className="s-head">{title}</div>}
    </>
  );
}

const Row = ({ l, v, cls = "" }: { l: React.ReactNode; v: React.ReactNode; cls?: string }) => (
  <div className={`s-row ${cls}`}>
    <span>{l}</span>
    <span>{v}</span>
  </div>
);
const Rule = () => <div className="s-rule" />;

// --- فاتورة البيع | sales receipt ---------------------------------------------

export function ReceiptSlip({ r, shop }: { r: Receipt; shop: Shop }) {
  return (
    <div className="slip">
      <Header shop={shop} />
      <Rule />
      <Row l={`فاتورة #${num(r.number)}`} v={stamp(r.created_at)} cls="s-small" />
      <div className="s-small">الكاشير: {r.cashier}</div>
      {r.voided && <div className="s-head">ملغاة</div>}
      <Rule />
      {r.items.map((it, i) => (
        <div key={i} style={{ marginBottom: "1.2mm" }}>
          <Row
            l={
              <b>
                {it.qty > 1 ? `${num(it.qty)} × ` : ""}
                {it.name}
                {it.size ? ` — ${it.size}` : ""}
                {it.weight_g ? ` (${grams(it.weight_g)})` : ""}
              </b>
            }
            v={<b>{money(it.line_total)}</b>}
          />
          {it.flavors.length > 0 && <div className="s-small">النكهات: {it.flavors.join(" + ")}</div>}
          {it.extras.length > 0 && <div className="s-small">إضافات: {it.extras.join(" + ")}</div>}
        </div>
      ))}
      <Rule />
      <Row l="الإجمالي" v={money(r.total)} cls="s-total" />
      <Row l="الدفع" v={PAYMENT_LABEL[r.payment]} cls="s-small" />
      {r.paid != null && r.paid > r.total && (
        <>
          <Row l="المدفوع" v={money(r.paid)} cls="s-small" />
          <Row l="الباقي" v={money(r.change)} cls="s-small" />
        </>
      )}
      <Rule />
      <div className="s-center" style={{ whiteSpace: "pre-line" }}>
        {shop.footer || "شكراً لزيارتكم"}
      </div>
    </div>
  );
}

// --- الأجزاء المشتركة للكشوفات | statement building blocks --------------------

function IncomeBlock({ lines, total }: { lines: { category: string; amount: number; count?: number }[]; total: number }) {
  return (
    <>
      <div className="s-sec">الإيرادات</div>
      {lines.length ? (
        lines.map((l) => (
          <Row key={l.category} l={l.count != null ? `${l.category} (${num(l.count)} فاتورة)` : l.category} v={money(l.amount)} />
        ))
      ) : (
        <Row l="لا يوجد" v="—" />
      )}
      <Row l={<b>إجمالي الإيرادات</b>} v={<b>{money(total)}</b>} />
    </>
  );
}

function ExpenseBlock({ lines, total }: { lines: { category: string; amount: number; note?: string | null }[]; total: number }) {
  return (
    <>
      <div className="s-sec">المصروفات</div>
      {lines.length ? (
        lines.map((l, i) => (
          <div key={i}>
            <Row l={l.category} v={money(l.amount)} />
            {l.note && <div className="s-small" style={{ marginTop: "-0.5mm" }}>{l.note}</div>}
          </div>
        ))
      ) : (
        <Row l="لا يوجد" v="—" />
      )}
      <Row l={<b>إجمالي المصروفات</b>} v={<b>{money(total)}</b>} />
    </>
  );
}

function NetBlock({ t }: { t: Totals }) {
  return (
    <div className="s-box">
      <Row l="صافي الربح" v={money(t.net)} cls="s-big" />
      <div className="s-small">الإيرادات {money(t.income)} − المصروفات {money(t.expenses)}</div>
    </div>
  );
}

function ProductsTable({ rows }: { rows: ProductSale[] }) {
  if (!rows.length) return null;
  return (
    <>
      <div className="s-sec">الأصناف المباعة</div>
      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th className="n">العدد</th>
            <th className="n">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i}>
              <td>
                {p.product}
                {p.size ? ` — ${p.size}` : ""}
                {p.weight_g ? ` (${grams(p.weight_g)})` : ""}
              </td>
              <td className="n">{num(p.qty)}</td>
              <td className="n">{num(p.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// --- كشف الوردية | shift statement (printed at close) -------------------------

export function ShiftSlip({ s }: { s: ShiftStatement }) {
  const t = s.totals;
  const d = s.drawer;
  return (
    <div className="slip">
      <Header shop={s.shop} title={`كشف ${SHIFT_LABEL[s.shift.kind]}`} />
      <Row l="التاريخ" v={shortDate(s.shift.business_date)} />
      <Row l="الفتح" v={`${clock(s.shift.opened_at)} — ${s.shift.opened_by}`} />
      <Row l="التقفيل" v={`${clock(s.shift.closed_at)} — ${s.shift.closed_by ?? "—"}`} />
      <Row l="عدد الفواتير" v={num(t.orders)} />
      {t.voids > 0 && <Row l="فواتير ملغاة" v={num(t.voids)} />}
      <Rule />
      <IncomeBlock lines={s.income_lines} total={t.income} />
      <Rule />
      <ExpenseBlock lines={s.expenses.map((e) => ({ category: e.category, amount: e.amount, note: e.note }))} total={t.expenses} />
      <NetBlock t={t} />
      <div className="s-sec">الدرج (النقدية)</div>
      <Row l="رصيد الافتتاح" v={money(d.opening)} />
      <Row l="+ مبيعات نقدية" v={money(d.cash_sales)} />
      {d.cash_income > 0 && <Row l="+ إيرادات نقدية" v={money(d.cash_income)} />}
      {d.cash_expenses > 0 && <Row l="− مصروفات من الدرج" v={money(d.cash_expenses)} />}
      <Row l={<b>المتوقع في الدرج</b>} v={<b>{money(d.expected)}</b>} />
      <Row l="المعدود" v={d.counted == null ? "—" : money(d.counted)} />
      {d.diff != null && (
        <Row
          l={<b>{d.diff < 0 ? "عجز" : d.diff > 0 ? "زيادة" : "الفرق"}</b>}
          v={<b>{d.diff === 0 ? "مطابق ✓" : money(Math.abs(d.diff))}</b>}
        />
      )}
      {s.shift.note && <div className="s-small">ملاحظة: {s.shift.note}</div>}
      <Rule />
      <ProductsTable rows={s.products} />
      {s.day && (
        <>
          <Rule />
          <div className="s-head">إجمالي اليوم ({num(s.day.shifts)} ورديات)</div>
          <Row l="الإيرادات" v={money(s.day.totals.income)} />
          <Row l="المصروفات" v={money(s.day.totals.expenses)} />
          <Row l="صافي الربح" v={money(s.day.totals.net)} cls="s-total" />
          <Row l="عدد الفواتير" v={num(s.day.totals.orders)} cls="s-small" />
        </>
      )}
      <Rule />
      <div className="s-center s-small">طُبع {stamp(new Date().toISOString())}</div>
    </div>
  );
}

// --- كشف اليوم | daily statement ----------------------------------------------

export function DaySlip({ d, shop }: { d: DayStatement; shop: Shop }) {
  const t = d.totals;
  return (
    <div className="slip">
      <Header shop={shop} title="كشف اليوم" />
      <div className="s-center">{longDate(d.date)}</div>
      <Row l="الورديات" v={d.shifts.map((s) => (s.kind === "day" ? "صباحية" : "مسائية")).join(" + ") || "—"} />
      <Row l="عدد الفواتير" v={num(t.orders)} />
      <Rule />
      <IncomeBlock lines={d.income_lines} total={t.income} />
      <Rule />
      <ExpenseBlock lines={d.expense_lines} total={t.expenses} />
      <NetBlock t={t} />
      <ProductsTable rows={d.products} />
      <Rule />
      <div className="s-center s-small">طُبع {stamp(new Date().toISOString())}</div>
    </div>
  );
}

// --- الكشف الشهري | monthly statement -----------------------------------------

export function MonthSlip({ m, shop }: { m: MonthStatement; shop: Shop }) {
  const t = m.totals;
  return (
    <div className="slip">
      <Header shop={shop} title={`الكشف الشهري — ${monthLabel(m.month)}`} />
      <Row l="أيام العمل" v={num(m.days.filter((d) => d.orders > 0).length)} />
      <Row l="عدد الفواتير" v={num(t.orders)} />
      <Rule />
      <IncomeBlock lines={m.income_lines} total={t.income} />
      <Rule />
      <ExpenseBlock lines={m.expense_lines} total={t.expenses} />
      <NetBlock t={t} />
      <ProductsTable rows={m.products} />
      {m.days.length > 0 && (
        <>
          <div className="s-sec">الأيام</div>
          <table>
            <thead>
              <tr>
                <th>اليوم</th>
                <th className="n">إيراد</th>
                <th className="n">مصروف</th>
                <th className="n">صافي</th>
              </tr>
            </thead>
            <tbody>
              {m.days.map((d) => (
                <tr key={d.date}>
                  <td>{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                  <td className="n">{num(d.income)}</td>
                  <td className="n">{num(d.expenses)}</td>
                  <td className="n">{num(d.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Rule />
      <div className="s-center s-small">طُبع {stamp(new Date().toISOString())}</div>
    </div>
  );
}

// --- جرد الشهر | monthly stock sheet --------------------------------------------

export function StockMonthSlip({ m, shop }: { m: StockMonth; shop: Shop }) {
  return (
    <div className="slip">
      <Header shop={shop} title={`جرد المخزون — ${monthLabel(m.month)}`} />
      <table>
        <thead>
          <tr>
            <th>المادة</th>
            <th className="n">أول</th>
            <th className="n">وارد</th>
            <th className="n">مستهلك</th>
            <th className="n">آخر</th>
          </tr>
        </thead>
        <tbody>
          {m.items.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="n">{qty(r.opening, r.unit)}</td>
              <td className="n">{r.restocked ? qty(r.restocked, r.unit) : "—"}</td>
              <td className="n">{r.sold ? qty(r.sold, r.unit) : "—"}</td>
              <td className="n">{qty(r.closing, r.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.restocks.length > 0 && (
        <>
          <div className="s-sec">التوريدات</div>
          {m.restocks.map((r) => (
            <Row key={r.id} l={`${shortDate(r.date)} ${r.item}`} v={`+${qty(r.qty, r.unit)}${r.cost ? ` · ${num(r.cost)}` : ""}`} cls="s-small" />
          ))}
        </>
      )}
      <Rule />
      <div className="s-center s-small">طُبع {stamp(new Date().toISOString())}</div>
    </div>
  );
}
