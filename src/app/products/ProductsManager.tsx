"use client";

import { useState, useTransition } from "react";
import {
  saveExtraAction, saveFlavorAction, saveIngredientAction, savePackagingAction, saveVariantAction,
  type ActionResult,
} from "@/lib/actions";
import { money, num, volume, weight } from "@/lib/money";
import type {
  AdminExtra, AdminFlavor, AdminIngredient, AdminPackaging, AdminVariant, PackagingKind,
} from "@/lib/types";
import {
  PRODUCT_TYPES, PRODUCT_TYPE_LABEL, productType, toKindAndCategory, type ProductType,
} from "@/lib/catalog";
import { Field, FormShell, NumberInput, inputCls, str, useSave } from "@/components/form";

const PACK_LABEL: Record<PackagingKind, string> = {
  cup: "كوب",
  cone: "كون",
  spoon: "ملعقة / شفاطة",
  biscuit: "بسكويت",
  bag: "كيس",
};

const FLAVOR_COLORS = [
  "#F5E6C8", "#6B4226", "#FFB22C", "#F7F3E8", "#F2708A", "#EDE75A",
  "#A8C256", "#C98A3C", "#7B4B2A", "#F5D76E", "#9B5DE5", "#4CC9F0",
];

type Tab = "variants" | "flavors" | "extras" | "ingredients" | "packaging";

const TABS: { key: Tab; label: string }[] = [
  { key: "variants", label: "الأصناف" },
  { key: "flavors", label: "النكهات" },
  { key: "extras", label: "الإضافات" },
  { key: "ingredients", label: "الحليب والمكونات" },
  { key: "packaging", label: "الأكواب والتعبئة" },
];

type Editing =
  | { tab: "variants"; row: AdminVariant | null }
  | { tab: "flavors"; row: AdminFlavor | null }
  | { tab: "extras"; row: AdminExtra | null }
  | { tab: "ingredients"; row: AdminIngredient | null }
  | { tab: "packaging"; row: AdminPackaging | null };

const nextOrder = (rows: { sort_order: number }[]) =>
  rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1;

