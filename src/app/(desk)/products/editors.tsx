"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveExtraAction, saveProductAction, saveStockItemAction } from "@/actions/manage";
import { ErrorNote, Field, FieldGroup, Modal, NumInput, SaveBar, Segmented, Toggle, useAction } from "@/components/ui";
import { INPUT_UNIT, UNIT_LABEL, type Unit } from "@/lib/format";
import type { Extra, Pricing, Product, StockItem } from "@/lib/types";

// نوافذ تعديل الأصناف | catalog editors.

const PRODUCT_COLORS = ["#00ADEF", "#E9ED1D", "#F9A72B", "#F06292", "#8D6E63", "#66BB6A", "#AB47BC", "#EF5350", "#26C6DA", "#282828"];
const FLAVOR_COLORS = [
  "#F3E5AB", "#7B4B2A", "#F48FB1", "#A5D6A7", "#FFB74D", "#E9ED1D",
  "#7986CB", "#D4A15A", "#80CBC4", "#8D6E63", "#616161", "#EF5350",
];

const newId = () => crypto.randomUUID();
const s = (v: number | null | undefined) => (v == null ? "" : String(v));

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={`w-8 h-8 rounded-full ring-offset-2 transition ${value === c ? "ring-2 ring-ink scale-110" : "ring-1 ring-ink-100"}`}
          style={{ background: c }}
        />
      ))}
      {/* عجلة الألوان: أي لون | color wheel for any custom color */}
      <label
        title="اختر أي لون"
        className={`relative w-8 h-8 rounded-full cursor-pointer ring-offset-2 transition ${
          !colors.includes(value) ? "ring-2 ring-ink scale-110" : "ring-1 ring-ink-100"
        }`}
        style={{
          background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
      >
        {!colors.includes(value) && (
          <span className="absolute inset-1.5 rounded-full ring-2 ring-white" style={{ background: value }} />
        )}
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#00adef"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="اختر أي لون"
        />
      </label>
    </div>
  );
}

function useDone(onClose: () => void) {
  const router = useRouter();
  return () => {
    router.refresh();
    onClose();
  };
}

// ---------------------------------------------------------------------------
// ما يستهلكه البيع | consumption lines ("uses")
// ---------------------------------------------------------------------------

type Line = { key: string; size_id: string | null; stock_item_id: string; qty: string };

