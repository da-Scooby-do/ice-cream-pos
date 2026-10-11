import { redirect } from "next/navigation";
import { getStaff, getSettings } from "@/lib/queries";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  const [staff, settings] = await Promise.all([getStaff(), getSettings()]);

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-extrabold text-center text-choco mb-1">
          {settings.shop_name}
        </h1>
        <p className="text-center text-choco/60 mb-8">تسجيل دخول الكاشير</p>
        <LoginForm staff={staff} />
      </div>
    </main>
  );
}