export default function ProductsManager({
  variants, flavors, extras, ingredients, packaging, defaultScoopGrams,
}: {
  variants: AdminVariant[];
  flavors: AdminFlavor[];
  extras: AdminExtra[];
  ingredients: AdminIngredient[];
  packaging: AdminPackaging[];
  defaultScoopGrams: number;
}) {
  const [tab, setTab] = useState<Tab>("variants");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const packName = (id: string | null) => packaging.find((p) => p.id === id)?.name_ar;

  // إظهار / إخفاء سريع | one-tap show / hide
  function toggle(run: () => Promise<ActionResult>) {
    setToast(null);
    start(async () => {
      const res = await run();
      if (!res.ok) setToast(res.error);
    });
  }

  const addLabel: Record<Tab, string> = {
    variants: "صنف جديد / ميلك شيك",
    flavors: "نكهة جديدة",
    extras: "إضافة جديدة",
    ingredients: "مكوّن جديد",
    packaging: "عبوة جديدة",
  };

  return (
    <div className="space-y-4">
      {/* التبويبات | tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`btn px-4 py-2.5 text-sm ${
              tab === t.key ? "bg-berry text-white" : "bg-white text-choco border border-black/10"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing({ tab, row: null } as Editing)}
          className="btn px-4 py-2.5 text-sm bg-mint text-white"
        >
          + {addLabel[tab]}
        </button>
      </div>

      {toast && (
        <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{toast}</p>
      )}

      <section className="bg-white rounded-3xl shadow-sm p-2 sm:p-4">
        <ul className="divide-y divide-black/5">
          {tab === "variants" &&
            variants.map((v) => (
              <Row
                key={v.id}
                active={v.is_active}
                title={v.name_ar}
                badge={PRODUCT_TYPE_LABEL[productType(v)]}
                detail={
                  v.kind === "weight"
                    ? `${money(v.price_per_kg)} / كجم · ${packName(v.packaging_id) ?? "بدون عبوة"}`
                    : `${money(v.price)} · ${num(v.scoops)} سكوب · حتى ${num(v.max_flavors)} نكهات · ${packName(v.packaging_id) ?? "بدون عبوة"}${
                        v.ingredient_id && Number(v.ingredient_qty) > 0
                          ? ` · ${volume(v.ingredient_qty)} ${ingredients.find((g) => g.id === v.ingredient_id)?.name_ar ?? ""}`
                          : ""
                      }`
                }
                pending={pending}
                onEdit={() => setEditing({ tab: "variants", row: v })}
                onToggle={() => toggle(() => saveVariantAction({ ...v, is_active: !v.is_active }))}
              />
            ))}

          {tab === "flavors" &&
            flavors.map((f) => (
              <Row
                key={f.id}
                active={f.is_active}
                title={f.name_ar}
                swatch={f.color}
                detail={`المتوفر ${weight(f.stock_grams)} · تنبيه عند ${weight(f.low_stock_grams)}`}
                pending={pending}
                onEdit={() => setEditing({ tab: "flavors", row: f })}
                onToggle={() => toggle(() => saveFlavorAction({ ...f, is_active: !f.is_active }))}
              />
            ))}

          {tab === "extras" &&
            extras.map((x) => (
              <Row
                key={x.id}
                active={x.is_active}
                title={x.name_ar}
                detail={`${money(x.price)} · المتوفر ${num(x.stock_qty)} حصة`}
                pending={pending}
                onEdit={() => setEditing({ tab: "extras", row: x })}
                onToggle={() => toggle(() => saveExtraAction({ ...x, is_active: !x.is_active }))}
              />
            ))}

          {tab === "ingredients" &&
            (ingredients.length === 0 ? (
              <li className="px-2 py-6 text-sm text-choco/40 text-center">لا توجد مكونات بعد — أضف «حليب».</li>
            ) : (
              ingredients.map((g) => (
                <Row
                  key={g.id}
                  active={g.is_active}
                  title={g.name_ar}
                  badge="مكوّن"
                  detail={`المتوفر ${volume(g.stock_qty)} · تنبيه عند ${volume(g.low_stock_qty)} · يُستخدم في: ${
                    variants.filter((v) => v.ingredient_id === g.id).map((v) => v.name_ar).join("، ") || "لا شيء بعد"
                  }`}
                  pending={pending}
                  onEdit={() => setEditing({ tab: "ingredients", row: g })}
                  onToggle={() =>
                    toggle(() =>
                      saveIngredientAction({
                        id: g.id, name_ar: g.name_ar, low_stock_ml: Number(g.low_stock_qty),
                        sort_order: g.sort_order, is_active: !g.is_active,
                      })
                    )
                  }
                />
              ))
            ))}

          {tab === "packaging" &&
            packaging.map((p) => (
              <Row
                key={p.id}
                active={p.is_active}
                title={p.name_ar}
                badge={PACK_LABEL[p.kind]}
                detail={`المتوفر ${num(p.stock_qty)} حبة · تنبيه عند ${num(p.low_stock_qty)}`}
                pending={pending}
                onEdit={() => setEditing({ tab: "packaging", row: p })}
                onToggle={() => toggle(() => savePackagingAction({ ...p, is_active: !p.is_active }))}
              />
            ))}
        </ul>
      </section>

      <p className="text-xs text-choco/40 px-2">
        الأصناف لا تُحذف نهائياً لأن الفواتير القديمة مرتبطة بها — «إخفاء» يزيلها من شاشة الكاشير ويمكن إظهارها لاحقاً.
        تعبئة المخزون من صفحة «المخزون».
      </p>

      {/* النماذج | forms */}
      {editing?.tab === "variants" && (
        <VariantForm
          row={editing.row}
          packaging={packaging}
          ingredients={ingredients}
          defaultScoopGrams={defaultScoopGrams}
          nextSort={nextOrder(variants)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.tab === "flavors" && (
        <FlavorForm row={editing.row} nextSort={nextOrder(flavors)} onClose={() => setEditing(null)} />
      )}
      {editing?.tab === "extras" && (
        <ExtraForm row={editing.row} nextSort={nextOrder(extras)} onClose={() => setEditing(null)} />
      )}
      {editing?.tab === "ingredients" && (
        <IngredientForm row={editing.row} nextSort={nextOrder(ingredients) + 100} onClose={() => setEditing(null)} />
      )}
      {editing?.tab === "packaging" && (
        <PackagingForm row={editing.row} nextSort={nextOrder(packaging)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// صف في القائمة | one list row
// ---------------------------------------------------------------------
function Row({
  title, detail, badge, swatch, active, pending, onEdit, onToggle,
}: {
  title: string;
  detail: string;
  badge?: string;
  swatch?: string;
  active: boolean;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <li className={`flex items-center gap-3 px-2 py-3 ${active ? "" : "opacity-50"}`}>
      {swatch && (
        <span className="w-8 h-8 rounded-xl border border-black/10 shrink-0" style={{ backgroundColor: swatch }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-choco">
          {title}
          {badge && (
            <span className="ms-2 text-[10px] font-bold bg-cream border border-black/10 rounded-full px-2 py-0.5 text-choco/60">
              {badge}
            </span>
          )}
          {!active && (
            <span className="ms-2 text-[10px] font-bold bg-black/10 rounded-full px-2 py-0.5 text-choco/70">
              مخفي
            </span>
          )}
        </p>
        <p className="text-xs text-choco/50 tnum truncate">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="btn px-3 py-2 text-xs bg-cream text-choco/70 border border-black/10"
      >
        {active ? "إخفاء" : "إظهار"}
      </button>
      <button type="button" onClick={onEdit} className="btn px-4 py-2 text-sm bg-choco text-white">
        تعديل
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------
// ظاهر / مخفي | visible on the counter screen
// ---------------------------------------------------------------------
function ActiveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`btn w-full py-3 text-sm border-2 ${
        value ? "border-mint bg-mint/10 text-mint" : "border-black/10 bg-cream text-choco/50"
      }`}
    >
      {value ? "✓ ظاهر في شاشة الكاشير" : "مخفي من شاشة الكاشير"}
    </button>
  );
}

// ---------------------------------------------------------------------
// نموذج الصنف | product form
// ---------------------------------------------------------------------
function VariantForm({
  row, packaging, ingredients, defaultScoopGrams, nextSort, onClose,
}: {
  row: AdminVariant | null;
  packaging: AdminPackaging[];
  ingredients: AdminIngredient[];
  defaultScoopGrams: number;
  nextSort: number;
  onClose: () => void;
}) {
  const containers = packaging.filter((p) => p.kind !== "spoon");
  const spoons = packaging.filter((p) => p.kind === "spoon");
  const firstOf = (kinds: PackagingKind[]) =>
    containers.find((p) => kinds.includes(p.kind) && p.is_active)?.id ?? "";

  const [name, setName] = useState(row?.name_ar ?? "");
  const [type, setType] = useState<ProductType>(row ? productType(row) : "scoop");
  const [price, setPrice] = useState(str(row?.price));
  const [pricePerKg, setPricePerKg] = useState(str(row?.price_per_kg));
  const [scoops, setScoops] = useState(str(row?.scoops, "1"));
  const [grams, setGrams] = useState(str(row?.grams_per_scoop, String(defaultScoopGrams)));
  const [maxFlavors, setMaxFlavors] = useState(str(row?.max_flavors, "1"));
  const [packId, setPackId] = useState(row ? row.packaging_id ?? "" : firstOf(["cup"]));
  const [spoonId, setSpoonId] = useState(row ? row.spoon_packaging_id ?? "" : spoons[0]?.id ?? "");
  const [sort, setSort] = useState(str(row?.sort_order, String(nextSort)));
  const [active, setActive] = useState(row?.is_active ?? true);
  const milk = ingredients.find((g) => g.is_active && g.name_ar.includes("حليب")) ?? ingredients.find((g) => g.is_active);
  const [ingId, setIngId] = useState(row ? row.ingredient_id ?? "" : "");
  const [ingQty, setIngQty] = useState(str(row?.ingredient_qty, ""));
  const { pending, error, save } = useSave(onClose);

  // تغيير النوع لصنف جديد يقترح العبوة المناسبة | sensible packaging per type
  function pickType(t: ProductType) {
    setType(t);
    if (row) return;
    if (t === "cone") {
      setPackId(firstOf(["cone", "biscuit"]));
      setSpoonId("");
    } else if (t === "weight") {
      setPackId(firstOf(["bag"]));
      setSpoonId("");
      setMaxFlavors("4");
    } else if (t === "shake") {
      // prefer the milkshake cup and a straw when they exist
      const shakeCup = containers.find((p) => p.is_active && p.name_ar.includes("شيك"));
      const straw = spoons.find((p) => p.is_active && p.name_ar.includes("شفاط"));
      setPackId(shakeCup?.id ?? firstOf(["cup"]));
      setSpoonId(straw?.id ?? spoons[0]?.id ?? "");
      setScoops("3");
      setMaxFlavors("2");
      // milkshakes use milk: 100 ml per scoop to start
      if (milk) {
        setIngId(milk.id);
        setIngQty("300");
      }
    } else {
      setPackId(firstOf(["cup"]));
      setSpoonId(spoons[0]?.id ?? "");
    }
  }

  const isWeight = type === "weight";
  const contentGrams = isWeight ? null : Number(scoops || 0) * Number(grams || 0);
  const ing = ingredients.find((g) => g.id === ingId);
  const deducts = [
    isWeight ? "الوزن المُدخل من النكهات" : `${num(contentGrams)} جرام من النكهات`,
    ing && Number(ingQty) > 0 ? `${volume(Number(ingQty))} ${ing.name_ar}` : null,
    containers.find((p) => p.id === packId)?.name_ar,
    spoons.find((p) => p.id === spoonId)?.name_ar,
  ].filter(Boolean);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name_ar}` : "صنف جديد"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() =>
        save(() =>
          saveVariantAction({
            id: row?.id,
            name_ar: name,
            ...toKindAndCategory(type),
            price: isWeight ? null : Number(price),
            price_per_kg: isWeight ? Number(pricePerKg) : null,
            scoops: isWeight ? null : Number(scoops),
            grams_per_scoop: isWeight ? null : Number(grams),
            max_flavors: Number(maxFlavors),
            packaging_id: packId || null,
            spoon_packaging_id: spoonId || null,
            ingredient_id: ingId || null,
            ingredient_qty: ingId ? Number(ingQty || 0) : null,
            sort_order: Number(sort),
            is_active: active,
          })
        )
      }
    >
      <Field label="الاسم (كما يظهر على الزر والفاتورة)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>

      <Field label="النوع">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {PRODUCT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pickType(t)}
              className={`btn py-2.5 text-sm border-2 ${
                type === t ? "border-berry bg-berry/10 text-berry" : "border-black/10 bg-cream text-choco/70"
              }`}
            >
              {PRODUCT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isWeight ? (
          <Field label="سعر الكيلو (ج.س)">
            <NumberInput value={pricePerKg} onChange={setPricePerKg} />
          </Field>
        ) : (
          <>
            <Field label="السعر (ج.س)">
              <NumberInput value={price} onChange={setPrice} />
            </Field>
            <Field label="عدد السكوبات" hint={type === "shake" ? "كمية الآيس كريم في الكوب" : "تحدد كمية الآيس كريم المخصومة"}>
              <NumberInput value={scoops} onChange={setScoops} step="1" />
            </Field>
            <Field label="جرام السكوب الواحد">
              <NumberInput value={grams} onChange={setGrams} />
            </Field>
          </>
        )}
        <Field label="أقصى عدد نكهات">
          <NumberInput value={maxFlavors} onChange={setMaxFlavors} step="1" />
        </Field>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={type === "shake" ? "كوب الميلك شيك" : "العبوة (كوب / كون / كيس)"}>
          <select value={packId} onChange={(e) => setPackId(e.target.value)} className={inputCls}>
            <option value="">بدون</option>
            {containers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_ar}{p.is_active ? "" : " (مخفي)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label={type === "shake" ? "شفاطة" : "ملعقة"}>
          <select value={spoonId} onChange={(e) => setSpoonId(e.target.value)} className={inputCls}>
            <option value="">بدون</option>
            {spoons.map((p) => (
              <option key={p.id} value={p.id}>{p.name_ar}</option>
            ))}
          </select>
        </Field>
        <Field label="الترتيب على الشاشة" hint="الأصغر يظهر أولاً">
          <NumberInput value={sort} onChange={setSort} step="1" />
        </Field>
      </div>

      {ingredients.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="مكوّن يُخصم مع كل بيع" hint="مثل الحليب في الميلك شيك">
            <select value={ingId} onChange={(e) => setIngId(e.target.value)} className={inputCls}>
              <option value="">بدون</option>
              {ingredients.map((g) => (
                <option key={g.id} value={g.id}>{g.name_ar}{g.is_active ? "" : " (مخفي)"}</option>
              ))}
            </select>
          </Field>
          {ingId && (
            <Field label="الكمية لكل كوب (مل)">
              <NumberInput value={ingQty} onChange={setIngQty} step="10" />
            </Field>
          )}
        </div>
      )}

      <p className="text-xs text-choco/60 bg-cream rounded-xl px-3 py-2.5">
        كل بيع لهذا الصنف يخصم من المخزون: <b>{deducts.join(" + ")}</b>
      </p>

      <ActiveToggle value={active} onChange={setActive} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------
// نموذج النكهة | flavor form
// ---------------------------------------------------------------------
function FlavorForm({ row, nextSort, onClose }: { row: AdminFlavor | null; nextSort: number; onClose: () => void }) {
  const [name, setName] = useState(row?.name_ar ?? "");
  const [color, setColor] = useState(row?.color ?? FLAVOR_COLORS[0]);
  const [lowKg, setLowKg] = useState(str(row ? Number(row.low_stock_grams) / 1000 : 2));
  const [openingKg, setOpeningKg] = useState("");
  const [sort, setSort] = useState(str(row?.sort_order, String(nextSort)));
  const [active, setActive] = useState(row?.is_active ?? true);
  const { pending, error, save } = useSave(onClose);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name_ar}` : "نكهة جديدة"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() =>
        save(() =>
          saveFlavorAction({
            id: row?.id,
            name_ar: name,
            color,
            low_stock_grams: Math.round(Number(lowKg) * 1000),
            opening_stock_grams: Math.round(Number(openingKg || 0) * 1000),
            sort_order: Number(sort),
            is_active: active,
          })
        )
      }
    >
      <Field label="اسم النكهة">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>

      <Field label="لون الزر">
        <div className="flex flex-wrap items-center gap-2">
          {FLAVOR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`w-9 h-9 rounded-xl border-2 ${color.toLowerCase() === c.toLowerCase() ? "border-berry scale-110" : "border-black/10"}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded-xl cursor-pointer" />
        </div>
      </Field>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="تنبيه النقص عند (كجم)">
          <NumberInput value={lowKg} onChange={setLowKg} />
        </Field>
        {!row && (
          <Field label="الرصيد الحالي (كجم)" hint="اختياري — يُسجَّل كتوريد">
            <NumberInput value={openingKg} onChange={setOpeningKg} />
          </Field>
        )}
        <Field label="الترتيب على الشاشة">
          <NumberInput value={sort} onChange={setSort} step="1" />
        </Field>
      </div>

      <ActiveToggle value={active} onChange={setActive} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------
// نموذج الإضافة | extra form
// ---------------------------------------------------------------------
function ExtraForm({ row, nextSort, onClose }: { row: AdminExtra | null; nextSort: number; onClose: () => void }) {
  const [name, setName] = useState(row?.name_ar ?? "");
  const [price, setPrice] = useState(str(row?.price));
  const [low, setLow] = useState(str(row?.low_stock_qty, "10"));
  const [opening, setOpening] = useState("");
  const [sort, setSort] = useState(str(row?.sort_order, String(nextSort)));
  const [active, setActive] = useState(row?.is_active ?? true);
  const { pending, error, save } = useSave(onClose);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name_ar}` : "إضافة جديدة"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() =>
        save(() =>
          saveExtraAction({
            id: row?.id,
            name_ar: name,
            price: Number(price),
            low_stock_qty: Number(low),
            opening_stock: Number(opening || 0),
            sort_order: Number(sort),
            is_active: active,
          })
        )
      }
    >
      <Field label="الاسم (مثال: صوص لوتس)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="السعر (ج.س)">
          <NumberInput value={price} onChange={setPrice} />
        </Field>
        <Field label="تنبيه النقص عند (حصة)">
          <NumberInput value={low} onChange={setLow} />
        </Field>
        {!row && (
          <Field label="الرصيد الحالي (حصة)" hint="اختياري — يُسجَّل كتوريد">
            <NumberInput value={opening} onChange={setOpening} />
          </Field>
        )}
        <Field label="الترتيب على الشاشة">
          <NumberInput value={sort} onChange={setSort} step="1" />
        </Field>
      </div>
      <ActiveToggle value={active} onChange={setActive} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------
// نموذج العبوة | packaging form
// ---------------------------------------------------------------------
function PackagingForm({ row, nextSort, onClose }: { row: AdminPackaging | null; nextSort: number; onClose: () => void }) {
  const [name, setName] = useState(row?.name_ar ?? "");
  const [kind, setKind] = useState<PackagingKind>(row?.kind ?? "cup");
  const [low, setLow] = useState(str(row?.low_stock_qty, "50"));
  const [opening, setOpening] = useState("");
  const [sort, setSort] = useState(str(row?.sort_order, String(nextSort)));
  const [active, setActive] = useState(row?.is_active ?? true);
  const { pending, error, save } = useSave(onClose);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name_ar}` : "عبوة جديدة"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() =>
        save(() =>
          savePackagingAction({
            id: row?.id,
            name_ar: name,
            kind,
            low_stock_qty: Number(low),
            opening_stock: Number(opening || 0),
            sort_order: Number(sort),
            is_active: active,
          })
        )
      }
    >
      <Field label="الاسم (مثال: كوب عائلي)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>
      <Field label="النوع">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(Object.keys(PACK_LABEL) as PackagingKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`btn py-2.5 text-sm border-2 ${
                kind === k ? "border-berry bg-berry/10 text-berry" : "border-black/10 bg-cream text-choco/70"
              }`}
            >
              {PACK_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="تنبيه النقص عند (حبة)">
          <NumberInput value={low} onChange={setLow} step="1" />
        </Field>
        {!row && (
          <Field label="الرصيد الحالي (حبة)" hint="اختياري — يُسجَّل كتوريد">
            <NumberInput value={opening} onChange={setOpening} step="1" />
          </Field>
        )}
        <Field label="الترتيب">
          <NumberInput value={sort} onChange={setSort} step="1" />
        </Field>
      </div>
      <ActiveToggle value={active} onChange={setActive} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------
// نموذج المكوّن | ingredient form (milk) — amounts typed in litres
// ---------------------------------------------------------------------
function IngredientForm({
  row, nextSort, onClose,
}: {
  row: AdminIngredient | null;
  nextSort: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(row?.name_ar ?? "حليب");
  const [lowL, setLowL] = useState(str(row ? Number(row.low_stock_qty) / 1000 : 5));
  const [openingL, setOpeningL] = useState("");
  const [sort, setSort] = useState(str(row?.sort_order, String(nextSort)));
  const [active, setActive] = useState(row?.is_active ?? true);
  const { pending, error, save } = useSave(onClose);

  return (
    <FormShell
      title={row ? `تعديل: ${row.name_ar}` : "مكوّن جديد"}
      error={error}
      pending={pending}
      onClose={onClose}
      onSave={() =>
        save(() =>
          saveIngredientAction({
            id: row?.id,
            name_ar: name,
            low_stock_ml: Math.round(Number(lowL) * 1000),
            opening_stock_ml: Math.round(Number(openingL || 0) * 1000),
            sort_order: Number(sort),
            is_active: active,
          })
        )
      }
    >
      <Field label="الاسم (مثال: حليب)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} autoFocus />
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="تنبيه النقص عند (لتر)">
          <NumberInput value={lowL} onChange={setLowL} />
        </Field>
        {!row && (
          <Field label="الرصيد الحالي (لتر)" hint="اختياري — يُسجَّل كتوريد">
            <NumberInput value={openingL} onChange={setOpeningL} />
          </Field>
        )}
        <Field label="الترتيب">
          <NumberInput value={sort} onChange={setSort} step="1" />
        </Field>
      </div>
      <p className="text-xs text-choco/50 bg-cream rounded-xl px-3 py-2.5">
        المكوّن لا يظهر في شاشة الكاشير. اختر في كل صنف (مثل الميلك شيك) كمية المكوّن التي يستخدمها، فتُخصم مع كل بيع.
      </p>
      <ActiveToggle value={active} onChange={setActive} />
    </FormShell>
  );
}
