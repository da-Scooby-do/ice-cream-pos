"use client";

import { AlertTriangle, ClipboardCheck, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adjustStockAction, restockAction } from "@/actions/manage";
import { Empty, ErrorNote, Field, Modal, NumInput, SaveBar, Segmented, Toggle, useAction } from "@/components/ui";
import { INPUT_UNIT, money, qty } from "@/lib/format";
import { clock, shortDate } from "@/lib/time";
import type { RestockRow, StockLevel, StockMonthRow } from "@/lib/types";

export function StockBoard({
  items,
  canAdd,
  canEdit,
  shiftOpen,
}: {
  items: StockLevel[];
  canAdd: boolean;
  canEdit: boolean;
  shiftOpen: boolean;
}) {
  const [restock, setRestock] = useState<StockLevel | null>(null);
  const [adjust, setAdjust] = useState<StockLevel | null>(null);
  if (!items.length) {
    return (
      <div className="card">
        <Empty icon={<PackagePlus />} title="لا توجد مواد مخزون بعد">
          <Link href="/products?tab=flavors" className="text-sky-700 font-semibold underline">
            أضف النكهات والمواد من صفحة الأصناف
          </Link>
        </Empty>
      </div>
    );
  }
  const low = items.filter((i) => i.low);
  const Group = ({ title, rows }: { title: string; rows: StockLevel[] }) =>
    rows.length ? (
      <section className="card overflow-hidden">
        <h2 className="font-bold px-5 pt-4 pb-2">{title}</h2>
        <table className="table-x">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>المتوفر</th>
              <th>تنبيه عند</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={i.low ? "bg-red-50/60" : ""}>
                <td className="font-semibold">
                  {i.name}
                  {i.low && <span className="chip bg-red-600 text-white ms-2">نقص</span>}
                </td>
                <td className={`tnum font-bold ${i.qty < 0 ? "text-red-700" : ""}`}>{qty(i.qty, i.unit)}</td>
                <td className="tnum text-ink-400">{i.alert_qty ? qty(i.alert_qty, i.unit) : "—"}</td>
                <td className="text-end whitespace-nowrap">
                  {canAdd && (
                    <button type="button" onClick={() => setRestock(i)} className="btn-go px-3 py-1.5 text-sm me-1.5">
                      <PackagePlus size={15} /> توريد
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => setAdjust(i)} className="btn-soft px-3 py-1.5 text-sm">
                      <ClipboardCheck size={15} /> جرد / تالف
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ) : null;

  return (
    <>
      {low.length > 0 && (
        <div className="rounded-3xl bg-red-50 ring-1 ring-red-200 p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-700 shrink-0" />
          <div>
            <p className="font-bold text-red-800">تحتاج توريد ({low.length})</p>
            <p className="text-sm text-red-800/80">{low.map((l) => `${l.name} (${qty(l.qty, l.unit)})`).join("، ")}</p>
          </div>
        </div>
      )}
      <Group title="النكهات" rows={items.filter((i) => i.kind === "flavor")} />
      <Group title="الأكواب والمواد" rows={items.filter((i) => i.kind === "item")} />
      {restock && <RestockDialog item={restock} shiftOpen={shiftOpen} onClose={() => setRestock(null)} />}
      {adjust && <AdjustDialog item={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}

function RestockDialog({ item, shiftOpen, onClose }: { item: StockLevel; shiftOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const u = INPUT_UNIT[item.unit];
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [drawer, setDrawer] = useState(false);
  const { pending, error, run } = useAction();
  const base = Number(amount || 0) * u.factor;
  return (
    <Modal title={`توريد: ${item.name}`} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => restockAction({ stock_item_id: item.id, qty: base, cost, note, drawer }), () => {
            router.refresh();
            onClose();
          });
        }}
      >
        <p className="text-sm text-ink-500">
          المتوفر الآن: <b className="tnum">{qty(item.qty, item.unit)}</b>
          {base > 0 && (
            <>
              {" "}
              ← بعد التوريد: <b className="tnum text-emerald-700">{qty(item.qty + base, item.unit)}</b>
            </>
          )}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية المستلمة">
            <NumInput value={amount} onChange={setAmount} suffix={u.label} autoFocus />
          </Field>
          <Field label="التكلفة (اختياري)" hint="تُسجَّل مصروفاً تلقائياً">
            <NumInput value={cost} onChange={setCost} suffix="ج.س" />
          </Field>
        </div>
        <Field label="ملاحظة (اختياري)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: المورد، رقم الفاتورة" />
        </Field>
        {Number(cost) > 0 && shiftOpen && (
          <Toggle checked={drawer} onChange={setDrawer} label="دُفعت التكلفة نقداً من درج الوردية" />
        )}
        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} label="تسجيل التوريد" disabled={base <= 0} />
      </form>
    </Modal>
  );
}

function AdjustDialog({ item, onClose }: { item: StockLevel; onClose: () => void }) {
  const router = useRouter();
  const u = INPUT_UNIT[item.unit];
  const [mode, setMode] = useState<"set" | "waste">("set");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();
  const base = Number(amount || 0) * u.factor;
  const after = mode === "set" ? base : item.qty - base;
  return (
    <Modal title={`جرد / تالف: ${item.name}`} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => adjustStockAction({ stock_item_id: item.id, mode, value: base, note }), () => {
            router.refresh();
            onClose();
          });
        }}
      >
        <Segmented<"set" | "waste">
          value={mode}
          onChange={setMode}
          options={[
            { value: "set", label: "جرد: الكمية الموجودة فعلاً" },
            { value: "waste", label: "تالف / مفقود" },
          ]}
        />
        <p className="text-sm text-ink-500">
          في النظام الآن: <b className="tnum">{qty(item.qty, item.unit)}</b>
          {amount !== "" && (
            <>
              {" "}
              ← سيصبح: <b className="tnum">{qty(after, item.unit)}</b>
            </>
          )}
        </p>
        <Field label={mode === "set" ? "الكمية التي عددتها" : "الكمية التالفة"}>
          <NumInput value={amount} onChange={setAmount} suffix={u.label} autoFocus />
        </Field>
        <Field label="ملاحظة (اختياري)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} label="حفظ" disabled={amount === ""} />
      </form>
    </Modal>
  );
}

