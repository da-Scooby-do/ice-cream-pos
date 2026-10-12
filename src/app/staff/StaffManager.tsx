"use client";

import { useState, useTransition } from "react";
import { deleteStaffAction, saveStaffAction } from "@/lib/actions";
import type { AdminStaff, Role } from "@/lib/types";
import { Field, FormShell, inputCls, useSave } from "@/components/form";

const ROLE_LABEL: Record<Role, string> = { cashier: "كاشير", manager: "مدير" };

function lastShift(ts: string | null) {
  if (!ts) return "لم يفتح وردية بعد";
  return `آخر وردية: ${new Intl.DateTimeFormat("ar-SD-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Khartoum",
  }).format(new Date(ts))}`;
}

export default function StaffManager({ staff, meId }: { staff: AdminStaff[]; meId: string }) {
  const [editing, setEditing] = useState<AdminStaff | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-choco">الموظفون</h1>
          <p className="text-xs text-choco/50">كل موظف يدخل برقمه السري فقط، وتُسجَّل الورديات والفواتير باسمه.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn px-4 py-2.5 text-sm bg-mint text-white shrink-0"
        >
          + موظف جديد
        </button>
      </div>

      <section className="bg-white rounded-3xl shadow-sm p-2 sm:p-4">
        <ul className="divide-y divide-black/5">
          {staff.map((m) => (
            <li key={m.id} className={`flex items-center gap-3 px-2 py-3 ${m.is_active ? "" : "opacity-50"}`}>
              <span
                className={`w-10 h-10 rounded-2xl grid place-items-center font-extrabold shrink-0 ${
                  m.role === "manager" ? "bg-choco text-white" : "bg-berry/10 text-berry"
                }`}
              >
                {m.name.trim().charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-choco">
                  {m.name}
                  <span className="ms-2 text-[10px] font-bold bg-cream border border-black/10 rounded-full px-2 py-0.5 text-choco/60">
                    {ROLE_LABEL[m.role]}
                  </span>
                  {m.id === meId && (
                    <span className="ms-1 text-[10px] font-bold bg-mint/10 text-mint rounded-full px-2 py-0.5">أنت</span>
                  )}
                  {!m.is_active && (
                    <span className="ms-1 text-[10px] font-bold bg-black/10 rounded-full px-2 py-0.5 text-choco/70">موقوف</span>
                  )}
                </p>
                <p className="text-xs text-choco/50 tnum truncate">{lastShift(m.last_shift_at)}</p>
              </div>
              <button type="button" onClick={() => setEditing(m)} className="btn px-4 py-2 text-sm bg-choco text-white">
                تعديل
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-choco/40 px-2">
        الموظف الموقوف لا يظهر في شاشة الدخول ويُسجَّل خروجه فوراً — يمكن إعادة تفعيله لاحقاً.
        الحذف يزيله من القائمة نهائياً. في الحالتين تبقى فواتيره القديمة محفوظة باسمه.
      </p>

      {editing && (
        <StaffForm
          row={editing === "new" ? null : editing}
          isMe={editing !== "new" && editing.id === meId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function StaffForm({ row, isMe, onClose }: { row: AdminStaff | null; isMe: boolean; onClose: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [role, setRole] = useState<Role>(row?.role ?? "cashier");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(row?.is_active ?? true);
  const { pending, error, save } = useSave(onClose);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name}` : "موظف جديد"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() => save(() => saveStaffAction({ id: row?.id, name, role, pin, is_active: active }))}
    >
      <Field label="الاسم (كما يظهر في شاشة الدخول والفواتير)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>

      <Field
        label="الصلاحية"
        hint={isMe ? "لا يمكنك تغيير صلاحيتك بنفسك" : "المدير يرى التقارير ويعدّل الأصناف والمخزون والموظفين ويلغي الفواتير"}
      >
        <div className="grid grid-cols-2 gap-2">
          {(["cashier", "manager"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={isMe}
              onClick={() => setRole(r)}
              className={`btn py-3 text-sm border-2 ${
                role === r ? "border-berry bg-berry/10 text-berry" : "border-black/10 bg-cream text-choco/70"
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={row ? "رقم سري جديد" : "الرقم السري"}
        hint={row ? "اتركه فارغاً للإبقاء على الرقم الحالي — من 4 إلى 6 أرقام، ومختلف عن كل الموظفين" : "من 4 إلى 6 أرقام، ومختلف عن كل الموظفين — به يُعرف الموظف عند الدخول"}
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={`${inputCls} tnum tracking-[0.4em]`}
          dir="ltr"
          placeholder={row ? "••••" : ""}
        />
      </Field>

      <button
        type="button"
        disabled={isMe}
        onClick={() => setActive(!active)}
        className={`btn w-full py-3 text-sm border-2 ${
          active ? "border-mint bg-mint/10 text-mint" : "border-black/10 bg-cream text-choco/50"
        }`}
      >
        {active ? "✓ الحساب نشط — يستطيع الدخول" : "الحساب موقوف — لا يستطيع الدخول"}
      </button>

      {row && !isMe && <DeleteStaff id={row.id} name={row.name} onDone={onClose} />}
    </FormShell>
  );
}

// ---------------------------------------------------------------------
// حذف الموظف — بخطوتين للتأكيد | remove, with a confirm step
// ---------------------------------------------------------------------
function DeleteStaff({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteStaffAction(id);
      if (res.ok) onDone();
      else {
        setError(res.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="border-t border-black/5 pt-4 space-y-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn w-full py-3 text-sm bg-red-50 text-red-600 border-2 border-red-100"
        >
          حذف {name}
        </button>
      ) : (
        <div className="rounded-2xl bg-red-50 border-2 border-red-200 p-3 space-y-2">
          <p className="text-sm font-bold text-red-700">
            حذف {name}؟ سيختفي من قائمة الموظفين وشاشة الدخول. فواتيره وورديّاته السابقة تبقى محفوظة باسمه.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn py-2.5 text-sm bg-white text-choco border border-black/10"
            >
              تراجع
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="btn col-span-2 py-2.5 text-sm bg-red-600 text-white"
            >
              {pending ? "جاري الحذف…" : "نعم، احذف"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>}
    </div>
  );
}
