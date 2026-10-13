import { redirect } from "next/navigation";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { can } from "@/lib/perms";
import { listExtras, listProducts, listStockItems } from "@/lib/server/catalog";
import { categories, getShop } from "@/lib/server/shop";
import { getSession } from "@/lib/session";
import ProductsManager from "./ProductsManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await getSession();
  if (!can(s, "products")) redirect("/");
  const { tab } = await searchParams;
  const used = categories();
  return (
    <ProductsManager
      initialTab={tab}
      products={listProducts()}
      items={listStockItems()}
      extras={listExtras()}
      categories={[...new Set([...PRODUCT_CATEGORIES, ...used])]}
      scoopGrams={getShop().scoop_grams}
    />
  );
}
