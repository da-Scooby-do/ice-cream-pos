import { redirect } from "next/navigation";
import BrandBackdrop from "@/components/BrandBackdrop";
import { IS_DESKTOP } from "@/lib/runtime";
import { getShop, needsSetup } from "@/lib/server/shop";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (IS_DESKTOP && needsSetup()) redirect("/setup");
  if (await getSession()) redirect("/");
  const shopName = IS_DESKTOP ? getShop().name : "JAC ICE";

  return (
    <BrandBackdrop>
      <div className="w-full max-w-sm animate-rise">
        <div className="text-center mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/badge.svg" alt="" className="w-28 h-28 mx-auto drop-shadow-xl" />
          <h1 className="mt-3 text-2xl font-bold text-ink">{shopName}</h1>
          <p className="text-sm text-ink/70 mt-0.5">
            {IS_DESKTOP ? "أدخل رقمك السري" : "تقارير المحل — أدخل رقمك السري"}
          </p>
        </div>
        <LoginForm />
      </div>
    </BrandBackdrop>
  );
}
