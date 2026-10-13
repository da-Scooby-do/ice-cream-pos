"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addEntryAction } from "@/actions/sales";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { money } from "@/lib/format";
import Keypad from "./Keypad";
import { ErrorNote, Field, FieldGroup, Modal, Toggle, useAction } from "./ui";

// تسجيل مصروف أو إيراد | record an expense or other income.
export default function EntryDialog({
  kind,
  shiftOpen,
  used = [],
  onClose,
  onSaved,
}: {
  kind: "income" | "expense";
  shiftOpen: boolean;
  used?: string[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [drawer, setDrawer] = useState(true);
  const { pending, error, run } = useAction();
  const presets = [...new Set([...used, ...(kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)])].slice(0, 14);
  const isExp = kind === "expense";
  const [typing, setTyping] = useState(false);

  const save = () =>
    run(() => addEntryAction({ kind, category, amount, note, drawer: shiftOpen && drawer }), () => {
      router.refresh();
      onSaved?.();
      onClose();
    });

  return (
    <Modal title={isExp ? "تسجيل مصروف" : "تسجيل إيراد آخر"} onClose={onClose} size="lg">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className={`rounded-2xl p-4 text-center ring-1 ${isExp ? "bg-red-50 ring-red-100" : "bg-emerald-50 ring-emerald-100"}`}>
            <p className="label">المبلغ</p>
            <p className="text-3xl font-bold tnum mt-1">{money(Number(amount || 0))}</p>
          </div>
          <FieldGroup label="الفئة">
            <div className="flex flex-wrap gap-1.5">
              {presets.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`chip text-sm px-3 py-1.5 ${category === c ? "bg-ink text-white" : "bg-ink-50 text-ink hover:bg-ink-100"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              className="input mt-2"
              placeholder="أو اكتب فئة أخرى…"
              value={presets.includes(category) ? "" : category}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="فئة أخرى"
            />
          </FieldGroup>
          <Field label="ملاحظة (اختياري)">
            <input
              className="input"
              value={note}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isExp ? "مثلاً: فاتورة كهرباء شهر 10" : ""}
            />
          </Field>
          {shiftOpen ? (
            <Toggle
              checked={drawer}
              onChange={setDrawer}
              label={isExp ? "دُفع نقداً من درج الوردية" : "دخل نقداً إلى درج الوردية"}
              hint="يُحسب في النقدية المتوقعة عند التقفيل"
            />
          ) : (
            <p className="text-xs text-ink-400">لا توجد وردية مفتوحة — يُسجَّل على اليوم دون التأثير على الدرج.</p>
          )}
        </div>
        <div className="space-y-3">
          <Keypad
            value={amount}
            onChange={setAmount}
            allowDecimal
            maxLength={10}
            listen={!typing}
            onEnter={save}
            enterLabel={pending ? "جاري الحفظ…" : "حفظ"}
            enterDisabled={pending || !Number(amount) || !category.trim()}
          />
          <ErrorNote error={error} />
        </div>
      </div>
    </Modal>
  );
}
