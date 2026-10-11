import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStaffAdmin } from "@/lib/queries";
import ManagerNav from "@/components/ManagerNav";
import StaffManager from "./StaffManager";

export const dynamic = "force-dynamic";

// الموظفون | add & edit cashiers and managers. Manager only.
export default async function StaffPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const staff = await getStaffAdmin();

  return (
    <>
      <ManagerNav current="staff" />
      <main className="max-w-3xl mx-auto p-4">
        <StaffManager staff={staff} meId={session.staffId} />
      </main>
    </>
  );
}
