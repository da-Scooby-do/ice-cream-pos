import { redirect } from "next/navigation";
import { listStaff } from "@/lib/server/staff";
import { getSession } from "@/lib/session";
import StaffManager from "./StaffManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const s = await getSession();
  if (s?.role !== "admin") redirect("/");
  return <StaffManager staff={listStaff()} me={s.id} />;
}
