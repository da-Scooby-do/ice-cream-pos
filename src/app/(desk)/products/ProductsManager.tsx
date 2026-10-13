"use client";

import { Check, CupSoda, IceCreamCone, Package, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Page, PageHeader } from "@/components/Page";
import { Empty, Segmented } from "@/components/ui";
import { money, qty } from "@/lib/format";
import type { Extra, Product, StockItem } from "@/lib/types";
import { ExtraEditor, ProductEditor, StockItemEditor } from "./editors";

type Tab = "products" | "flavors" | "items" | "extras";

export default function ProductsManager({
  initialTab,
  products,
  items,
  extras,
  categories,
  scoopGrams,
}: {
  initialTab?: string;
  products: Product[];
  items: StockItem[];
  extras: Extra[];
  categories: string[];
  scoopGrams: number;
}) {
  const [tab, setTab] = useState<Tab>(
    (["products", "flavors", "items", "extras"] as const).find((t) => t === initialTab) ?? "products"
  );
  const [editProduct, setEditProduct] = useState<Product | "new" | null>(null);
  const [editItem, setEditItem] = useState<{ item: StockItem | null; kind: "flavor" | "item" } | null>(null);
  const [editExtra, setEditExtra] = useState<Extra | "new" | null>(null);

  const flavors = items.filter((i) => i.kind === "flavor");
  const goods = items.filter((i) => i.kind === "item");
  const itemName = new Map(items.map((i) => [i.id, i]));

  const steps = [
    { done: flavors.length > 0, label: "أضف النكهات وكمياتها", tab: "flavors" as Tab },
    { done: goods.length > 0, label: "أضف الأكواب والبسكويت والملاعق والحليب", tab: "items" as Tab },
    { done: products.length > 0, label: "أضف الأصناف وأحجامها وأسعارها", tab: "products" as Tab },
  ];
  const allDone = steps.every((s) => s.done);

  const add = () => {
    if (tab === "products") setEditProduct("new");
    else if (tab === "extras") setEditExtra("new");
    else setEditItem({ item: null, kind: tab === "flavors" ? "flavor" : "item" });
  };
  const addLabel = { products: "صنف جديد", flavors: "نكهة جديدة", items: "مادة جديدة", extras: "إضافة جديدة" }[tab];

  return (
    <Page>
      <PageHeader
        title="الأصناف والأسعار"
        sub="كل ما يُباع في المحل، وما يستهلكه كل صنف من المخزون"
        icon={<IceCreamCone size={24} />}
        actions={
          <button type="button" onClick={add} className="btn-go px-4 py-2.5">
            <Plus size={18} /> {addLabel}
          </button>
        }
      />

      {!allDone && (
        <div className="card p-5 bg-gradient-to-l from-lemon-50 to-white ring-1 ring-lemon-200">
          <p className="font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-cone" /> ابدأ من هنا — ثلاث خطوات
          </p>
          <ol className="mt-3 grid md:grid-cols-3 gap-2">
            {steps.map((s, i) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => setTab(s.tab)}
                  className={`w-full text-start rounded-2xl px-4 py-3 ring-1 transition ${
                    s.done ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-ink-100 hover:ring-sky"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={`w-6 h-6 rounded-full grid place-items-center text-xs ${
                        s.done ? "bg-emerald-600 text-white" : "bg-ink text-white"
                      }`}
                    >
                      {s.done ? <Check size={14} /> : i + 1}
                    </span>
                    {s.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "products", label: `الأصناف (${products.length})` },
          { value: "flavors", label: `النكهات (${flavors.length})` },
          { value: "items", label: `مواد المخزون (${goods.length})` },
          { value: "extras", label: `الإضافات (${extras.length})` },
        ]}
      />

      {tab === "products" &&
        (products.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditProduct(p)}
                className={`card p-4 text-start hover:ring-2 hover:ring-sky transition border-s-[6px] ${
                  p.active ? "" : "opacity-50"
                }`}
                style={{ borderInlineStartColor: p.color ?? "#00ADEF" }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg leading-tight">{p.name}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {p.category || "بدون فئة"} · {p.pricing === "weight" ? "بالوزن" : `${p.sizes.length} أحجام`}
                    </p>
                  </div>
                  {!p.active && <span className="chip bg-ink-100 text-ink-500">متوقف</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.pricing === "weight" ? (
                    <span className="chip bg-sky-50 text-sky-800 tnum">{money(p.price_per_kg)} / كجم</span>
                  ) : (
                    p.sizes.map((s) => (
                      <span key={s.id} className="chip bg-sky-50 text-sky-800 tnum">
                        {s.name}: {money(s.price)}
                      </span>
                    ))
                  )}
                </div>
                {p.recipe.length > 0 && (
                  <p className="text-[11px] text-ink-400 mt-2 line-clamp-2">
                    يستهلك:{" "}
                    {[...new Set(p.recipe.map((r) => itemName.get(r.stock_item_id)?.name ?? "؟"))].join("، ")}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<IceCreamCone />} title="لا توجد أصناف بعد">
              أضف أول صنف — مثلاً «آيس كريم كوب» بأحجام 1 و2 و3 بولات، أو «آيس كريم بالوزن».
            </Empty>
          </div>
        ))}

      {tab === "flavors" &&
        (flavors.length ? (
          <div className="grid sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {flavors.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setEditItem({ item: f, kind: "flavor" })}
                className={`card p-4 text-start hover:ring-2 hover:ring-sky transition ${f.active ? "" : "opacity-50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full ring-2 ring-white shadow" style={{ background: f.color ?? "#E9ED1D" }} />
                  <p className="font-bold flex-1">{f.name}</p>
                  {!f.active && <span className="chip bg-ink-100 text-ink-500">متوقفة</span>}
                </div>
                <p className={`mt-2 text-sm tnum ${f.alert_qty && f.qty <= f.alert_qty ? "text-red-700 font-bold" : "text-ink-500"}`}>
                  المتوفر: {qty(f.qty, "g")}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<IceCreamCone />} title="لا توجد نكهات بعد">
              كل نكهة لها رصيد بالكيلو يُخصم منه تلقائياً مع كل بيع.
            </Empty>
          </div>
        ))}

      {tab === "items" &&
        (goods.length ? (
          <div className="card overflow-hidden">
            <table className="table-x">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الوحدة</th>
                  <th>المتوفر</th>
                  <th>تنبيه عند</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {goods.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => setEditItem({ item: g, kind: "item" })}
                    className={`cursor-pointer hover:bg-sky-50 ${g.active ? "" : "opacity-50"}`}
                  >
                    <td className="font-semibold">{g.name}</td>
                    <td className="text-ink-500">{g.unit === "pcs" ? "حبة" : g.unit === "ml" ? "لتر / مل" : "كجم / جرام"}</td>
                    <td className={`tnum ${g.alert_qty && g.qty <= g.alert_qty ? "text-red-700 font-bold" : ""}`}>
                      {qty(g.qty, g.unit)}
                    </td>
                    <td className="tnum text-ink-500">{g.alert_qty ? qty(g.alert_qty, g.unit) : "—"}</td>
                    <td className="text-end text-xs text-ink-400">{g.active ? "تعديل" : "متوقفة"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card">
            <Empty icon={<Package />} title="لا توجد مواد بعد">
              مثل: كوب صغير، كوب وسط، بسكويت، ملعقة، شفاطة، حليب (باللتر)، صوص شوكولاتة…
            </Empty>
          </div>
        ))}

      {tab === "extras" &&
        (extras.length ? (
          <div className="grid sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {extras.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setEditExtra(x)}
                className={`card p-4 text-start hover:ring-2 hover:ring-sky transition ${x.active ? "" : "opacity-50"}`}
              >
                <p className="font-bold">{x.name}</p>
                <p className="text-sm text-sky-700 font-semibold tnum mt-1">+{money(x.price)}</p>
                {x.stock_item_id && (
                  <p className="text-[11px] text-ink-400 mt-1">
                    يستهلك {qty(x.qty, itemName.get(x.stock_item_id)?.unit ?? "pcs")} من{" "}
                    {itemName.get(x.stock_item_id)?.name}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<CupSoda />} title="لا توجد إضافات">
              اختياري: صوص، مكسرات، كريمة… تُضاف لأي صنف بسعر إضافي.
            </Empty>
          </div>
        ))}

      {editProduct && (
        <ProductEditor
          product={editProduct === "new" ? null : editProduct}
          items={items}
          categories={categories}
          scoopGrams={scoopGrams}
          onClose={() => setEditProduct(null)}
        />
      )}
      {editItem && <StockItemEditor item={editItem.item} kind={editItem.kind} onClose={() => setEditItem(null)} />}
      {editExtra && (
        <ExtraEditor extra={editExtra === "new" ? null : editExtra} items={items} onClose={() => setEditExtra(null)} />
      )}
    </Page>
  );
}
