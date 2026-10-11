import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getOpenShift } from "@/lib/queries";
import OpenShiftForm from "./OpenShiftForm";

// بداية الوردية | shift start: who is on, and what is in the drawer.
export default async function ShiftPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");

  if (await getOpenShift()) redirect("/pos");

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-center text-choco">فتح الوردية</h1>
        <p className="text-center text-choco/60 mb-6">
          أهلاً {session.name} — أدخل النقدية الموجودة في الدرج الآن
        </p>
        <OpenShiftForm />
      </div>
    </main>
  );
}
