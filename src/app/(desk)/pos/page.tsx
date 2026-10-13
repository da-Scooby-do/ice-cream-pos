import { redirect } from "next/navigation";
import { can } from "@/lib/perms";
import { posCatalog } from "@/lib/server/catalog";
import { usedCategories } from "@/lib/server/money";
import { getShop } from "@/lib/server/shop";
import { currentShift } from "@/lib/server/shifts";
import { lowStock } from "@/lib/server/stock";
import { getSession } from "@/lib/session";
import PosScreen from "./PosScreen";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const s = await getSession();
  if (!can(s, "sell")) redirect("/");
  const shift = currentShift();
  if (!shift) redirect("/shift");

  return (
    <PosScreen
      catalog={posCatalog()}
      shop={getShop()}
      shift={shift}
      lowStock={lowStock()}
      canExpense={can(s, "expenses")}
      canProducts={can(s, "products")}
      expenseCategories={usedCategories("expense")}
    />
  );
}
