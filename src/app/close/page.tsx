import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOpenShift, getSettings, getShiftSummary } from "@/lib/queries";
import CloseShiftForm from "./CloseShiftForm";

export const dynamic = "force-dynamic";

// تقفيل الوردية | close the shift.
export default async function ClosePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const shift = await getOpenShift();
  if (!shift) redirect("/shift");

  const [summary, settings] = await Promise.all([
    getShiftSummary(shift.id),
    getSettings(),
  ]);

  return <CloseShiftForm shiftId={shift.id} live={summary} shopName={settings.shop_name} />;
}
