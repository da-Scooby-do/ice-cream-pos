import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getInventory } from "@/lib/queries";
import ManagerNav from "@/components/ManagerNav";
import { RestockRow } from "./Rows";

export const dynamic = "force-dynamic";

// المخزون | stock levels + restocking, manager only. Prices live in /products.
export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const inv = await getInventory();

  return (
    <>
      <ManagerNav current="inventory" />
      <main className="max-w-5xl mx-auto p-4 grid lg:grid-cols-2 gap-4">
        <Section title="النكهات" hint="أدخل الكمية بالجرام (مثال: 5000 = 5 كجم). القيم السالبة تخصم (تالف).">
          {inv.flavors.map((f) => (
            <RestockRow key={f.id} type="flavor" id={f.id} name={f.name_ar}
              stock={Number(f.stock_grams)} threshold={Number(f.low_stock_grams)} unit="gram" />
          ))}
        </Section>


        <Section title="الأكواب والكون والتعبئة" hint="بالحبة.">
          {inv.packaging.map((p) => (
            <RestockRow key={p.id} type="packaging" id={p.id} name={p.name_ar}
              stock={Number(p.stock_qty)} threshold={Number(p.low_stock_qty)} unit="piece" />
          ))}
        </Section>

        <Section title="الإضافات" hint="بعدد الحصص.">
          {inv.extras.map((x) => (
            <RestockRow key={x.id} type="extra" id={x.id} name={x.name_ar}
              stock={Number(x.stock_qty)} threshold={Number(x.low_stock_qty)} unit="portion" />
          ))}
        </Section>
      </main>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl shadow-sm p-5">
      <h2 className="font-extrabold text-choco">{title}</h2>
      <p className="text-xs text-choco/40 mb-3">{hint}</p>
      <ul className="divide-y divide-black/5">{children}</ul>
    </section>
  );
}
