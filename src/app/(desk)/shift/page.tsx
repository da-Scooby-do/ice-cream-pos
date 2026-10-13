import { redirect } from "next/navigation";
import { can } from "@/lib/perms";
import { totals } from "@/lib/server/reports";
import { currentShift, suggestKind } from "@/lib/server/shifts";
import { getSession } from "@/lib/session";
import { localDate } from "@/lib/time";
import OpenShiftForm from "./OpenShiftForm";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const s = await getSession();
  if (!can(s, "sell")) redirect("/");
  if (currentShift()) redirect("/pos");
  const today = localDate();
  return <OpenShiftForm name={s!.name} suggested={suggestKind()} today={totals({ from: today, to: today })} />;
}
