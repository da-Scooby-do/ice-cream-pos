import {
  Boxes,
  FileText,
  IceCreamCone,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingBasket,
  Users,
  Wallet,
} from "lucide-react";
import { canAny, type Perm, type Role } from "./perms";

// صفحات البرنامج ومن يراها | the app's pages and who may open them.

type NavItem = { href: string; label: string; icon: typeof Boxes; perms: (Perm | "admin")[] };

export const NAV: NavItem[] = [
  { href: "/pos", label: "الكاشير", icon: ShoppingBasket, perms: ["sell"] },
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, perms: ["reports"] },
  { href: "/statements", label: "الكشوفات", icon: FileText, perms: ["reports"] },
  { href: "/sales", label: "المبيعات", icon: Receipt, perms: ["sales", "void"] },
  { href: "/money", label: "الإيرادات والمصروفات", icon: Wallet, perms: ["expenses"] },
  { href: "/inventory", label: "المخزون", icon: Boxes, perms: ["stock_add", "stock_edit", "products"] },
  { href: "/products", label: "الأصناف", icon: IceCreamCone, perms: ["products"] },
  { href: "/staff", label: "الموظفون", icon: Users, perms: ["admin"] },
  { href: "/settings", label: "الإعدادات", icon: Settings, perms: ["admin"] },
];

export function navFor(who: { role: Role; perms: Perm[] }) {
  return NAV.filter((n) => canAny(who, n.perms));
}

