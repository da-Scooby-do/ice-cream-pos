"use client";

import { useState, useTransition } from "react";
import { voidOrderAction } from "@/lib/actions";

// إلغاء فاتورة يعيد المخزون | voiding returns the stock it used.
export default function VoidButton({ orderId, orderNo }: { orderId: string; orderNo: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    const reason = window.prompt(`سبب إلغاء الفاتورة #${orderNo}؟`);
    if (!reason?.trim()) return;
    start(async () => {
      const res = await voidOrderAction(orderId, reason);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={err ?? undefined}
      className={`text-xs font-bold rounded-lg px-2 py-1 w-14 ${err ? "bg-red-600 text-white" : "bg-red-50 text-red-600"}`}
    >
      {pending ? "…" : "إلغاء"}
    </button>
  );
}
