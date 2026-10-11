"use client";

// تقرير الوردية (Z) | end-of-shift Z-report, printed on the same 80mm roll.
import { money, num, weight } from "@/lib/money";
import type { ShiftSummary } from "@/lib/types";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ar-SD-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Khartoum",
  }).format(new Date(ts));
}

export function ZReportBody({ s }: { s: ShiftSummary }) {
  const diff = s.difference == null ? null : Number(s.difference);
  return (
    <>
      <Row label="الكاشير" value={s.cashier} />
      <Row label="الفتح" value={fmt(s.opened_at)} />
      <Row label="التقفيل" value={fmt(s.closed_at)} />
      <Rule />
      <Row label="عدد الفواتير" value={num(s.orders_count)} />
      <Row label="مبيعات نقدية" value={money(s.cash_sales)} />
      <Row label="بطاقة / محفظة" value={money(s.card_sales)} />
      <Row label="إجمالي المبيعات" value={money(s.total_sales)} strong />
      {Number(s.discounts) > 0 && <Row label="الخصومات" value={money(s.discounts)} />}
      {Number(s.voids_count) > 0 && <Row label="فواتير ملغاة" value={num(s.voids_count)} />}
      <Rule />
      <Row label="نقدية الافتتاح" value={money(s.opening_cash)} />
      <Row label="النقدية المتوقعة" value={money(s.expected_cash)} />
      <Row label="النقدية المعدودة" value={s.counted_cash == null ? "—" : money(s.counted_cash)} />
      <Row
        label={diff == null ? "الفرق" : diff < 0 ? "عجز" : diff > 0 ? "زيادة" : "الفرق"}
        value={diff == null ? "—" : money(Math.abs(diff))}
        strong
      />
      {!!s.top_flavors?.length && (
        <>
          <Rule />
          <div style={{ fontWeight: 700 }}>النكهات الأكثر مبيعاً</div>
          {s.top_flavors.map((f) => (
            <Row key={f.name_ar} label={f.name_ar} value={weight(f.grams)} />
          ))}
        </>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`r-row flex justify-between gap-2 ${strong ? "r-total font-extrabold" : ""}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function Rule() {
  return <div className="r-rule border-t border-dashed border-black/20 my-2" />;
}

export default function ZReportSheet({ s, shopName }: { s: ShiftSummary | null; shopName: string }) {
  if (!s) return null;
  return (
    <div className="receipt-sheet" aria-hidden="true">
      <div className="r-title">{shopName}</div>
      <div className="r-sub">تقرير تقفيل الوردية (Z)</div>
      <div className="r-rule" />
      <ZReportBody s={s} />
    </div>
  );
}
