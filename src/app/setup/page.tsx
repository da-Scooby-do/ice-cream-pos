import { redirect } from "next/navigation";
import BrandBackdrop from "@/components/BrandBackdrop";
import { IS_DESKTOP } from "@/lib/runtime";
import { needsSetup } from "@/lib/server/shop";
import { DEFAULT_CLOUD_URL } from "@/lib/server/sync";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

// أول تشغيل: إنشاء المدير أو الاستعادة | first run: create the admin, or restore
export default async function SetupPage() {
  if (!IS_DESKTOP) redirect("/m");
  if (!needsSetup()) redirect("/login");
  return (
    <BrandBackdrop>
      <SetupForm defaultCloudUrl={DEFAULT_CLOUD_URL} />
    </BrandBackdrop>
  );
}
