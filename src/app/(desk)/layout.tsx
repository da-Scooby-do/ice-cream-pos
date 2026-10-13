import { redirect } from "next/navigation";
import { PrintHost } from "@/components/PrintHost";
import Sidebar from "@/components/Sidebar";
import { IS_DESKTOP } from "@/lib/runtime";
import { needsSetup } from "@/lib/server/shop";
import { lowStock } from "@/lib/server/stock";
import { getSession } from "@/lib/session";

// إطار البرنامج على اللابتوب | the laptop app frame.
export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  if (!IS_DESKTOP) redirect("/m");
  if (needsSetup()) redirect("/setup");
  const s = await getSession();
  if (!s) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <Sidebar name={s.name} role={s.role} perms={s.perms} lowStock={lowStock().length} />
      <div className="flex-1 min-w-0">{children}</div>
      <PrintHost />
    </div>
  );
}