function UsesEditor({
  lines,
  items,
  onAdd,
  onRemove,
  onQty,
}: {
  lines: Line[];
  items: StockItem[];
  onAdd: (stockItemId: string) => void;
  onRemove: (key: string) => void;
  onQty: (key: string, qty: string) => void;
}) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [picking, setPicking] = useState(false);
  const usable = items.filter((i) => i.active && !lines.some((l) => l.stock_item_id === i.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {lines.map((l) => {
        const it = byId.get(l.stock_item_id);
        return (
          <span key={l.key} className="inline-flex items-center gap-1 rounded-xl bg-sky-50 ring-1 ring-sky-100 ps-2.5 pe-1 py-1 text-xs">
            <span className="font-semibold">{it?.name ?? "؟"}</span>
            <input
              value={l.qty}
              onChange={(e) => onQty(l.key, e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              dir="ltr"
              className="w-14 rounded-lg bg-white border border-sky-100 px-1.5 py-0.5 text-center tnum outline-none focus:border-sky"
            />
            <span className="text-ink-400">{it ? UNIT_LABEL[it.unit] : ""}</span>
            <button type="button" onClick={() => onRemove(l.key)} className="w-6 h-6 grid place-items-center rounded-lg hover:bg-white text-ink-400" aria-label="حذف">
              <X size={13} />
            </button>
          </span>
        );
      })}
      {picking ? (
        <select
          autoFocus
          className="input !w-auto !py-1 text-xs"
          defaultValue=""
          onBlur={() => setPicking(false)}
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
            setPicking(false);
          }}
        >
          <option value="" disabled>
            اختر مادة…
          </option>
          {usable.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({UNIT_LABEL[i.unit]})
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={!usable.length}
          className="inline-flex items-center gap-1 rounded-xl border border-dashed border-ink-200 px-2.5 py-1 text-xs text-ink-500 hover:border-sky hover:text-sky-700"
        >
          <Plus size={13} /> مادة
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// الصنف | product
// ---------------------------------------------------------------------------

type SizeRow = { id: string; name: string; price: string; scoops: string };

const TEMPLATES: { label: string; sizes: [string, number][] }[] = [
  { label: "1 / 2 / 3 بولات", sizes: [["بولة", 1], ["بولتين", 2], ["3 بولات", 3]] },
  { label: "صغير / وسط / كبير", sizes: [["صغير", 1], ["وسط", 2], ["كبير", 3]] },
  { label: "حجم واحد", sizes: [["عادي", 1]] },
];

export function ProductEditor({
  product,
  items,
  categories,
  scoopGrams,
  onClose,
}: {
  product: Product | null;
  items: StockItem[];
  categories: string[];
  scoopGrams: number;
  onClose: () => void;
}) {
  const done = useDone(onClose);
  const { pending, error, run } = useAction();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "آيس كريم");
  const [pricing, setPricing] = useState<Pricing>(product?.pricing ?? "size");
  const [color, setColor] = useState(product?.color ?? PRODUCT_COLORS[0]);
  const [active, setActive] = useState(product?.active ?? true);
  const [sort, setSort] = useState(s(product?.sort ?? 0));
  const [ppk, setPpk] = useState(s(product?.price_per_kg));
  const [maxFlavors, setMaxFlavors] = useState(s(product?.max_flavors ?? 3));
  const [scoopG, setScoopG] = useState(s(product?.scoop_grams));
  const [sizes, setSizes] = useState<SizeRow[]>(
    product?.sizes.map((z) => ({ id: z.id, name: z.name, price: s(z.price), scoops: s(z.scoops) })) ?? []
  );
  const [lines, setLines] = useState<Line[]>(
    product?.recipe.map((r) => ({ key: newId(), size_id: r.size_id, stock_item_id: r.stock_item_id, qty: s(r.qty) })) ?? []
  );

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const defaultQty = (id: string) => {
    const u = itemsById.get(id)?.unit;
    return u === "pcs" ? "1" : u === "ml" ? "200" : "50";
  };
  const addLine = (size_id: string | null) => (stock_item_id: string) =>
    setLines((ls) => [...ls, { key: newId(), size_id, stock_item_id, qty: defaultQty(stock_item_id) }]);
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const qtyLine = (key: string, q: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: q } : l)));

  function save() {
    run(
      () =>
        saveProductAction({
          id: product?.id,
          name,
          category,
          pricing,
          color,
          active,
          sort: Number(sort || 0),
          price_per_kg: pricing === "weight" ? ppk : null,
          max_flavors: pricing === "weight" ? maxFlavors : 0,
          scoop_grams: scoopG === "" ? null : scoopG,
          sizes: pricing === "size" ? sizes.map((z) => ({ id: z.id, name: z.name, price: z.price, scoops: z.scoops || 0 })) : [],
          recipe: lines
            .filter((l) => pricing === "weight" ? l.size_id === null : l.size_id === null || sizes.some((z) => z.id === l.size_id))
            .map((l) => ({ size_id: l.size_id, stock_item_id: l.stock_item_id, qty: l.qty })),
        }),
      done
    );
  }

  return (
    <Modal title={product ? `تعديل: ${product.name}` : "صنف جديد"} onClose={onClose} size="lg">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="اسم الصنف">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: آيس كريم كوب" />
          </Field>
          <Field label="الفئة" hint="تظهر كتبويب في شاشة الكاشير">
            <input className="input" list="cats" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <FieldGroup label="لون الزر في الكاشير">
          <Swatches colors={PRODUCT_COLORS} value={color} onChange={setColor} />
        </FieldGroup>

        <div className="space-y-2">
          <span className="label">طريقة البيع</span>
          <div>
            <Segmented<Pricing>
              value={pricing}
              onChange={setPricing}
              options={[
                { value: "size", label: "بالحجم (سعر ثابت لكل حجم)" },
                { value: "weight", label: "بالوزن (سعر الكيلو)" },
              ]}
            />
          </div>
        </div>

        {pricing === "size" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="label">الأحجام والأسعار</span>
              <div className="flex-1" />
              {!sizes.length &&
                TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setSizes(t.sizes.map(([n, sc]) => ({ id: newId(), name: n, price: "", scoops: String(sc) })))}
                    className="chip bg-lemon-100 text-ink hover:bg-lemon-200"
                  >
                    {t.label}
                  </button>
                ))}
            </div>
            <div className="space-y-2">
              {sizes.map((z, i) => (
                <div key={z.id} className="rounded-2xl bg-ink-50/70 ring-1 ring-ink-100 p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <Field label={`الحجم ${i + 1}`}>
                      <input
                        className="input"
                        value={z.name}
                        onChange={(e) => setSizes((ss) => ss.map((x) => (x.id === z.id ? { ...x, name: e.target.value } : x)))}
                      />
                    </Field>
                    <Field label="السعر">
                      <NumInput
                        value={z.price}
                        suffix="ج.س"
                        onChange={(v) => setSizes((ss) => ss.map((x) => (x.id === z.id ? { ...x, price: v } : x)))}
                      />
                    </Field>
                    <Field label="عدد البولات / النكهات">
                      <select
                        className="input"
                        value={z.scoops}
                        onChange={(e) => setSizes((ss) => ss.map((x) => (x.id === z.id ? { ...x, scoops: e.target.value } : x)))}
                      >
                        <option value="0">بدون نكهة</option>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        setSizes((ss) => ss.filter((x) => x.id !== z.id));
                        setLines((ls) => ls.filter((l) => l.size_id !== z.id));
                      }}
                      className="btn-ghost w-11 h-11 rounded-xl text-red-600"
                      aria-label="حذف الحجم"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-ink-400 shrink-0">يستهلك:</span>
                    <UsesEditor
                      lines={lines.filter((l) => l.size_id === z.id)}
                      items={items}
                      onAdd={addLine(z.id)}
                      onRemove={removeLine}
                      onQty={qtyLine}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSizes((ss) => [...ss, { id: newId(), name: "", price: "", scoops: "1" }])}
                className="btn-soft w-full py-2.5 text-sm border-dashed"
              >
                <Plus size={16} /> إضافة حجم
              </button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="سعر الكيلو">
              <NumInput value={ppk} onChange={setPpk} suffix="ج.س" />
            </Field>
            <Field label="أقصى عدد نكهات" hint="الوزن يُخصم من النكهات المختارة بالتساوي">
              <select className="input" value={maxFlavors} onChange={(e) => setMaxFlavors(e.target.value)}>
                <option value="0">بدون نكهة</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="rounded-2xl ring-1 ring-ink-100 p-3 space-y-2">
          <p className="text-sm font-semibold">يستهلك مع كل بيع {pricing === "size" ? "(لكل الأحجام)" : ""}</p>
          <p className="text-[11px] text-ink-400 -mt-1">مثل الملعقة أو الشفاطة. النكهات تُخصم تلقائياً حسب الاختيار.</p>
          <UsesEditor
            lines={lines.filter((l) => l.size_id === null)}
            items={items}
            onAdd={addLine(null)}
            onRemove={removeLine}
            onQty={qtyLine}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {pricing === "size" && (
            <Field label="وزن البولة (جرام)" hint={`فارغ = الإعداد العام (${scoopGrams} جم)`}>
              <NumInput value={scoopG} onChange={setScoopG} placeholder={String(scoopGrams)} suffix="جم" />
            </Field>
          )}
          <Field label="ترتيب الظهور" hint="الأصغر يظهر أولاً">
            <NumInput value={sort} onChange={setSort} />
          </Field>
        </div>

        <Toggle checked={active} onChange={setActive} label="الصنف متاح للبيع" hint="أوقفه بدلاً من حذفه — تبقى الفواتير القديمة كما هي" />

        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// النكهة / مادة المخزون | flavor or stock item
// ---------------------------------------------------------------------------

export function StockItemEditor({
  item,
  kind,
  onClose,
}: {
  item: StockItem | null;
  kind: "flavor" | "item";
  onClose: () => void;
}) {
  const done = useDone(onClose);
  const { pending, error, run } = useAction();
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState<Unit>(item?.unit ?? (kind === "flavor" ? "g" : "pcs"));
  const f = INPUT_UNIT[unit].factor;
  const [qty, setQty] = useState("");
  const [alert, setAlert] = useState(item ? s(item.alert_qty / INPUT_UNIT[item.unit].factor) : "");
  const [color, setColor] = useState(item?.color ?? FLAVOR_COLORS[0]);
  const [active, setActive] = useState(item?.active ?? true);
  const isFlavor = kind === "flavor";

  return (
    <Modal title={item ? `تعديل: ${item.name}` : isFlavor ? "نكهة جديدة" : "مادة مخزون جديدة"} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              saveStockItemAction({
                id: item?.id,
                kind,
                name,
                unit,
                color: isFlavor ? color : null,
                active,
                qty: Number(qty || 0) * f,
                alert_qty: Number(alert || 0) * f,
              }),
            done
          );
        }}
      >
        <Field label={isFlavor ? "اسم النكهة" : "اسم المادة"}>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isFlavor ? "مثلاً: فانيلا" : "مثلاً: كوب صغير، بسكويت، حليب"}
          />
        </Field>

        {!isFlavor && (
          <div className="space-y-1.5">
            <span className="label">تُحسب بـ</span>
            <div>
              <Segmented<Unit>
                value={unit}
                onChange={setUnit}
                options={[
                  { value: "pcs", label: "بالحبة" },
                  { value: "ml", label: "باللتر (حليب، صوص…)" },
                  { value: "g", label: "بالكيلو" },
                ]}
              />
            </div>
          </div>
        )}

        {isFlavor && (
          <FieldGroup label="لون الزر">
            <Swatches colors={FLAVOR_COLORS} value={color} onChange={setColor} />
          </FieldGroup>
        )}

        <div className="grid grid-cols-2 gap-3">
          {!item && (
            <Field label="الكمية الموجودة الآن" hint="يمكن إضافة المزيد لاحقاً من «المخزون»">
              <NumInput value={qty} onChange={setQty} suffix={INPUT_UNIT[unit].label} />
            </Field>
          )}
          <Field label="نبّهني عندما تقل عن" hint="0 = بدون تنبيه">
            <NumInput value={alert} onChange={setAlert} suffix={INPUT_UNIT[unit].label} />
          </Field>
        </div>

        <Toggle checked={active} onChange={setActive} label={isFlavor ? "النكهة متاحة" : "المادة مستخدمة"} />
        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// الإضافة | extra (topping)
