import Link from "next/link";
import DashboardView from "@/components/DashboardView";
import { getSnapshot } from "@/lib/cloud/store";
import type { Dashboard } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "today", label: "اليوم" },
  { key: "7d", label: "7 أيام" },
  { key: "30d", label: "30 يوماً" },
  { key: "month", label: "هذا الشهر" },
] as const;

export default async function PhoneDashboard({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const period = PERIODS.find((x) => x.key === p)?.key ?? "30d";
  const snap = await getSnapshot<Dashboard>(`dash:${period}`);
  return (
    <>
      <div className="inline-flex rounded-2xl bg-ink-100/70 p-1 gap-1">
        {PERIODS.map((x) => (
          <Link
            key={x.key}
            href={`/m/dashboard?p=${x.key}`}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${period === x.key ? "bg-white shadow-sm" : "text-ink-500"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {snap ? <DashboardView d={snap.data} /> : <p className="card p-6 text-center text-ink-500">لا توجد بيانات بعد</p>}
    </>
  );
}
