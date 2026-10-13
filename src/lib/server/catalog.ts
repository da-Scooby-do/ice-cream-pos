import { localDate } from "../time";
import { all, get, nowIso, run, tx, uid } from "../db/sqlite";
import type { Unit } from "../format";
import type { Extra, PosCatalog, Product, RecipeLine, Size, StockItem } from "../types";
import { amount, fail, oneOf, optText, text } from "./errors";

// الأصناف والنكهات والإضافات | the catalog. The shop starts empty and the
// admin builds it: stock items (flavors, cups, cones, milk…), then products
// with sizes and what each sale uses, then extras.

type RawItem = Omit<StockItem, "active"> & { active: number };
type RawProduct = Omit<Product, "active" | "sizes" | "recipe"> & { active: number };
type RawSize = Omit<Size, "active"> & { active: number; product_id: string };
type RawRecipe = RecipeLine & { product_id: string };
type RawExtra = Omit<Extra, "active"> & { active: number };

const COLOR = /^#[0-9a-f]{6}$/i;

export function listStockItems(opts: { activeOnly?: boolean } = {}): StockItem[] {
  return all<RawItem>(
    `SELECT id, name, kind, unit, qty, alert_qty, color, active, sort FROM stock_items
     ${opts.activeOnly ? "WHERE active = 1" : ""}
     ORDER BY kind = 'flavor' DESC, active DESC, sort, name`
  ).map((r) => ({ ...r, qty: Number(r.qty), alert_qty: Number(r.alert_qty), active: !!r.active }));
}

export function listProducts(opts: { activeOnly?: boolean } = {}): Product[] {
  const products = all<RawProduct>(
    `SELECT id, name, category, pricing, price_per_kg, max_flavors, scoop_grams, color, active, sort
     FROM products ${opts.activeOnly ? "WHERE active = 1" : ""} ORDER BY active DESC, sort, name`
  );
  const sizes = all<RawSize>(
    `SELECT id, product_id, name, price, scoops, active, sort FROM product_sizes
     WHERE active = 1 ORDER BY sort, price`
  );
  const recipe = all<RawRecipe>("SELECT product_id, size_id, stock_item_id, qty FROM recipe_lines");
  return products.map((p) => ({
    ...p,
    active: !!p.active,
    price_per_kg: p.price_per_kg == null ? null : Number(p.price_per_kg),
    scoop_grams: p.scoop_grams == null ? null : Number(p.scoop_grams),
    sizes: sizes
      .filter((s) => s.product_id === p.id)
      .map(({ product_id: _p, ...s }) => ({ ...s, price: Number(s.price), active: !!s.active })),
    recipe: recipe
      .filter((r) => r.product_id === p.id)
      .map(({ product_id: _p, ...r }) => ({ ...r, qty: Number(r.qty) })),
  }));
}

export function listExtras(opts: { activeOnly?: boolean } = {}): Extra[] {
  return all<RawExtra>(
    `SELECT id, name, price, stock_item_id, qty, active, sort FROM extras
     ${opts.activeOnly ? "WHERE active = 1" : ""} ORDER BY active DESC, sort, name`
  ).map((r) => ({ ...r, price: Number(r.price), qty: Number(r.qty), active: !!r.active }));
}

export function posCatalog(): PosCatalog {
  return {
    products: listProducts({ activeOnly: true }).filter((p) => p.pricing === "weight" || p.sizes.length > 0),
    flavors: listStockItems({ activeOnly: true }).filter((i) => i.kind === "flavor"),
    extras: listExtras({ activeOnly: true }),
  };
}

function stockItemExists(id: string) {
  return !!get("SELECT 1 AS x FROM stock_items WHERE id = $id", { id });
}

// --- مواد المخزون والنكهات | stock items & flavors ---------------------------