// ---------------------------------------------------------------------------

export function ExtraEditor({ extra, items, onClose }: { extra: Extra | null; items: StockItem[]; onClose: () => void }) {
  const done = useDone(onClose);
  const { pending, error, run } = useAction();
  const [name, setName] = useState(extra?.name ?? "");
  const [price, setPrice] = useState(s(extra?.price));
  const [stockItemId, setStockItemId] = useState(extra?.stock_item_id ?? "");
  const [qty, setQty] = useState(s(extra?.qty || null));
  const [active, setActive] = useState(extra?.active ?? true);
  const unit = items.find((i) => i.id === stockItemId)?.unit;

  return (
    <Modal title={extra ? `تعديل: ${extra.name}` : "إضافة جديدة"} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveExtraAction({ id: extra?.id, name, price, stock_item_id: stockItemId || null, qty: stockItemId ? qty : 0, active }),
            done
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: صوص شوكولاتة" />
          </Field>
          <Field label="السعر الإضافي">
            <NumInput value={price} onChange={setPrice} suffix="ج.س" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تُخصم من المخزون" hint="اختياري">
            <select className="input" value={stockItemId} onChange={(e) => setStockItemId(e.target.value)}>
              <option value="">لا شيء</option>
              {items
                .filter((i) => i.active || i.id === stockItemId)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
          </Field>
          {stockItemId && (
            <Field label="الكمية لكل مرة">
              <NumInput value={qty} onChange={setQty} suffix={unit ? UNIT_LABEL[unit] : ""} />
            </Field>
          )}
        </div>
        <Toggle checked={active} onChange={setActive} label="الإضافة متاحة" />
        <ErrorNote error={error} />
        <SaveBar pending={pending} onCancel={onClose} />
      </form>
    </Modal>
  );
}
