"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { closeShiftAction, logoutAction } from "@/lib/actions";
import { money } from "@/lib/money";
import type { ShiftSummary } from "@/lib/types";
import Keypad from "@/components/Keypad";
import ZReportSheet, { ZReportBody } from "@/components/ZReport";

export default function CloseShiftForm({
  shiftId, live, shopName,
}: {
  shiftId: string;
  live: ShiftSummary;
  shopName: string;
}) {
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [final, setFinal] = useState<ShiftSummary | null>(null);
  const [pending, start] = useTransition();

  const countedNum = Number(counted || 0);
  const diff = countedNum - Number(live.expected_cash);

  // اطبع تقرير Z فور التقفيل | print the Z-report as soon as it closes
  useEffect(() => {
    if (!final) return;
    const t = setTimeout(() => window.print(), 80);
    return () => clearTimeout(t);
  }, [final]);

  function submit() {
    setError(null);
    start(async () => {
      const res = await closeShiftAction(shiftId, countedNum);
      if (res.ok) setFinal(res.data as ShiftSummary);
      else setError(res.error);
    });
  }

  if (final) {
    return (
      <>
        <main className="min-h-dvh grid place-items-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-sm p-6 space-y-4">
            <h1 className="text-2xl font-extrabold text-center text-choco">تم تقفيل الوردية ✓</h1>
            <div className="text-sm space-y-1">
              <ZReportBody s={final} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => window.print()} className="btn py-4 bg-cream border border-black/10 text-choco">
                طباعة مرة أخرى
              </button>
              <form action={logoutAction}>
                <button type="submit" className="btn w-full py-4 bg-choco text-white">
                  خروج
                </button>
              </form>
            </div>
          </div>
        </main>
        <ZReportSheet s={final} shopName={shopName} />
      </>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-3xl grid md:grid-cols-2 gap-4">
        {/* الملخص | live summary */}
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3">
          <h1 className="text-xl font-extrabold text-choco">ملخص الوردية</h1>
          <Stat label="عدد الفواتير" value={String(live.orders_count)} />
          <Stat label="مبيعات نقدية" value={money(live.cash_sales)} />
          <Stat label="بطاقة / محفظة" value={money(live.card_sales)} />
          <Stat label="إجمالي المبيعات" value={money(live.total_sales)} big />
          <div className="border-t border-black/5 pt-3" />
          <Stat label="نقدية الافتتاح" value={money(live.opening_cash)} />
          <Stat label="المتوقع في الدرج" value={money(live.expected_cash)} big />
          <Link href="/pos" className="block text-center text-sm text-choco/50 pt-2">
            ← رجوع للكاشير
          </Link>
        </div>

        {/* العدّ | cash count */}
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
          <label className="text-sm font-bold text-choco/70">النقدية المعدودة في الدرج</label>
          <div className="h-16 rounded-2xl bg-cream border-2 border-black/10 grid place-items-center text-3xl font-extrabold text-choco tnum">
            {money(countedNum)}
          </div>

          {counted !== "" && (
            <p
              className={`text-center font-extrabold rounded-xl py-2 ${
                diff === 0
                  ? "bg-mint/10 text-mint"
                  : diff < 0
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {diff === 0
                ? "مطابق ✓"
                : diff < 0
                ? `عجز ${money(Math.abs(diff))}`
                : `زيادة ${money(diff)}`}
            </p>
          )}

          <Keypad
            value={counted}
            onChange={setCounted}
            maxLength={9}
            allowDecimal
            onEnter={submit}
            enterLabel={pending ? "جاري التقفيل…" : "تقفيل وطباعة التقرير"}
            enterDisabled={pending || counted === ""}
          />

          {error && (
            <p className="text-center text-sm font-bold text-red-600 bg-red-50 rounded-xl py-3">{error}</p>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-choco/60 text-sm">{label}</span>
      <span className={`tnum font-extrabold ${big ? "text-xl text-berry" : "text-choco"}`}>{value}</span>
    </div>
  );
}