export function saveStockItem(
  staffId: string,
  input: Record<string, unknown>
): StockItem {
  const kind = oneOf(input.kind, ["flavor", "item"] as const, "النوع");
  const name = text(input.name, kind === "flavor" ? "اسم النكهة" : "اسم المادة", { max: 40 });
  const unit: Unit = kind === "flavor" ? "g" : oneOf(input.unit, ["g", "ml", "pcs"] as const, "الوحدة");
  const alert_qty = amount(input.alert_qty, "حد التنبيه", { min: 0 });
  const color = typeof input.color === "string" && COLOR.test(input.color) ? input.color : null;
  const active = input.active !== false;
  const sort = Math.round(amount(input.sort ?? 0, "الترتيب", { min: -1000, max: 1000 }));
  const now = nowIso();

  return tx(() => {
    const clash = get<{ id: string }>(
      "SELECT id FROM stock_items WHERE name = $name AND kind = $kind AND id <> $id",
      { name, kind, id: typeof input.id === "string" ? input.id : "" }
    );
    if (clash) fail("يوجد عنصر بنفس الاسم");

    if (typeof input.id === "string" && input.id) {
      const cur = get<{ unit: Unit }>("SELECT unit FROM stock_items WHERE id = $id", { id: input.id });
      if (!cur) fail("العنصر غير موجود");
      if (cur.unit !== unit) {
        const used = get("SELECT 1 AS x FROM stock_moves WHERE stock_item_id = $id LIMIT 1", { id: input.id });
        if (used) fail("لا يمكن تغيير الوحدة بعد استخدام العنصر — أضف عنصراً جديداً بدلاً منه");
      }
      run(
        `UPDATE stock_items SET name = $name, unit = $unit, alert_qty = $alert_qty, color = $color,
           active = $active, sort = $sort, updated_at = $now WHERE id = $id`,
        { id: input.id, name, unit, alert_qty, color, active, sort, now }
      );
      return listStockItems().find((i) => i.id === input.id)!;
    }

    const id = uid();
    const opening = amount(input.qty ?? 0, "الكمية الحالية", { min: 0 });
    run(
      `INSERT INTO stock_items (id, name, kind, unit, qty, alert_qty, color, active, sort, created_at, updated_at)
       VALUES ($id, $name, $kind, $unit, $qty, $alert_qty, $color, $active, $sort, $now, $now)`,
      { id, name, kind, unit, qty: opening, alert_qty, color, active, sort, now }
    );
    if (opening > 0) {
      run(
        `INSERT INTO stock_moves (id, stock_item_id, delta, reason, note, staff_id, business_date, created_at, updated_at)
         VALUES ($mid, $id, $qty, 'adjust', 'رصيد أول المدة', $staff, $date, $now, $now)`,
        { mid: uid(), id, qty: opening, staff: staffId, date: localDate(), now }
      );
    }
    return listStockItems().find((i) => i.id === id)!;
  });
}

// --- الأصناف | products ------------------------------------------------------

type SizeInput = { id?: unknown; name?: unknown; price?: unknown; scoops?: unknown };
type RecipeInput = { size_id?: unknown; stock_item_id?: unknown; qty?: unknown };

export function saveProduct(input: Record<string, unknown>): Product {
  const name = text(input.name, "اسم الصنف", { max: 50 });
  const category = text(input.category ?? "", "الفئة", { max: 30, required: false });
  const pricing = oneOf(input.pricing, ["size", "weight"] as const, "طريقة التسعير");
  const color = typeof input.color === "string" && COLOR.test(input.color) ? input.color : null;
  const active = input.active !== false;
  const sort = Math.round(amount(input.sort ?? 0, "الترتيب", { min: -1000, max: 1000 }));
  const scoop_grams =
    input.scoop_grams === null || input.scoop_grams === "" || input.scoop_grams === undefined
      ? null
      : amount(input.scoop_grams, "وزن البولة", { min: 1, max: 2000, allowZero: false });

  let price_per_kg: number | null = null;
  let max_flavors = 0;
  if (pricing === "weight") {
    price_per_kg = amount(input.price_per_kg, "سعر الكيلو", { min: 0, allowZero: false });
    max_flavors = Math.round(amount(input.max_flavors ?? 3, "عدد النكهات", { min: 0, max: 8 }));
  }

  const productId = typeof input.id === "string" && input.id ? input.id : uid();
  const isNew = !(typeof input.id === "string" && input.id);

  // الأحجام | sizes (weight products have none)
  const rawSizes = pricing === "size" ? ((Array.isArray(input.sizes) ? input.sizes : []) as SizeInput[]) : [];
  if (pricing === "size" && rawSizes.length === 0) fail("أضف حجماً واحداً على الأقل مع سعره");
  if (rawSizes.length > 12) fail("الحد 12 حجماً للصنف");
  const seen = new Set<string>();
  const sizes = rawSizes.map((s, i) => {
    const sName = text(s.name, `اسم الحجم ${i + 1}`, { max: 30 });
    if (seen.has(sName)) fail(`الحجم «${sName}» مكرر`);
    seen.add(sName);
    const sid = typeof s.id === "string" && /^[0-9a-f-]{36}$/i.test(s.id) ? s.id : uid();
    return {
      id: sid,
      name: sName,
      price: amount(s.price, `سعر «${sName}»`, { min: 0 }),
      scoops: Math.round(amount(s.scoops ?? 0, `عدد البولات لـ«${sName}»`, { min: 0, max: 10 })),
      sort: i,
    };
  });
  const sizeIds = new Set(sizes.map((s) => s.id));

  // ما يستهلكه البيع | what each sale uses
  const rawRecipe = (Array.isArray(input.recipe) ? input.recipe : []) as RecipeInput[];
  if (rawRecipe.length > 60) fail("عدد مواد الاستهلاك كبير جداً");
  const recipe = rawRecipe.map((r) => {
    const sizeId = typeof r.size_id === "string" && r.size_id ? r.size_id : null;
    if (sizeId && !sizeIds.has(sizeId)) fail("مادة استهلاك مرتبطة بحجم غير موجود");
    if (typeof r.stock_item_id !== "string" || !stockItemExists(r.stock_item_id)) fail("اختر مادة المخزون");
    return {
      size_id: sizeId,
      stock_item_id: r.stock_item_id as string,
      qty: amount(r.qty, "الكمية المستهلكة", { min: 0, allowZero: false, max: 100000 }),
    };
  });

  const now = nowIso();
  tx(() => {
    const clash = get<{ id: string }>("SELECT id FROM products WHERE name = $name AND id <> $id", {
      name,
      id: productId,
    });
    if (clash) fail("يوجد صنف بنفس الاسم");

    if (isNew) {
      run(
        `INSERT INTO products (id, name, category, pricing, price_per_kg, max_flavors, scoop_grams, color, active, sort, created_at, updated_at)
         VALUES ($id, $name, $category, $pricing, $price_per_kg, $max_flavors, $scoop_grams, $color, $active, $sort, $now, $now)`,
        { id: productId, name, category, pricing, price_per_kg, max_flavors, scoop_grams, color, active, sort, now }
      );
    } else {
      const cur = get<{ pricing: string }>("SELECT pricing FROM products WHERE id = $id", { id: productId });
      if (!cur) fail("الصنف غير موجود");
      run(
        `UPDATE products SET name = $name, category = $category, pricing = $pricing, price_per_kg = $price_per_kg,
           max_flavors = $max_flavors, scoop_grams = $scoop_grams, color = $color, active = $active, sort = $sort,
           updated_at = $now
         WHERE id = $id`,
        { id: productId, name, category, pricing, price_per_kg, max_flavors, scoop_grams, color, active, sort, now }
      );
    }

    // الأحجام: تحديث الموجود، إضافة الجديد، أرشفة المحذوف
    const existing = all<{ id: string; product_id: string }>("SELECT id, product_id FROM product_sizes");
    const mine = new Set(existing.filter((s) => s.product_id === productId).map((s) => s.id));
    const others = new Set(existing.filter((s) => s.product_id !== productId).map((s) => s.id));
    for (const s of sizes) {
      if (others.has(s.id)) fail("حجم غير صحيح");
      if (mine.has(s.id)) {
        run(
          `UPDATE product_sizes SET name = $name, price = $price, scoops = $scoops, sort = $sort, active = 1,
             updated_at = $now WHERE id = $id`,
          { ...s, now }
        );
      } else {
        run(
          `INSERT INTO product_sizes (id, product_id, name, price, scoops, active, sort, updated_at)
           VALUES ($id, $pid, $name, $price, $scoops, 1, $sort, $now)`,
          { ...s, pid: productId, now }
        );
      }
    }
    for (const sid of mine) {
      if (!sizeIds.has(sid)) {
        run("UPDATE product_sizes SET active = 0, updated_at = $now WHERE id = $id AND active = 1", { id: sid, now });
      }
    }

    run("DELETE FROM recipe_lines WHERE product_id = $id", { id: productId });
    for (const r of recipe) {
      run(
        `INSERT INTO recipe_lines (id, product_id, size_id, stock_item_id, qty, updated_at)
         VALUES ($id, $pid, $size_id, $stock_item_id, $qty, $now)`,
        { ...r, id: uid(), pid: productId, now }
      );
    }
  });
  return listProducts().find((p) => p.id === productId)!;
}

