import Link from "next/link";
import { logoutAction } from "@/lib/actions";

// شريط المدير | manager nav, phone-friendly.
export default function ManagerNav({ current }: { current: "reports" | "products" | "inventory" }) {
  const tab = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={`btn px-4 py-2 text-sm ${
        current === key ? "bg-choco text-white" : "bg-white text-choco border border-black/10"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-b border-black/5 px-4 py-3 flex flex-wrap items-center gap-2">
      {tab("/reports", "التقارير", "reports")}
      {tab("/products", "الأصناف والأسعار", "products")}
      {tab("/inventory", "المخزون", "inventory")}
      <Link href="/pos" className="btn px-4 py-2 text-sm bg-berry text-white">
        شاشة الكاشير
      </Link>
      <div className="flex-1" />
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-choco/50 px-2">خروج</button>
      </form>
    </header>
  );
}
