import { redirect } from "next/navigation";
import { navFor } from "@/lib/nav";
import { IS_DESKTOP } from "@/lib/runtime";
import { needsSetup } from "@/lib/server/shop";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// البداية: كل شخص إلى أول صفحة مسموحة له | send everyone to their first page
export default async function Home() {
  if (!IS_DESKTOP) redirect("/m");
  if (needsSetup()) redirect("/setup");
  const s = await getSession();
  if (!s) redirect("/login");
  const first = navFor(s)[0];
  redirect(first?.href ?? "/login");
}
