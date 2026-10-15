// Heavy test: a full year of shop activity through the real business code,
// with an independent ledger kept here to check every report against.
import fs from "node:fs";
import path from "node:path";

// ---- fake clock -------------------------------------------------------------
let NOW = Date.parse("2025-10-01T06:00:00Z");
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a: unknown[]) {
    // @ts-expect-error spread
    if (a.length === 0) super(NOW);
    // @ts-expect-error spread
    else super(...a);
  }
  static now() {
    return NOW;
  }
}
(globalThis as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor;
const at = (localIso: string) => {
  NOW = RealDate.parse(localIso + "+02:00");
};

import { all, get, closeDb, db } from "@/lib/db/sqlite";
import { saveShop, getShop } from "@/lib/server/shop";
import { createStaff, findByPin, updateStaff } from "@/lib/server/staff";
import { saveStockItem, saveProduct, saveExtra, listProducts } from "@/lib/server/catalog";
import { openShift, closeShift, currentShift, drawerFor } from "@/lib/server/shifts";
import { createOrder, voidOrder, listOrders, receipt } from "@/lib/server/orders";
import { addEntry, voidEntry } from "@/lib/server/money";
import { restock, adjustStock, stockLevels } from "@/lib/server/stock";
import {
  totals,
  dayStatement,
  monthStatement,
  shiftStatement,
  dashboard,
  stockMonth,
  productSales,
} from "@/lib/server/reports";
import { makeBackup, restoreFromFile, listBackups, pruneList } from "@/lib/server/backup";
import { queueFullSync } from "@/lib/server/sync";
import { UserError } from "@/lib/server/errors";
import { addDays, localDate } from "@/lib/time";

// ---- helpers ----------------------------------------------------------------
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const r2 = (v: number) => Math.round(v * 100) / 100;
const failures: string[] = [];
let checks = 0;
function eq(label: string, got: unknown, want: unknown) {
  checks++;
  const a = typeof got === "number" ? r2(got) : got;
  const b = typeof want === "number" ? r2(want) : want;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    if (failures.length < 200) failures.push(`${label}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function expectFail(label: string, fn: () => unknown, msgPart?: string) {
  checks++;
  try {
    fn();
    failures.push(`${label}: expected an error, none thrown`);
  } catch (e) {
    if (!(e instanceof UserError)) failures.push(`${label}: non-user error ${(e as Error).message}`);
    else if (msgPart && !(e as Error).message.includes(msgPart))
      failures.push(`${label}: wrong message ${(e as Error).message}`);
  }
}
const timings: Record<string, number[]> = {};
function time<T>(label: string, fn: () => T): T {
  const t = performance.now();
  const out = fn();
  (timings[label] ??= []).push(performance.now() - t);
  return out;
}

async function main() {
  const DIR = process.env.POS_DATA_DIR!;
  const DAYS = Number(process.env.SIM_DAYS ?? 365);
  const START = "2025-10-01";

  // ---- setup ----------------------------------------------------------------
  at(`${START}T08:00:00`);
  saveShop({ name: "JAC ICE", phone: "0912345678", address: "الخرطوم", footer: "شكراً", scoop_grams: 60 });
  const admin = await createStaff({ name: "الأب", pin: "9876", role: "admin" });
  const ali = await createStaff({ name: "علي", pin: "1111", role: "staff", perms: ["sell", "void", "expenses", "stock_add"] });
  const omar = await createStaff({ name: "عمر", pin: "2222", role: "staff", perms: ["sell", "expenses"] });
  const viewer = await createStaff({ name: "مشرف", pin: "3333", role: "staff", perms: ["reports", "sales"] });
  try {
    await createStaff({ name: "آخر", pin: "1111", role: "staff" });
    failures.push("duplicate PIN accepted");
  } catch (e) {
    checks++;
    if (!(e instanceof UserError)) failures.push("duplicate PIN: wrong error");
  }
  eq("login by pin", (await findByPin("2222"))?.name, "عمر");
  eq("wrong pin", await findByPin("0000"), null);
  try {
    await updateStaff(admin.id, { id: admin.id, name: "الأب", role: "staff", perms: [], active: true });
    failures.push("last admin could be demoted");
  } catch {
    checks++;
  }

  // stock items + flavors
  const FLAVORS = ["فانيليا", "شوكولاتة", "فراولة", "مانجو", "كراميل", "فستق", "ليمون", "جوافة", "بلح", "كوكيز"];
  const flav: Record<string, string> = {};
  for (const [i, n] of FLAVORS.entries())
    flav[n] = saveStockItem(admin.id, { kind: "flavor", name: n, alert_qty: 3000, qty: 20000, sort: i, color: "#ff8800" }).id;
  const item = (name: string, unit: string, qty: number) =>
    saveStockItem(admin.id, { kind: "item", name, unit, alert_qty: 50, qty }).id;
  const cupS = item("كوب صغير", "pcs", 2000);
  const cupM = item("كوب وسط", "pcs", 2000);
  const cupL = item("كوب كبير", "pcs", 2000);
  const cone = item("بسكويت", "pcs", 2000);
  const spoon = item("ملعقة", "pcs", 5000);
  const milk = item("حليب", "ml", 50000);
  const straw = item("شفاط", "pcs", 3000);
  const sauce = item("صوص شوكولاتة", "g", 10000);
  const box = item("علبة كيلو", "pcs", 500);
  const itemIds = [...Object.values(flav), cupS, cupM, cupL, cone, spoon, milk, straw, sauce, box];

  expectFail("stock name clash", () => saveStockItem(admin.id, { kind: "flavor", name: "فانيليا", alert_qty: 0 }));

  // products
  const cup = saveProduct({
    name: "آيس كريم كوب",
    category: "آيس كريم",
    pricing: "size",
    sizes: [
      { name: "صغير", price: 1500, scoops: 1 },
      { name: "وسط", price: 2500, scoops: 2 },
      { name: "كبير", price: 3500, scoops: 3 },
    ],
    recipe: [],
  });
  const cs = Object.fromEntries(cup.sizes.map((s) => [s.name, s.id]));
  saveProduct({
    id: cup.id,
    name: "آيس كريم كوب",
    category: "آيس كريم",
    pricing: "size",
    sizes: cup.sizes.map((s) => ({ id: s.id, name: s.name, price: s.price, scoops: s.scoops })),
    recipe: [
      { size_id: cs["صغير"], stock_item_id: cupS, qty: 1 },
      { size_id: cs["وسط"], stock_item_id: cupM, qty: 1 },
      { size_id: cs["كبير"], stock_item_id: cupL, qty: 1 },
      { stock_item_id: spoon, qty: 1 },
    ],
  });
  const coneP = saveProduct({
    name: "آيس كريم بسكويت",
    category: "آيس كريم",
    pricing: "size",
    sizes: [
      { name: "بولة", price: 1200, scoops: 1 },
      { name: "بولتين", price: 2200, scoops: 2 },
    ],
    recipe: [{ stock_item_id: cone, qty: 1 }],
  });
  const shake = saveProduct({
    name: "ميلك شيك",
    category: "مشروبات",
    pricing: "size",
    scoop_grams: 80,
    sizes: [
      { name: "وسط", price: 3000, scoops: 2 },
      { name: "كبير", price: 4000, scoops: 3 },
    ],
    recipe: [],
  });
  const ss = Object.fromEntries(shake.sizes.map((s) => [s.name, s.id]));
  saveProduct({
    id: shake.id,
    name: "ميلك شيك",
    category: "مشروبات",
    pricing: "size",
    scoop_grams: 80,
    sizes: shake.sizes.map((s) => ({ id: s.id, name: s.name, price: s.price, scoops: s.scoops })),
    recipe: [
      { size_id: ss["وسط"], stock_item_id: milk, qty: 250 },
      { size_id: ss["كبير"], stock_item_id: milk, qty: 350 },
      { stock_item_id: straw, qty: 1 },
    ],
  });
  const kilo = saveProduct({
    name: "آيس كريم بالوزن",
    category: "آيس كريم",
    pricing: "weight",
    price_per_kg: 12000,
    max_flavors: 3,
    recipe: [{ stock_item_id: box, qty: 1 }],
  });
  const water = saveProduct({
    name: "مياه",
    category: "مشروبات",
    pricing: "size",
    sizes: [{ name: "عادي", price: 500, scoops: 0 }],
    recipe: [],
  });
  const sauceX = saveExtra({ name: "صوص إضافي", price: 500, stock_item_id: sauce, qty: 20 });
  const nutsX = saveExtra({ name: "مكسرات", price: 700 });
  expectFail("product name clash", () =>
    saveProduct({ name: "مياه", pricing: "size", sizes: [{ name: "x", price: 1, scoops: 0 }] })
  );
  expectFail("product w/o sizes", () => saveProduct({ name: "جديد", pricing: "size", sizes: [] }));

  // live price table, mirrored independently
  type P = { pid: string; sid: string | null; key: string; price: number; scoops: number; sg: number; recipe: [string, number][] };
  const products = listProducts();
  const P: P[] = [];
  const recipeFor = (pid: string, sid: string | null) =>
    all<{ stock_item_id: string; qty: number }>(
      "SELECT stock_item_id, qty FROM recipe_lines WHERE product_id = $p AND (size_id IS NULL OR size_id = $s)",
      { p: pid, s: sid ?? "" }
    ).map((r) => [r.stock_item_id, Number(r.qty)] as [string, number]);
  for (const p of products)
    for (const s of p.sizes)
      P.push({
        pid: p.id,
        sid: s.id,
        key: `${p.name}|${s.name}`,
        price: s.price,
        scoops: s.scoops,
        sg: p.scoop_grams ?? 60,
        recipe: recipeFor(p.id, s.id),
      });

  // ---- error paths before any shift ------------------------------------------
  expectFail("sale w/o shift", () =>
    createOrder(omar.id, { items: [{ product_id: water.id, size_id: P.find((x) => x.pid === water.id)!.sid }], payment: "cash", paid: null })
  );
  expectFail("bad shift kind", () => openShift(ali.id, { kind: "evening", opening_cash: 0 }));
  expectFail("negative opening", () => openShift(ali.id, { kind: "day", opening_cash: -5 }));

  // ---- independent ledger ----------------------------------------------------
  type Day = { cash: number; bank: number; orders: number; voids: number; inc: number; exp: number };
  const days = new Map<string, Day>();
  const D = (d: string) => {
    let x = days.get(d);
    if (!x) days.set(d, (x = { cash: 0, bank: 0, orders: 0, voids: 0, inc: 0, exp: 0 }));
    return x;
  };
  const prodQty = new Map<string, number>(); // month|key -> qty (non-voided)
  const stockExp = new Map<string, number>(); // item -> expected level
  for (const id of itemIds) stockExp.set(id, Number(get<{ qty: number }>("SELECT qty FROM stock_items WHERE id=$id", { id })!.qty));
  const used = (id: string, q: number) => stockExp.set(id, r2(stockExp.get(id)! + q));
  type O = { id: string; date: string; month: string; total: number; payment: string; shift: string; lines: { key: string; qty: number }[]; use: Map<string, number> };
  const shiftDrawer = new Map<string, number>();
  const closedExpected = new Map<string, number>();
  const shiftIds: string[] = [];
  let orderCount = 0;
  let voidCount = 0;

  const cashiers = [ali, omar];
  const flavorIds = Object.values(flav);
  const ymOf = (d: string) => d.slice(0, 7);

  function sell(shiftId: string, date: string, staff: { id: string }, localTs: string): O | null {
    at(localTs);
    const n = chance(0.7) ? 1 : chance(0.7) ? 2 : 3;
    const items: unknown[] = [];
    const lines: { key: string; qty: number }[] = [];
    const use = new Map<string, number>();
    const add = (id: string, q: number) => use.set(id, (use.get(id) ?? 0) + q);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const isKilo = chance(0.06);
      const qty = chance(0.85) ? 1 : 2;
      const extras: string[] = [];
      if (chance(0.15)) extras.push(sauceX.id);
      if (chance(0.08)) extras.push(nutsX.id);
      const extraPrice = (extras.includes(sauceX.id) ? 500 : 0) + (extras.includes(nutsX.id) ? 700 : 0);
      if (extras.includes(sauceX.id)) add(sauce, 20 * qty);
      if (isKilo) {
        const w = pick([250, 500, 750, 1000]);
        const fl = [...new Set([pick(flavorIds), pick(flavorIds), pick(flavorIds)])].slice(0, 1 + Math.floor(rnd() * 3));
        items.push({ product_id: kilo.id, weight_g: w, flavor_ids: fl, extra_ids: extras, qty });
        const unit = r2((12000 * w) / 1000 + extraPrice);
        total += r2(unit * qty);
        for (const f of fl) add(f, r2((w / fl.length) * qty));
        add(box, qty);
        lines.push({ key: "آيس كريم بالوزن|", qty });
      } else {
        const p = pick(P.filter((x) => x.price >= 0));
        const fl = p.scoops ? [...new Set(Array.from({ length: p.scoops }, () => pick(flavorIds)))] : [];
        items.push({ product_id: p.pid, size_id: p.sid, flavor_ids: fl, extra_ids: extras, qty });
        const unit = r2(p.price + extraPrice);
        total += r2(unit * qty);
        for (const f of fl) add(f, r2(((p.scoops * p.sg) / fl.length) * qty));
        for (const [sid, q] of p.recipe) add(sid, q * qty);
        lines.push({ key: p.key, qty });
      }
    }
    total = r2(total);
    const payment = chance(0.3) ? "bank" : "cash";
    const paid = payment === "cash" ? (chance(0.5) ? null : Math.ceil(total / 1000) * 1000 + (chance(0.3) ? 1000 : 0)) : null;
    const rc = time("createOrder", () => createOrder(staff.id, { items, payment, paid }));
    eq("receipt total", rc.total, total);
    if (payment === "cash") eq("change", rc.change, r2((paid ?? total) - total));
    const o: O = { id: rc.order_id, date, month: ymOf(date), total, payment, shift: shiftId, lines, use };
    const d = D(date);
    d.orders++;
    if (payment === "cash") {
      d.cash = r2(d.cash + total);
      shiftDrawer.set(shiftId, r2(shiftDrawer.get(shiftId)! + total));
    } else d.bank = r2(d.bank + total);
    for (const l of lines) prodQty.set(`${o.month}|${l.key}`, (prodQty.get(`${o.month}|${l.key}`) ?? 0) + l.qty);
    for (const [id, q] of use) used(id, -q);
    orderCount++;
    return o;
  }

  function undo(o: O, actor: { id: string; role: "admin" | "staff"; perms: string[] }, shiftOpen: boolean) {
    time("voidOrder", () => voidOrder(actor as never, o.id, "خطأ في الطلب"));
    const d = D(o.date);
    d.orders--;
    d.voids++;
    if (o.payment === "cash") {
      d.cash = r2(d.cash - o.total);
      if (shiftOpen || true) shiftDrawer.set(o.shift, r2(shiftDrawer.get(o.shift)! - o.total));
    } else d.bank = r2(d.bank - o.total);
    for (const l of o.lines) prodQty.set(`${o.month}|${l.key}`, prodQty.get(`${o.month}|${l.key}`)! - l.qty);
    for (const [id, q] of o.use) used(id, q);
    voidCount++;
  }

  function entry(staff: { id: string }, kind: "income" | "expense", category: string, amount: number, drawer: boolean, date: string, shiftId: string | null) {
    const e = time("addEntry", () => addEntry(staff.id, { kind, category, amount, note: null, drawer }));
    eq("entry date", e.business_date, date);
    const d = D(date);
    if (kind === "income") d.inc = r2(d.inc + amount);
    else d.exp = r2(d.exp + amount);
    if (shiftId && drawer) shiftDrawer.set(shiftId, r2(shiftDrawer.get(shiftId)! + (kind === "income" ? amount : -amount)));
    return { e, kind, amount, date, shiftId, drawer };
  }
  function unentry(x: ReturnType<typeof entry>, actor: { id: string; role: "admin" | "staff"; perms: string[] }) {
    voidEntry(actor as never, x.e.id);
    const d = D(x.date);
    if (x.kind === "income") d.inc = r2(d.inc - x.amount);
    else d.exp = r2(d.exp - x.amount);
    if (x.shiftId && x.drawer)
      shiftDrawer.set(x.shiftId, r2(shiftDrawer.get(x.shiftId)! - (x.kind === "income" ? x.amount : -x.amount)));
  }

  const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  function runShift(date: string, kind: "day" | "night", openLocal: string, startH: number, endH: number, nOrders: number) {
    const staff = pick(cashiers);
    at(openLocal);
    const opening = pick([0, 5000, 10000, 20000]);
    const sh = time("openShift", () => openShift(staff.id, { kind, opening_cash: opening }));
    eq(`shift date ${date} ${kind}`, sh.business_date, date);
    shiftIds.push(sh.id);
    shiftDrawer.set(sh.id, opening);
    expectFail("second open shift", () => openShift(omar.id, { kind: "day", opening_cash: 0 }), "مفتوحة");
    const span = (endH - startH) * 60;
    const mins = Array.from({ length: nOrders }, () => Math.floor(rnd() * span)).sort((a, b) => a - b);
    const sold: O[] = [];
    for (const m of mins) {
      const t = startH * 60 + m;
      const dd = t >= 24 * 60 ? addDays(date, 1) : date;
      const tt = t % (24 * 60);
      const o = sell(sh.id, date, staff, `${dd}T${hhmm(Math.floor(tt / 60), tt % 60)}`);
      if (o) sold.push(o);
      // void by Ali (has void) 2%
      if (o && chance(0.02)) undo(o, ali as never, true);
    }
    // omar cannot void
    const live = sold.filter((s) => !get<{ v: string | null }>("SELECT voided_at AS v FROM orders WHERE id=$id", { id: s.id })!.v);
    if (live.length) expectFail("void w/o permission", () => voidOrder(omar as never, live[live.length - 1].id, "x"), "صلاحية");
    // expenses during shift
    const endTs = `${startH + (endH - startH) >= 24 ? addDays(date, 1) : date}T${hhmm((endH) % 24, 0)}`;
    at(endTs);
    const ents: ReturnType<typeof entry>[] = [];
    if (chance(0.6)) ents.push(entry(staff, "expense", "ثلج وغاز", pick([2000, 3000, 4500]), true, date, sh.id));
    if (chance(0.15)) ents.push(entry(staff, "income", "طلبية خارجية", pick([5000, 12000]), chance(0.5), date, sh.id));
    if (chance(0.1)) ents.push(entry(staff, "expense", "نظافة", 1500, false, date, sh.id));
    if (ents.length && chance(0.1)) unentry(ents[0], staff as never);
    // restock if low
    for (const f of flavorIds)
      if (stockExp.get(f)! < 6000) {
        const cost = chance(0.5) ? 90000 : null;
        const dr = chance(0.3);
        restock(admin.id, { stock_item_id: f, qty: 20000, cost, note: null, drawer: dr });
        used(f, 20000);
        if (cost) {
          D(date).exp = r2(D(date).exp + cost);
          if (dr) shiftDrawer.set(sh.id, r2(shiftDrawer.get(sh.id)! - cost));
        }
      }
    for (const it of [cupS, cupM, cupL, cone, spoon, straw, box])
      if (stockExp.get(it)! < 300) {
        restock(ali.id, { stock_item_id: it, qty: 1000, cost: 20000, note: "كرتونة", drawer: false });
        used(it, 1000);
        D(date).exp = r2(D(date).exp + 20000);
      }
    for (const it of [milk, sauce])
      if (stockExp.get(it)! < 5000) {
        restock(admin.id, { stock_item_id: it, qty: 30000, cost: null, note: null, drawer: false });
        used(it, 30000);
      }
    // close
    const exp = drawerFor(sh.id);
    eq(`drawer ${date} ${kind}`, exp.expected, shiftDrawer.get(sh.id));
    closedExpected.set(sh.id, shiftDrawer.get(sh.id)!);
    const diff = pick([0, 0, 0, -500, 300]);
    at(endTs);
    time("closeShift", () => closeShift(staff.id, { shift_id: sh.id, counted_cash: Math.max(0, exp.expected + diff), note: diff ? "فرق" : null }));
    expectFail("close twice", () => closeShift(staff.id, { shift_id: sh.id, counted_cash: 0, note: null }));
    const st = time("shiftStatement", () => shiftStatement(sh.id))!;
    eq(`stmt drawer ${date}`, st.drawer.expected, shiftDrawer.get(sh.id));
    // staff can't void a closed shift's receipt
    if (sold.length) {
      const last = sold.filter((s) => !get<{ v: string | null }>("SELECT voided_at AS v FROM orders WHERE id=$id", { id: s.id })!.v).pop();
      if (last) expectFail("staff void closed", () => voidOrder(ali as never, last.id, "x"), "مقفولة");
      // admin voids the odd one after close (1%)
      if (last && chance(0.1)) undo(last, admin as never, false);
    }
    return sh.id;
  }

  // ---- simulate --------------------------------------------------------------
  const t0 = performance.now();
  let priceChanged = false;
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(START, i);
    const wd = new RealDate(date + "T00:00:00Z").getUTCDay(); // 5 = Friday
    const busy = wd === 5 || wd === 4 ? 1.6 : 1;
    const season = 1 + 0.5 * Math.sin(((i % 365) / 365) * 2 * Math.PI); // summer peak
    const base = Math.round(45 * busy * season);

    // mid-year price rise: كوب صغير 1500 -> 2000, remove "بولتين" size later
    if (!priceChanged && date >= "2026-04-01") {
      priceChanged = true;
      at(`${date}T07:00:00`);
      const cur = listProducts().find((p) => p.id === cup.id)!;
      saveProduct({
        id: cup.id,
        name: cur.name,
        category: cur.category,
        pricing: "size",
        sizes: cur.sizes.map((s) => ({ id: s.id, name: s.name, price: s.name === "صغير" ? 2000 : s.price, scoops: s.scoops })),
        recipe: [
          { size_id: cs["صغير"], stock_item_id: cupS, qty: 1 },
          { size_id: cs["وسط"], stock_item_id: cupM, qty: 1 },
          { size_id: cs["كبير"], stock_item_id: cupL, qty: 1 },
          { stock_item_id: spoon, qty: 1 },
        ],
      });
      P.find((x) => x.key === "آيس كريم كوب|صغير")!.price = 2000;
      // archive cone's 2-scoop size
      const c = listProducts().find((p) => p.id === coneP.id)!;
      saveProduct({
        id: coneP.id,
        name: c.name,
        category: c.category,
        pricing: "size",
        sizes: c.sizes.filter((s) => s.name !== "بولتين").map((s) => ({ id: s.id, name: s.name, price: s.price, scoops: s.scoops })),
        recipe: [{ stock_item_id: cone, qty: 1 }],
      });
      const gone = P.findIndex((x) => x.key === "آيس كريم بسكويت|بولتين");
      const goneSid = P[gone].sid;
      P.splice(gone, 1);
      at(`${date}T09:30:00`);
      // selling an archived size must fail (inside a shift)
      const tmp = openShift(admin.id, { kind: "day", opening_cash: 0 });
      expectFail("archived size", () => createOrder(admin.id, { items: [{ product_id: coneP.id, size_id: goneSid, flavor_ids: [flavorIds[0]] }], payment: "cash", paid: null }), "متوقف");
      expectFail("too many flavors", () => createOrder(admin.id, { items: [{ product_id: cup.id, size_id: cs["صغير"], flavor_ids: flavorIds.slice(0, 2) }], payment: "cash", paid: null }));
      expectFail("no flavor", () => createOrder(admin.id, { items: [{ product_id: cup.id, size_id: cs["صغير"], flavor_ids: [] }], payment: "cash", paid: null }));
      expectFail("paid < total", () => createOrder(admin.id, { items: [{ product_id: water.id, size_id: P.find((x) => x.pid === water.id)!.sid }], payment: "cash", paid: 100 }), "أقل");
      expectFail("empty order", () => createOrder(admin.id, { items: [], payment: "cash", paid: null }));
      expectFail("bad product", () => createOrder(admin.id, { items: [{ product_id: "nope", size_id: "x" }], payment: "cash", paid: null }));
      expectFail("bad weight", () => createOrder(admin.id, { items: [{ product_id: kilo.id, weight_g: 0, flavor_ids: [flavorIds[0]] }], payment: "cash", paid: null }));
      closeShift(admin.id, { shift_id: tmp.id, counted_cash: 0, note: null });
      shiftIds.push(tmp.id);
      shiftDrawer.set(tmp.id, 0);
      closedExpected.set(tmp.id, 0);
      D(date); // empty shift on this date
    }

    if (chance(0.03)) continue; // shop closed
    const twoShifts = chance(0.85);
    if (twoShifts) {
      runShift(date, "day", `${date}T09:00:00`, 9, 15, Math.round(base * 0.4));
      if (chance(0.05)) {
        // night shift opened after midnight → still belongs to `date`
        runShift(date, "night", `${addDays(date, 1)}T00:20:00`, 24, 26, Math.round(base * 0.1));
      } else runShift(date, "night", `${date}T16:00:00`, 16, 25, Math.round(base * 0.6));
    } else {
      runShift(date, "day", `${date}T10:00:00`, 10, 23, base);
    }

    // monthly: rent (no shift open), salaries, stock count + waste
    const next = addDays(date, 1);
    if (next.slice(8) === "01") {
      at(`${next}T08:00:00`); // before opening next day → business date = next
      // rent is recorded the morning of the 1st, outside any shift
      const r = entry(admin, "expense", "إيجار", 300000, true, next, null);
      eq("rent drawer flag", r.e.drawer, false);
      entry(admin, "expense", "رواتب", 450000, false, next, null);
      at(`${date}T23:59:00`);
      // month-end stock count on a couple of items
      for (const f of flavorIds.slice(0, 3)) {
        const target = Math.max(0, r2(stockExp.get(f)! - 150));
        adjustStock(admin.id, { stock_item_id: f, mode: "set", value: target, note: null });
        stockExp.set(f, target);
      }
      adjustStock(admin.id, { stock_item_id: cupS, mode: "waste", value: 5, note: "مكسور" });
      used(cupS, -5);
    }
  }
  const simMs = performance.now() - t0;

  // ---- verify ---------------------------------------------------------------
  console.log(`simulated ${DAYS} days: ${orderCount} sales, ${voidCount} voids, ${shiftIds.length} shifts in ${(simMs / 1000).toFixed(1)}s`);

  // per day
  for (const [date, d] of [...days.entries()].sort()) {
    const s = time("dayStatement", () => dayStatement(date));
    eq(`${date} orders`, s.totals.orders, d.orders);
    eq(`${date} voids`, s.totals.voids, d.voids);
    eq(`${date} cash`, s.totals.sales_cash, d.cash);
    eq(`${date} bank`, s.totals.sales_bank, d.bank);
    eq(`${date} other income`, s.totals.other_income, d.inc);
    eq(`${date} expenses`, s.totals.expenses, d.exp);
    eq(`${date} net`, s.totals.net, r2(d.cash + d.bank + d.inc - d.exp));
    eq(`${date} shift sum`, r2(s.shifts.reduce((a, x) => a + x.totals.sales, 0)), r2(d.cash + d.bank));
  }
  // per shift: stored expected_cash
  for (const id of shiftIds) {
    const row = get<{ expected_cash: number }>("SELECT expected_cash FROM shifts WHERE id=$id", { id })!;
    eq(`shift ${id.slice(0, 6)} expected stored`, Number(row.expected_cash), closedExpected.get(id));
    eq(`shift ${id.slice(0, 6)} live drawer`, drawerFor(id).expected, shiftDrawer.get(id));
  }
  // per month
  const months = [...new Set([...days.keys()].map(ymOf))].sort();
  let yearSales = 0;
  for (const ym of months) {
    const m = time("monthStatement", () => monthStatement(ym));
    const ds = [...days.entries()].filter(([k]) => k.startsWith(ym)).map(([, v]) => v);
    const sum = (f: (d: Day) => number) => r2(ds.reduce((a, d) => a + f(d), 0));
    eq(`${ym} orders`, m.totals.orders, sum((d) => d.orders));
    eq(`${ym} sales`, m.totals.sales, sum((d) => d.cash + d.bank));
    eq(`${ym} expenses`, m.totals.expenses, sum((d) => d.exp));
    eq(`${ym} net`, m.totals.net, sum((d) => d.cash + d.bank + d.inc - d.exp));
    eq(`${ym} days sum net`, r2(m.days.reduce((a, d) => a + d.net, 0)), m.totals.net);
    eq(`${ym} products revenue = sales`, r2(m.products.reduce((a, p) => a + p.revenue, 0)), m.totals.sales);
    yearSales += m.totals.sales;
    for (const p of m.products) eq(`${ym} qty ${p.product}|${p.size ?? ""}`, p.qty, prodQty.get(`${ym}|${p.product}|${p.size ?? ""}`) ?? 0);
    const listed = new Set(m.products.map((p) => `${p.product}|${p.size ?? ""}`));
    for (const [k, v] of prodQty) if (k.startsWith(ym + "|") && v > 0 && !listed.has(k.slice(8))) failures.push(`${ym} missing product ${k}`);
    // stock ledger
    const sm = time("stockMonth", () => stockMonth(ym));
    for (const it of sm.items) eq(`${ym} ${it.name} closing formula`, it.closing, r2(it.opening + it.restocked - it.sold + it.adjusted));
  }
  for (let i = 1; i < months.length; i++) {
    const a = stockMonth(months[i - 1]);
    const b = stockMonth(months[i]);
    for (const it of b.items) {
      const prev = a.items.find((x) => x.id === it.id);
      if (prev) eq(`${months[i]} ${it.name} opening = prev closing`, it.opening, prev.closing);
    }
  }
  const last = stockMonth(months[months.length - 1]);
  for (const lv of stockLevels()) {
    eq(`stock level ${lv.name}`, lv.qty, stockExp.get(lv.id));
    const l = last.items.find((x) => x.id === lv.id);
    eq(`stock ledger closing ${lv.name}`, l?.closing, r2(lv.qty));
    const sum = Number(get<{ s: number }>("SELECT ROUND(SUM(delta),2) AS s FROM stock_moves WHERE stock_item_id=$id", { id: lv.id })!.s);
    eq(`stock moves sum ${lv.name}`, sum, lv.qty);
  }

  // dashboard
  const from = START;
  const to = addDays(START, DAYS);
  const dash = time("dashboard(year)", () => dashboard(from, to));
  eq("dash orders", dash.totals.orders, orderCount - voidCount);
  eq("dash sales", dash.totals.sales, r2(yearSales));
  eq("dash by_hour sum", dash.by_hour.reduce((a, h) => a + h.orders, 0), orderCount - voidCount);
  eq("dash by_weekday sum", dash.by_weekday.reduce((a, h) => a + h.orders, 0), orderCount - voidCount);
  eq("dash by_day sum", r2(dash.by_day.reduce((a, h) => a + h.orders, 0)), orderCount - voidCount);
  const busiestDay = [...dash.by_weekday].sort((a, b) => b.orders - a.orders)[0];
  console.log("busiest weekday (0=Sun):", busiestDay.day, " busiest hour:", [...dash.by_hour].sort((a, b) => b.orders - a.orders)[0].hour);
  time("dashboard(month)", () => dashboard(addDays(to, -30), to));
  time("dashboard(today)", () => dashboard(addDays(to, -1), addDays(to, -1)));

  // listOrders pagination
  const lo = time("listOrders(year)", () => listOrders({ from, to, limit: 50 }));
  eq("listOrders count", lo.count, orderCount);
  eq("listOrders paid", lo.paid, orderCount - voidCount);
  const voided = listOrders({ from, to, status: "void", limit: 1000 });
  eq("void list", voided.count, voidCount);
  time("listOrders(page 300)", () => listOrders({ from, to, limit: 50, offset: 15000 }));

  // receipts keep old price
  const oldSmall = get<{ unit_price: number }>(
    "SELECT unit_price FROM order_items i JOIN orders o ON o.id=i.order_id WHERE size_name='صغير' AND product_name='آيس كريم كوب' AND o.business_date < '2026-04-01' AND i.extras='[]' LIMIT 1"
  );
  eq("old receipt keeps old price", Number(oldSmall?.unit_price), 1500);

  // integrity
  eq("foreign keys", all("PRAGMA foreign_key_check").length, 0);
  eq("integrity", Object.values(get<Record<string, string>>("PRAGMA integrity_check")!)[0], "ok");
  eq("one open shift max", Number(get<{ n: number }>("SELECT COUNT(*) n FROM shifts WHERE closed_at IS NULL")!.n), 0);
  eq("order numbers unique+contiguous", Number(get<{ n: number }>("SELECT MAX(number)-COUNT(*) n FROM orders")!.n), 0);

  // ---- backup / restore at scale ---------------------------------------------
  const sizeMB = fs.statSync(path.join(DIR, "pos.db")).size / 1e6;
  const tb = performance.now();
  const bp = makeBackup("manual");
  (timings["makeBackup(sync part)"] ??= []).push(performance.now() - tb);
  const b = await bp;
  (timings["makeBackup(total)"] ??= []).push(performance.now() - tb);
  console.log(`db ${sizeMB.toFixed(1)} MB, backup ${(b.size / 1e6).toFixed(1)} MB`);
  const before = {
    orders: Number(get<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n),
    sum: Number(get<{ s: number }>("SELECT ROUND(SUM(total),2) s FROM orders WHERE voided_at IS NULL")!.s),
  };
  // damage: add a junk sale, then restore
  at(`${to}T10:00:00`);
  const sh = openShift(admin.id, { kind: "day", opening_cash: 0 });
  createOrder(admin.id, { items: [{ product_id: water.id, size_id: P.find((x) => x.pid === water.id)!.sid }], payment: "cash", paid: null });
  const tr = performance.now();
  await restoreFromFile(b.file);
  (timings["restoreFromFile"] ??= []).push(performance.now() - tr);
  const after = {
    orders: Number(get<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n),
    sum: Number(get<{ s: number }>("SELECT ROUND(SUM(total),2) s FROM orders WHERE voided_at IS NULL")!.s),
  };
  eq("restore orders", after, before);
  eq("restore removed open shift", currentShift(), null);
  eq("backups listed", listBackups().length >= 2, true);
  const afail = async (label: string, p: () => Promise<unknown>) => {
    checks++;
    try { await p(); failures.push(`${label}: no error`); } catch (e) { if (!(e instanceof UserError)) failures.push(`${label}: ${(e as Error).message}`); }
  };
  await afail("restore missing", () => restoreFromFile(path.join(DIR, "not-a-db.db")));
  fs.writeFileSync(path.join(DIR, "junk.db"), "hello");
  await afail("restore junk file", () => restoreFromFile(path.join(DIR, "junk.db")));
  fs.writeFileSync(path.join(DIR, "junk.db.gz"), Buffer.from([0x1f, 0x8b, 1, 2, 3]));
  await afail("restore broken gz", () => restoreFromFile(path.join(DIR, "junk.db.gz")));
  // old uncompressed backup still restores
  db().exec(`VACUUM INTO '${path.join(DIR, "old-style.db")}'`);
  await restoreFromFile(path.join(DIR, "old-style.db"));
  eq("restore old .db", Number(get<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n), before.orders);
  eq("no temp files left", fs.readdirSync(DIR).filter((f) => f.includes("incoming") || f.includes(".tmp-")).length, 0);
  eq("no temp in backups", fs.readdirSync(path.join(DIR, "backups")).filter((f) => f.includes(".tmp-")).length, 0);
  // retention: 4 backups a day for 2 years
  const names: string[] = [];
  for (let i = 0; i < 730; i++) for (const h of ["03", "09", "15", "23"]) names.push(`jac-ice-${addDays("2024-10-01", i)}_${h}-00-00-auto.db.gz`);
  names.push("jac-ice-2023-01-01_10-00-00-manual.db", "something-else.db");
  const del = new Set(pruneList(names));
  const kept = names.filter((n) => !del.has(n) && n.startsWith("jac-ice-"));
  console.log(`retention: ${names.length} files → keep ${kept.length}`);
  eq("retention keeps newest", kept.includes(names[names.length - 3]), true);
  eq("retention bounded", kept.length <= 8 + 30 + 24, true);
  eq("retention never deletes foreign files", del.has("something-else.db"), false);
  void sh;

  // ---- cloud size estimate ---------------------------------------------------
  let bytes = 0;
  let rows = 0;
  for (const t of ["orders", "order_items", "stock_moves", "money_entries", "shifts"]) {
    for (const r of all(`SELECT * FROM ${t}`)) {
      bytes += JSON.stringify(r).length + 120; // + row/index overhead in Postgres
      rows++;
    }
  }
  queueFullSync();
  const outbox = Number(get<{ n: number }>("SELECT COUNT(*) n FROM sync_outbox")!.n);
  console.log(`cloud: ${rows} rows ≈ ${(bytes / 1e6).toFixed(0)} MB/yr (${((bytes / Math.max(1, orderCount)) / 1000).toFixed(1)} KB/sale); outbox ${outbox}`);

  // ---- timings ---------------------------------------------------------------
  const tt = Object.entries(timings).map(([k, v]) => {
    const s = [...v].sort((a, b) => a - b);
    return `${k.padEnd(20)} n=${String(v.length).padStart(6)} avg=${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}ms p99=${s[Math.floor(s.length * 0.99)].toFixed(2)}ms max=${s[s.length - 1].toFixed(1)}ms`;
  });
  console.log(tt.join("\n"));
  void totals;
  void productSales;
  void receipt;
  void getShop;
  void db;
  void closeDb;
  void localDate;
  void viewer;
  console.log(`\nchecks: ${checks}, failures: ${failures.length}`);
  for (const f of failures.slice(0, 60)) console.log("  ✗", f);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
