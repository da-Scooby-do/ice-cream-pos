import Link from "next/link";
import { DayView } from "@/components/views";
import { getSnapshot, listSnapshotKeys } from "@/lib/cloud/store";
import { localDate } from "@/lib/time";
import type { DayStatement } from "@/lib/types";

export const dynamic = "force-dynamic";

// اليوم | today at a glance (or the last day the laptop reported).
export default async function PhoneToday() {
  const today = localDate();
  let snap = await getSnapshot<DayStatement>(`day:${today}`);
  let fallback = false;
  if (!snap) {
    const last = (await listSnapshotKeys("day:"))[0];
    if (last) {
      snap = await getSnapshot<DayStatement>(last);
      fallback = true;
    }
  }
  if (!snap) {
    return (
      <div className="card p-6 text-center space-y-2">
        <p className="font-bold">لا توجد تقارير بعد</p>
        <p className="text-sm text-ink-500">
          اربط برنامج المحل بالسحابة من «الإعدادات ← النسخة السحابية» على اللابتوب، وستظهر التقارير هنا.
        </p>
      </div>
    );
  }
  return (
    <>
      {fallback && (
        <p className="text-sm bg-lemon-50 ring-1 ring-lemon-200 rounded-2xl px-4 py-3">
          لا توجد مبيعات اليوم بعد — هذا آخر يوم مسجل.
        </p>
      )}
      <DayView d={snap.data} />
      <Link href="/m/statements" className="btn-soft w-full py-3">
        كل الأيام والأشهر
      </Link>
    </>
  );
}
