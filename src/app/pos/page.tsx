import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOpenShift, getPosCatalog } from "@/lib/queries";
import PosScreen from "./PosScreen";

// شاشة الكاشير | the counter screen.
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const shift = await getOpenShift();
  if (!shift) redirect("/shift");

  const catalog = await getPosCatalog();

  return (
    <PosScreen
      flavors={catalog.flavors}
      variants={catalog.variants}
      extras={catalog.extras}
      settings={catalog.settings}
      lowStock={catalog.lowStock}
      cashier={session.name}
      role={session.role}
    />
  );
}
