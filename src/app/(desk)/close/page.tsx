import { redirect } from "next/navigation";
import { can } from "@/lib/perms";
import { usedCategories } from "@/lib/server/money";
import { shiftStatement } from "@/lib/server/reports";
import { currentShift } from "@/lib/server/shifts";
import { getSession } from "@/lib/session";
import CloseShift from "./CloseShift";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const s = await getSession();
  if (!can(s, "sell")) redirect("/");
  const shift = currentShift();
  if (!shift) redirect("/shift");
  return (
    <CloseShift
      live={shiftStatement(shift.id)!}
      canExpense={can(s, "expenses")}
      canVoidEntries={can(s, "expenses")}
      expenseCategories={usedCategories("expense")}
    />
  );
}
