import { Boxes, FileText, Home, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { getSnapshot } from "@/lib/cloud/store";
import { can } from "@/lib/perms";
import { IS_DESKTOP } from "@/lib/runtime";
import { getSession } from "@/lib/session";
import { clock, stamp } from "@/lib/time";
import { SHIFT_LABEL, type ShiftKind, type Shop } from "@/lib/types";

// تقارير الجوال | the owner's phone view (read-only, from the cloud copy).
export const dynamic = "force-dynamic";

export type Meta = {
  shop: Shop;
  synced_at: string;
  app_version: string;
  open_shift: { kind: ShiftKind; opened_at: string; opened_by: string } | null;
};

export default async function PhoneLayout({ children }: { children: React.ReactNode }) {
  if (IS_DESKTOP) redirect("/");
  const s = await getSession();
  if (!s || !can(s, "reports")) redirect("/login");
  const meta = (await getSnapshot<Meta>("meta"))?.data ?? null;
  const stale = meta ? Date.now() - Date.parse(meta.synced_at) > 15 * 60_000 : true;

  return (
    <div className="min-h-dvh pb-24">
      <header className="bg-sky px-4 pt-4 pb-5 rounded-b-[2rem] shadow-card">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/badge.svg" alt="" className="w-12 h-12 drop-shadow" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg leading-tight text-ink">{meta?.shop.name ?? "JAC ICE"}</p>
            <p className="text-xs text-ink/70">
              {meta ? `آخر تحديث من المحل: ${stamp(meta.synced_at)}` : "لم يتصل اللابتوب بالسحابة بعد"}
            </p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn bg-white/40 w-10 h-10 rounded-2xl" aria-label="خروج">
              <LogOut size={18} />
            </button>
          </form>
        </div>
        <div className="max-w-3xl mx-auto mt-3 flex flex-wrap gap-2 text-xs">
          {meta?.open_shift ? (
            <span className="chip bg-white text-ink">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> {SHIFT_LABEL[meta.open_shift.kind]} مفتوحة منذ{" "}
              {clock(meta.open_shift.opened_at)} · {meta.open_shift.opened_by}
            </span>
          ) : (
            <span className="chip bg-white/70 text-ink">لا توجد وردية مفتوحة</span>
          )}
          {stale && meta && <span className="chip bg-lemon text-ink">اللابتوب غير متصل بالإنترنت الآن — البيانات حتى آخر تحديث</span>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-ink-800 text-ink-200 pb-[env(safe-area-inset-bottom)] z-30">
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {[
            { href: "/m", label: "اليوم", Icon: Home },
            { href: "/m/dashboard", label: "لوحة التحكم", Icon: LayoutDashboard },
            { href: "/m/statements", label: "الكشوفات", Icon: FileText },
            { href: "/m/stock", label: "المخزون", Icon: Boxes },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold hover:text-white">
              <Icon size={22} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
