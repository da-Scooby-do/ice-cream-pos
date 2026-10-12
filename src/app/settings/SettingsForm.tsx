"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction, type SettingsInput } from "@/lib/actions";
import { money } from "@/lib/money";
import { Field, inputCls } from "@/components/form";

export default function SettingsForm({ initial }: { initial: SettingsInput }) {
  const [v, setV] = useState<SettingsInput>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = (k: keyof SettingsInput) => (e: { target: { value: string } }) => {
    setMsg(null);
    setV({ ...v, [k]: e.target.value });
  };

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveSettingsAction(v);
      setMsg(res.ok ? { ok: true, text: "تم الحفظ ✓ — يظهر في كل الشاشات والفواتير الجديدة" } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-4 items-start">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="bg-white rounded-3xl shadow-sm p-5 space-y-4"
      >
        <div>
          <h1 className="text-xl font-extrabold text-choco">إعدادات المحل</h1>
          <p className="text-xs text-choco/50">تظهر في شاشة الدخول وشاشة الكاشير وأعلى وأسفل كل فاتورة.</p>
        </div>

        <Field label="اسم المحل">
          <input value={v.shop_name} onChange={set("shop_name")} className={inputCls} maxLength={40} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="رقم الهاتف" hint="اختياري — يُطبع تحت الاسم">
            <input value={v.phone} onChange={set("phone")} className={`${inputCls} tnum`} maxLength={30} dir="ltr" inputMode="tel" />
          </Field>
          <Field label="العنوان" hint="اختياري — يُطبع تحت الاسم">
            <input value={v.address} onChange={set("address")} className={inputCls} maxLength={80} />
          </Field>
        </div>

        <Field label="تذييل الفاتورة" hint="يُطبع في آخر كل فاتورة — يمكن كتابة أكثر من سطر">
          <textarea
            value={v.receipt_footer}
            onChange={set("receipt_footer")}
            className={`${inputCls} min-h-[84px] resize-y`}
            maxLength={120}
          />
        </Field>

        {msg && (
          <p className={`text-sm font-bold rounded-xl px-3 py-2.5 ${msg.ok ? "bg-mint/10 text-mint" : "bg-red-50 text-red-600"}`}>
            {msg.text}
          </p>
        )}

        <button type="submit" disabled={pending || !dirty} className="btn w-full py-3.5 text-lg bg-mint text-white">
          {pending ? "جاري الحفظ…" : "حفظ"}
        </button>
      </form>

      {/* معاينة الفاتورة | live receipt preview, 80mm-ish */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-choco/40 px-1">معاينة الفاتورة</p>
        <div className="bg-white shadow-sm rounded-sm mx-auto w-[280px] px-4 py-5 text-[12px] leading-relaxed text-black font-sans border-t-4 border-dashed border-black/10">
          <p className="text-center text-[17px] font-extrabold">{v.shop_name || "اسم المحل"}</p>
          {v.address && <p className="text-center text-[11px]">{v.address}</p>}
          {v.phone && <p className="text-center text-[11px] tnum" dir="ltr">{v.phone}</p>}
          <div className="border-t border-dashed border-black my-2" />
          <div className="flex justify-between text-[10px]"><span>فاتورة #47</span><span className="tnum">2026/10/12 6:42 م</span></div>
          <div className="border-t border-dashed border-black my-2" />
          <div className="flex justify-between font-bold"><span>سكوبين</span><span className="tnum">{money(2000)}</span></div>
          <p className="text-[10px]">النكهات: مانجو + شوكولاتة</p>
          <div className="border-t border-dashed border-black my-2" />
          <div className="flex justify-between text-[15px] font-extrabold"><span>الإجمالي</span><span className="tnum">{money(2000)}</span></div>
          <div className="border-t border-dashed border-black my-2" />
          <p className="text-center whitespace-pre-line">{v.receipt_footer || "شكراً لزيارتكم"}</p>
        </div>
      </div>
    </div>
  );
}
