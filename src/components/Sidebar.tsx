"use client";

import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/actions/auth";
import { changeOwnPinAction } from "@/actions/manage";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL, type Perm, type Role } from "@/lib/perms";
import { ErrorNote, Field, Modal, OkNote, useAction } from "./ui";

// الشريط الجانبي | the navigation rail. Big icons with their names under
// them, and only the pages this person is allowed to open.

export default function Sidebar({
  name,
  role,
  perms,
  lowStock,
}: {
  name: string;
  role: Role;
  perms: Perm[];
  lowStock: number;
}) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const items = navFor({ role, perms });

  return (
    <nav className="w-[92px] shrink-0 bg-ink-800 text-ink-200 flex flex-col items-center py-3 gap-1 h-dvh sticky top-0 z-30">
      <Link href="/" className="mb-2" aria-label="JAC ICE">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/badge.svg" alt="JAC ICE" className="w-14 h-14 drop-shadow" />
      </Link>

      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden px-2 space-y-1">
        {items.map((n) => {
          const active = path === n.href || path.startsWith(`${n.href}/`);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center transition ${
                active ? "bg-lemon text-ink" : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[11px] leading-tight font-semibold">{n.label}</span>
              {n.href === "/inventory" && lowStock > 0 && (
                <span className="absolute top-1.5 left-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center tnum">
                  {lowStock}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="relative w-full px-2">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="w-full flex flex-col items-center gap-1 rounded-2xl py-2 hover:bg-white/5"
        >
          <span className="w-9 h-9 rounded-full bg-sky text-ink font-bold grid place-items-center">
            {name.trim().charAt(0)}
          </span>
          <span className="text-[11px] font-semibold leading-tight line-clamp-1 max-w-full px-1">{name}</span>
        </button>
        {menu && (
          <div className="absolute bottom-0 right-full me-2 w-56 card p-2 text-ink animate-pop z-40">
            <p className="px-3 pt-2 pb-1 font-bold">{name}</p>
            <p className="px-3 pb-2 text-xs text-ink-400">{ROLE_LABEL[role]}</p>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setPinOpen(true);
              }}
              className="w-full btn-ghost justify-start px-3 py-2.5 text-sm"
            >
              <KeyRound size={16} /> تغيير رقمي السري
            </button>
            <form action={logoutAction}>
              <button type="submit" className="w-full btn-ghost justify-start px-3 py-2.5 text-sm text-red-700">
                <LogOut size={16} /> تسجيل الخروج
              </button>
            </form>
          </div>
        )}
      </div>
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
    </nav>
  );
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useAction();
  const pinInput = (v: string, set: (s: string) => void, auto?: boolean) => (
    <input
      type="password"
      inputMode="numeric"
      dir="ltr"
      autoFocus={auto}
      value={v}
      maxLength={8}
      onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      className="input tnum text-center tracking-[0.5em]"
    />
  );
  return (
    <Modal title="تغيير رقمي السري" onClose={onClose}>
      {done ? (
        <>
          <OkNote>تم تغيير الرقم السري ✓</OkNote>
          <button type="button" onClick={onClose} className="btn-dark w-full py-3">
            تم
          </button>
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeOwnPinAction(cur, next, again), () => setDone(true));
          }}
        >
          <Field label="الرقم السري الحالي">{pinInput(cur, setCur, true)}</Field>
          <Field label="الرقم السري الجديد (4 إلى 8 أرقام)">{pinInput(next, setNext)}</Field>
          <Field label="أعد كتابة الرقم الجديد">{pinInput(again, setAgain)}</Field>
          <ErrorNote error={error} />
          <button type="submit" disabled={pending} className="btn-go w-full py-3">
            {pending ? "جاري الحفظ…" : "حفظ"}
          </button>
        </form>
      )}
    </Modal>
  );
}
