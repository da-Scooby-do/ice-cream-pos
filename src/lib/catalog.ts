// أنواع الأصناف كما تظهر للناس | product types as people see them.
// The database stores kind (scoop / cup / weight / cone) plus a category;
// a milkshake is a 'cup' in the 'shake' category. Everything the screens
// show goes through productType() so the two never drift apart.
import type { VariantCategory, VariantKind } from "./types";

export type ProductType = VariantKind | "shake";

export const PRODUCT_TYPES: ProductType[] = ["scoop", "cup", "weight", "cone", "shake"];

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  scoop: "بالسكوب",
  cup: "أكواب جاهزة",
  weight: "بالوزن",
  cone: "كون وبسكويت",
  shake: "ميلك شيك",
};

// لون الشريط الجانبي لكل نوع على شاشة الكاشير | stripe colour per type
export const PRODUCT_TYPE_ACCENT: Record<ProductType, string> = {
  scoop: "border-s-berry",
  cup: "border-s-mint",
  weight: "border-s-amber-500",
  cone: "border-s-choco",
  shake: "border-s-sky-500",
};

export function productType(v: { kind: VariantKind; category?: VariantCategory | null }): ProductType {
  return v.category === "shake" ? "shake" : v.kind;
}

/** النوع → ما يُحفظ في قاعدة البيانات | a picked type → stored kind + category */
export function toKindAndCategory(t: ProductType): { kind: VariantKind; category: VariantCategory } {
  return t === "shake" ? { kind: "cup", category: "shake" } : { kind: t, category: "icecream" };
}
