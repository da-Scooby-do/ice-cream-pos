import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import { Page, PageHeader } from "@/components/Page";
import RangePicker from "@/components/RangePicker";
import { can } from "@/lib/perms";
import { resolveRange } from "@/lib/ranges";
import { dashboard } from "@/lib/server/reports";
import { getSession } from "@/lib/session";
import { shortDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const s = await getSession();
  if (!can(s, "reports")) redirect("/");
  const r = resolveRange(await searchParams, "30d");
  return (
    <Page wide>
      <PageHeader
        title="لوحة التحكم"
        sub={r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} — ${shortDate(r.to)}`}
        icon={<LayoutDashboard size={24} />}
      />
      <RangePicker value={r.key} from={r.from} to={r.to} />
      <DashboardView d={dashboard(r.from, r.to)} />
    </Page>
  );
}
