"use client";

// قسيمة 80 ملم | the 80mm slip.
// It sits hidden in the DOM and is the only thing @media print reveals,
// so window.print() + Chrome's --kiosk-printing sends it straight to the
// Xprinter with no dialog and no page furniture.
import { money, num, weight } from "@/lib/money";
import type { Receipt } from "@/lib/types";

const PAY_LABEL: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة",
};

export default function ReceiptSheet({
  receipt,
  shopName,
  phone,
  footer,
}: {
  receipt: Receipt | null;
  shopName: string;
  phone?: string | null;
  footer?: string | null;
}) {
  if (!receipt) return null;

  const when = receipt.created_at ? new Date(receipt.created_at) : new Date();
  const stamp = new Intl.DateTimeFormat("ar-SD-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Khartoum",
  }).format(when);

  return (
    <div className="receipt-sheet" aria-hidden="true">
      <div className="r-title">{shopName}</div>
      {phone ? <div className="r-sub">{phone}</div> : null}

      <div className="r-rule" />

      <div className="r-row r-meta">
        <span>فاتورة #{num(receipt.order_no)}</span>
        <span className="tnum">{stamp}</span>
      </div>
      {receipt.cashier ? <div className="r-meta">الكاشير: {receipt.cashier}</div> : null}

      <div className="r-rule" />

      {receipt.items.map((it, i) => (
        <div key={i} style={{ marginBottom: "1.5mm" }}>
          <div className="r-row">
            <span style={{ fontWeight: 700 }}>
              {it.qty > 1 ? `${num(it.qty)} × ` : ""}
              {it.name_ar}
              {it.weight_grams ? ` (${weight(it.weight_grams)})` : ""}
            </span>
            <span className="tnum" style={{ fontWeight: 700 }}>
              {money(it.line_total)}
            </span>
          </div>

          {it.flavors?.length ? (
            <div className="r-meta">النكهات: {it.flavors.join(" + ")}</div>
          ) : null}

          {it.extras?.length ? (
            <div className="r-meta">
              إضافات: {it.extras.map((e) => e.name_ar).join(" + ")}
            </div>
          ) : null}
        </div>
      ))}

      <div className="r-rule" />

      <div className="r-row">
        <span>المجموع</span>
        <span className="tnum">{money(receipt.subtotal)}</span>
      </div>

      {Number(receipt.discount) > 0 && (
        <div className="r-row">
          <span>خصم</span>
          <span className="tnum">- {money(receipt.discount)}</span>
        </div>
      )}

      <div className="r-row r-total">
        <span>الإجمالي</span>
        <span className="tnum">{money(receipt.total)}</span>
      </div>

      <div className="r-row r-meta">
        <span>الدفع</span>
        <span>{PAY_LABEL[receipt.payment_method ?? "cash"]}</span>
      </div>

      {receipt.change != null && Number(receipt.change) > 0 && (
        <div className="r-row r-meta">
          <span>الباقي</span>
          <span className="tnum">{money(receipt.change)}</span>
        </div>
      )}

      <div className="r-rule" />
      <div className="r-center">{footer || "شكراً لزيارتكم"}</div>
    </div>
  );
}
