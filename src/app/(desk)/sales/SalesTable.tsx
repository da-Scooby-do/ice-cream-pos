"use client";

import { Ban, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { receiptAction, voidOrderAction } from "@/actions/sales";
import { ReceiptSlip } from "@/components/slips";
import { Empty, ErrorNote, Field, Modal, PrintPortal, useAction } from "@/components/ui";
import { grams, money, num } from "@/lib/format";
import { printSlip } from "@/lib/print";
import { clock, shortDate } from "@/lib/time";
import { PAYMENT_LABEL, type OrderRow, type Receipt, type Shop } from "@/lib/types";

export default function SalesTable({
  rows,
  shop,
  canVoid,
  isAdmin,
}: {
  rows: OrderRow[];
  shop: Shop;
  canVoid: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState<OrderRow | null>(null);
  if (!rows.length) return <Empty title="لا توجد فواتير في هذه الفترة" />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="table-x">
          <thead>
            <tr>
              <th>#</th>
              <th>الوقت</th>
              <th>الأصناف</th>
              <th>الكاشير</th>
              <th>الدفع</th>
              <th className="text-end">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} className={`cursor-pointer hover:bg-sky-50 ${r.voided ? "opacity-60" : ""}`}>
                <td className="tnum font-semibold">{num(r.number)}</td>
                <td className="tnum text-ink-500 whitespace-nowrap">
                  {shortDate(r.business_date)} · {clock(r.created_at)}
                </td>
                <td className="max-w-[360px] truncate">{r.summary}</td>
                <td>{r.cashier}</td>
                <td>
                  <span className={`chip ${r.payment === "cash" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>
                    {PAYMENT_LABEL[r.payment]}
                  </span>
                </td>
                <td className="text-end tnum font-semibold whitespace-nowrap">
                  {r.voided ? <span className="chip bg-red-50 text-red-700 me-2">ملغاة</span> : null}
                  <span className={r.voided ? "line-through" : ""}>{money(r.total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <OrderDialog
          row={open}
          shop={shop}
          canVoid={canVoid && !open.voided && (isAdmin || open.shift_open)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function OrderDialog({ row, shop, canVoid, onClose }: { row: OrderRow; shop: Shop; canVoid: boolean; onClose: () => void }) {
  const router = useRouter();
  const [r, setR] = useState<Receipt | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const load = useAction();
  const act = useAction();

  useEffect(() => {
    load.run(() => receiptAction(row.id), setR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  return (
    <Modal title={`فاتورة #${num(row.number)}`} onClose={onClose} size="md">
      <ErrorNote error={load.error} />
      {r && (
        <>
          <div className="text-sm text-ink-500 flex flex-wrap gap-x-4">
            <span>{shortDate(row.business_date)} · {clock(r.created_at)}</span>
            <span>الكاشير: {r.cashier}</span>
            <span>{PAYMENT_LABEL[r.payment]}</span>
          </div>
          {row.voided && (
            <p className="text-sm font-semibold text-red-700 bg-red-50 rounded-xl px-3 py-2">
              ملغاة — {row.void_reason}
            </p>
          )}
          <div className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-100">
            {r.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-semibold">
                    {it.qty > 1 ? `${num(it.qty)} × ` : ""}
                    {it.name}
                    {it.size ? ` — ${it.size}` : ""}
                    {it.weight_g ? ` (${grams(it.weight_g)})` : ""}
                  </p>
                  {it.flavors.length > 0 && <p className="text-xs text-ink-500">{it.flavors.join(" + ")}</p>}
                  {it.extras.length > 0 && <p className="text-xs text-sky-700">+ {it.extras.join(" + ")}</p>}
                </div>
                <span className="tnum font-semibold">{money(it.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 font-bold">
              <span>الإجمالي</span>
              <span className="tnum">{money(r.total)}</span>
            </div>
          </div>

          {voiding ? (
            <form
              className="space-y-3 rounded-2xl bg-red-50 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                act.run(() => voidOrderAction(row.id, reason), () => {
                  router.refresh();
                  onClose();
                });
              }}
            >
              <Field label="سبب الإلغاء" hint="المخزون المستهلك يرجع تلقائياً">
                <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <ErrorNote error={act.error} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setVoiding(false)} className="btn-soft py-2.5">
                  تراجع
                </button>
                <button type="submit" disabled={act.pending || !reason.trim()} className="btn-danger py-2.5">
                  تأكيد الإلغاء
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void printSlip()} className="btn-soft py-3">
                <Printer size={18} /> طباعة نسخة
              </button>
              {canVoid && (
                <button type="button" onClick={() => setVoiding(true)} className="btn bg-red-50 text-red-700 hover:bg-red-100 py-3">
                  <Ban size={18} /> إلغاء الفاتورة
                </button>
              )}
            </div>
          )}
          <PrintPortal>
            <ReceiptSlip r={r} shop={shop} />
          </PrintPortal>
        </>
      )}
    </Modal>
  );
}