// --- الإضافات | extras -------------------------------------------------------

export function saveExtra(input: Record<string, unknown>): Extra {
  const name = text(input.name, "اسم الإضافة", { max: 40 });
  const price = amount(input.price, "السعر", { min: 0 });
  const stockItemId = typeof input.stock_item_id === "string" && input.stock_item_id ? input.stock_item_id : null;
  if (stockItemId && !stockItemExists(stockItemId)) fail("مادة المخزون غير موجودة");
  const qty = stockItemId ? amount(input.qty, "الكمية المستهلكة", { min: 0, allowZero: false }) : 0;
  const active = input.active !== false;
  const sort = Math.round(amount(input.sort ?? 0, "الترتيب", { min: -1000, max: 1000 }));
  const now = nowIso();
  const id = typeof input.id === "string" && input.id ? input.id : null;

  return tx(() => {
    const clash = get("SELECT 1 AS x FROM extras WHERE name = $name AND id <> $id", { name, id: id ?? "" });
    if (clash) fail("توجد إضافة بنفس الاسم");
    if (id) {
      if (!get("SELECT 1 AS x FROM extras WHERE id = $id", { id })) fail("الإضافة غير موجودة");
      run(
        `UPDATE extras SET name = $name, price = $price, stock_item_id = $stockItemId, qty = $qty,
           active = $active, sort = $sort, updated_at = $now WHERE id = $id`,
        { id, name, price, stockItemId, qty, active, sort, now }
      );
      return listExtras().find((e) => e.id === id)!;
    }
    const newId = uid();
    run(
      `INSERT INTO extras (id, name, price, stock_item_id, qty, active, sort, created_at, updated_at)
       VALUES ($id, $name, $price, $stockItemId, $qty, $active, $sort, $now, $now)`,
      { id: newId, name, price, stockItemId, qty, active, sort, now }
    );
    return listExtras().find((e) => e.id === newId)!;
  });
}

export const optionalNote = (v: unknown) => optText(v, "الملاحظة", 200);
