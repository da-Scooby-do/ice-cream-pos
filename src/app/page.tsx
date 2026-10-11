import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOpenShift } from "@/lib/queries";

// الصفحة الرئيسية توجّه كل شخص للمكان الصحيح
// Front door: the manager (dad, often on his phone) lands on reports;
// a cashier goes to open a shift, then straight to the counter.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "manager") redirect("/reports");

  const shift = await getOpenShift();
  redirect(shift ? "/pos" : "/shift");
}