export function RestockTable({ rows }: { rows: RestockRow[] }) {
  if (!rows.length) {
    return (
      <div className="card">
        <Empty title="لا توجد توريدات في هذا الشهر" />
      </div>
    );
  }
  const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <section className="card overflow-hidden">
      <table className="table-x">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>المادة</th>
            <th>الكمية</th>
            <th>التكلفة</th>
            <th>بواسطة</th>
            <th>ملاحظة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="tnum whitespace-nowrap">
                {shortDate(r.date)} <span className="text-ink-400">{clock(r.created_at)}</span>
              </td>
              <td className="font-semibold">{r.item}</td>
              <td className="tnum font-bold text-emerald-700">+{qty(r.qty, r.unit)}</td>
              <td className="tnum">{r.cost ? money(r.cost) : "—"}</td>
              <td>{r.staff}</td>
              <td className="text-ink-500 text-xs">{r.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
        {totalCost > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="font-bold">
                إجمالي تكلفة التوريدات
              </td>
              <td className="tnum font-bold" colSpan={3}>
                {money(totalCost)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

export function LedgerTable({ rows }: { rows: StockMonthRow[] }) {
  if (!rows.length) {
    return (
      <div className="card">
        <Empty title="لا توجد حركة مخزون" />
      </div>
    );
  }
  return (
    <section className="card overflow-x-auto">
      <p className="text-xs text-ink-400 px-5 pt-4">
        أول الشهر + الوارد − المباع ± الجرد والتالف = آخر الشهر
      </p>
      <table className="table-x">
        <thead>
          <tr>
            <th>المادة</th>
            <th className="!text-end">أول الشهر</th>
            <th className="!text-end">الوارد (توريد)</th>
            <th className="!text-end">المستهلك (مبيعات)</th>
            <th className="!text-end">جرد / تالف</th>
            <th className="!text-end">آخر الشهر</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.name}</td>
              <td className="text-end tnum">{qty(r.opening, r.unit)}</td>
              <td className="text-end tnum text-emerald-700">{r.restocked ? `+${qty(r.restocked, r.unit)}` : "—"}</td>
              <td className="text-end tnum text-red-700">{r.sold ? `−${qty(r.sold, r.unit)}` : "—"}</td>
              <td className="text-end tnum">{r.adjusted ? qty(r.adjusted, r.unit) : "—"}</td>
              <td className="text-end tnum font-bold">{qty(r.closing, r.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
