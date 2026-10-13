"use client";

import { Pencil, Plus, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteStaffAction, saveStaffAction } from "@/actions/manage";
import { Page, PageHeader } from "@/components/Page";
import { ErrorNote, Field, Modal, SaveBar, Segmented, Toggle, useAction } from "@/components/ui";
import { PERMS, ROLE_LABEL, type Perm, type Role } from "@/lib/perms";
import type { StaffRow } from "@/lib/types";

const PRESETS: { label: string; perms: Perm[] }[] = [
  { label: "كاشير فقط", perms: ["sell"] },
  { label: "كاشير + مصروفات", perms: ["sell", "expenses"] },
  { label: "مشرف", perms: ["sell", "void", "sales", "reports", "expenses", "stock_add", "stock_edit"] },
];

export default function StaffManager({ staff, me }: { staff: StaffRow[]; me: string }) {
  const [edit, setEdit] = useState<StaffRow | "new" | null>(null);
  const [del, setDel] = useState<StaffRow | null>(null);
  return (
    <Page>
      <PageHeader
        title="الموظفون والصلاحيات"
        sub="المدير يتحكم في كل شيء. الموظف يرى ويعمل فقط ما تسمح له به."
        icon={<Users size={24} />}
        actions={
          <button type="button" onClick={() => setEdit("new")} className="btn-go px-4 py-2.5">
            <Plus size={18} /> مستخدم جديد
          </button>
        }
      />
      <div className="grid md:grid-cols-2 gap-3">
        {staff.map((u) => (
          <div key={u.id} className={`card p-5 ${u.active ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <span
                className={`w-11 h-11 rounded-2xl grid place-items-center ${u.role === "admin" ? "bg-ink text-lemon" : "bg-sky-50 text-sky-700"}`}
              >
                {u.role === "admin" ? <ShieldCheck size={22} /> : <UserRound size={22} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg leading-tight">
                  {u.name}
                  {u.id === me && <span className="text-xs text-ink-400 font-normal"> (أنت)</span>}
                </p>
                <p className="text-sm text-ink-500">
                  {ROLE_LABEL[u.role]}
                  {!u.active && <span className="chip bg-ink-100 text-ink-500 ms-2">موقوف</span>}
                </p>
              </div>
              <button type="button" onClick={() => setEdit(u)} className="btn-soft px-3 py-2 text-sm">
                <Pencil size={15} /> تعديل
              </button>
              {u.id !== me && (
                <button type="button" onClick={() => setDel(u)} className="btn bg-red-50 text-red-700 hover:bg-red-100 px-3 py-2 text-sm">
                  <Trash2 size={15} /> حذف
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {u.role === "admin" ? (
                <span className="chip bg-lemon-100 text-ink">كل الصلاحيات</span>
              ) : u.perms.length ? (
                PERMS.filter((p) => u.perms.includes(p.key)).map((p) => (
                  <span key={p.key} className="chip bg-sky-50 text-sky-800">
                    {p.label}
                  </span>
                ))
              ) : (
                <span className="chip bg-red-50 text-red-700">بدون صلاحيات</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {edit && <StaffEditor user={edit === "new" ? null : edit} me={me} onClose={() => setEdit(null)} />}
      {del && <DeleteDialog user={del} onClose={() => setDel(null)} />}
    </Page>
  );
}

function StaffEditor({ user, me, onClose }: { user: StaffRow | null; me: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "staff");
  const [pin, setPin] = useState("");
  const [perms, setPerms] = useState<Perm[]>(user?.perms ?? ["sell", "expenses"]);
  const [active, setActive] = useState(user?.active ?? true);
  const { pending, error, run } = useAction();
  const self = user?.id === me;
  const toggle = (p: Perm) => setPerms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  return (
    <Modal title={user ? `تعديل: ${user.name}` : "مستخدم جديد"} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveStaffAction({ id: user?.id, name, pin, role, perms, active }), () => {
            router.refresh();
            onClose();
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={user ? "رقم سري جديد" : "الرقم السري (4–8 أرقام)"} hint={user ? "اتركه فارغاً للإبقاء على القديم" : "يجب أن يكون مختلفاً عن أرقام الآخرين"}>
            <input
              className="input tnum text-center tracking-[0.4em]"
              type="password"
              inputMode="numeric"
              dir="ltr"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        {!self && (
          <div className="space-y-1.5">
            <span className="label">الدور</span>
            <div>
              <Segmented<Role>
                value={role}
                onChange={setRole}
                options={[
                  { value: "staff", label: "موظف (صلاحيات محددة)" },
                  { value: "admin", label: "مدير (كل الصلاحيات)" },
                ]}
              />
            </div>
          </div>
        )}

        {role === "staff" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="label">الصلاحيات</span>
              <div className="flex-1" />
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => setPerms(p.perms)} className="chip bg-lemon-100 hover:bg-lemon-200">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {PERMS.map((p) => (
                <Toggle key={p.key} checked={perms.includes(p.key)} onChange={() => toggle(p.key)} label={p.label} hint={p.hint} />
              ))}
            </div>
          </div>
        )}

        {user && !self && (
          <Toggle checked={active} onChange={setActive} label="الحساب نشط" hint="الحساب الموقوف لا يستطيع الدخول" />
        )}
        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} disabled={!user && pin.length < 4} />
      </form>
    </Modal>
  );
}

function DeleteDialog({ user, onClose }: { user: StaffRow; onClose: () => void }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <Modal title="حذف مستخدم" onClose={onClose}>
      <p>
        حذف <b>{user.name}</b>؟ لن يستطيع الدخول بعد الآن، وتبقى فواتيره القديمة باسمه.
      </p>
      <ErrorNote error={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="btn-soft py-3">
          تراجع
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => deleteStaffAction(user.id), () => {
              router.refresh();
              onClose();
            })
          }
          className="btn-danger py-3"
        >
          {pending ? "جاري الحذف…" : "حذف"}
        </button>
      </div>
    </Modal>
  );
}
