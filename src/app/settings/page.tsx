import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/queries";
import ManagerNav from "@/components/ManagerNav";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

// الإعدادات | shop name, contact details and receipt footer. Manager only.
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "manager") redirect("/pos");

  const s = await getSettings();

  return (
    <>
      <ManagerNav current="settings" />
      <main className="max-w-4xl mx-auto p-4">
        <SettingsForm
          initial={{
            shop_name: s.shop_name ?? "",
            phone: s.phone ?? "",
            address: s.address ?? "",
            receipt_footer: s.receipt_footer ?? "",
          }}
        />
      </main>
    </>
  );
}
