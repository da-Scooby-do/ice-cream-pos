// تسعير النكهات المميزة | premium-flavor pricing, shared by the till (live
// total) and the server (the real price), so the two can never disagree.
//
// A flavor may cost extra: `price_extra` per scoop (size products) and
// `price_extra_kg` per kilo (products sold by weight). The scoops — or the
// weight — are split evenly between the chosen flavors, exactly like the
// stock deduction, so 2 scoops of pistachio + vanilla pay one pistachio scoop.
import { round2 } from "./format";

export type PricedFlavor = { price_extra?: number | null; price_extra_kg?: number | null };

/** زيادة السعر لوحدة واحدة | the surcharge for ONE unit of the line */
export function flavorSurcharge(
  line: { pricing: "size" | "weight"; scoops: number; weight_g: number | null },
  flavors: PricedFlavor[]
): number {
  const n = flavors.length;
  if (!n) return 0;
  if (line.pricing === "size") {
    const share = line.scoops / n;
    return round2(flavors.reduce((s, f) => s + Number(f.price_extra ?? 0) * share, 0));
  }
  const kgEach = (line.weight_g ?? 0) / n / 1000;
  return round2(flavors.reduce((s, f) => s + Number(f.price_extra_kg ?? 0) * kgEach, 0));
}
