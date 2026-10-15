import { redirect } from "next/navigation";
import BrandBackdrop from "@/components/BrandBackdrop";
import { IS_DESKTOP } from "@/lib/runtime";
import { getShop, needsSetup } from "@/lib/server/shop";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ none?: string }> }) {
  if (IS_DESKTOP && needsSetup()) redirect("/setup");
  // none=1: signed in, but the account has no permissions left — stay here
  // (redirecting to "/" again would loop) and let someone else sign in.
  const none = (await searchParams).none === "1";
  if (!none && (await getSession())) redirect("/");
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
        {none && (
          <p className="mb-3 text-center text-sm font-semibold text-red-700 bg-red-50 rounded-xl py-2.5 px-3">
            حسابك ليست له صلاحيات حالياً — اطلب من المدير تفعيلها
          </p>
        )}
        <LoginForm />
      </div>
    </BrandBackdrop>
  );
}
