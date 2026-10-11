import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getCatalogAdmin, getSettings } from "@/lib/queries";
import ManagerNav from "@/components/ManagerNav";
import ProductsManager from "./ProductsManager";

export const dynamic = "force-dynamic";

// إدارة الأصناف | add & edit everything on the counter screen. Manager only.
export default async function ProductsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const [catalog, settings] = await Promise.all([getCatalogAdmin(), getSettings()]);

  return (
    <>
      <ManagerNav current="products" />
      <main className="max-w-5xl mx-auto p-4">
        <ProductsManager {...catalog} defaultScoopGrams={Number(settings.default_scoop_grams)} />
      </main>
    </>
  );
}
