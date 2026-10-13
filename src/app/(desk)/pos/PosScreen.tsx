"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Landmark,
  Lock,
  Minus,
  Plus,
  Printer,
  Scale,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createOrderAction } from "@/actions/sales";
import EntryDialog from "@/components/EntryDialog";
import Keypad from "@/components/Keypad";
import { ReceiptSlip } from "@/components/slips";
import { Empty, Modal, PrintPortal } from "@/components/ui";
import { grams, money, num, qty as fmtQty } from "@/lib/format";
import { printSlip } from "@/lib/print";
import { clock } from "@/lib/time";
import {
  SHIFT_LABEL,
  type Payment,
  type PosCatalog,
  type Product,
  type Receipt,
  type ShiftInfo,
  type Shop,
  type StockLevel,
} from "@/lib/types";
import { cartTotal, linePrice, maxFlavors, missing, toPayload, useCart, type CartLine } from "@/store/cart";

export default function PosScreen({
  catalog,
  shop,
  shift,
  lowStock,
  canExpense,
  canProducts,
  expenseCategories,
}: {
  catalog: PosCatalog;
  shop: Shop;
  shift: ShiftInfo;
  lowStock: StockLevel[];
  canExpense: boolean;
  canProducts: boolean;
  expenseCategories: string[];
}) {
  const router = useRouter();
  const cart = useCart();
  const active = cart.lines.find((l) => l.uid === cart.activeUid) ?? null;
  const total = cartTotal(cart.lines);
  const ready = cart.lines.length > 0 && cart.lines.every((l) => !missing(l));

  const [cat, setCat] = useState<string>("");
  const [payOpen, setPayOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [lowOpen, setLowOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const printedFor = useRef<string | null>(null);

  const categories = useMemo(
    () => [...new Set(catalog.products.map((p) => p.category).filter(Boolean))],
    [catalog.products]
  );
  const products = cat ? catalog.products.filter((p) => p.category === cat) : catalog.products;
  const lowIds = new Set(lowStock.map((s) => s.id));

  // صنف بالوزن يطلب الوزن فوراً | a weighed product asks for its weight at once
  const needsWeight = !!active && active.product.pricing === "weight" && !active.weight_g;
  useEffect(() => {
    if (needsWeight) setWeightOpen(true);
  }, [needsWeight, cart.activeUid]);

  // اطبع مرة واحدة لكل فاتورة | print once per receipt
  useEffect(() => {
    if (!receipt || printedFor.current === receipt.order_id) return;
    printedFor.current = receipt.order_id;
    const t = setTimeout(async () => {
      const r = await printSlip();
      if (!r.ok) setNotice({ ok: false, text: `لم تُطبع الفاتورة: ${r.error ?? "تحقق من الطابعة"}` });
    }, 60);
    return () => clearTimeout(t);
  }, [receipt]);

  const pay = useCallback(
    (payment: Payment, paid: number | null) => {
      setError(null);
      start(async () => {
        const res = await createOrderAction(toPayload(useCart.getState().lines), payment, paid);
        if (res.ok) {
          setReceipt(res.data);
          cart.clear();
          setPayOpen(false);
          setNotice({
            ok: true,
            text:
              res.data.change && res.data.change > 0
                ? `تم البيع #${num(res.data.number)} — الباقي للزبون ${money(res.data.change)}`
                : `تم البيع #${num(res.data.number)} ✓`,
          });
          router.refresh(); // stock badges
        } else {
          setError(res.error);
        }
      });
    },
    [cart, router]
  );

  // Enter = الدفع، Esc = مسح الطلب | keyboard: Enter pays, Esc clears
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (payOpen || weightOpen || expenseOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Enter" && ready && !pending) {
        e.preventDefault();
        setPayOpen(true);
      } else if (e.key === "Escape" && cart.lines.length) {
        e.preventDefault();
        cart.clear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, weightOpen, expenseOpen, ready, pending, cart]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.ok ? 6000 : 15000);
    return () => clearTimeout(t);
  }, [notice]);

  const max = active ? maxFlavors(active) : 0;

  return (
    <div className="h-dvh flex flex-col">
      {/* ================= الشريط العلوي | top bar ================= */}
      <header className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-ink-100">
        <div className="flex items-center gap-2 rounded-2xl bg-sky-50 ring-1 ring-sky-100 px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold">{SHIFT_LABEL[shift.kind]}</span>
          <span className="text-xs text-ink-400">
            منذ {clock(shift.opened_at)} · {shift.opened_by}
          </span>
        </div>

        {lowStock.length > 0 && (
          <div className="relative">
            <button type="button" onClick={() => setLowOpen((o) => !o)} className="btn bg-red-600 text-white px-3 py-1.5 text-sm">
              <AlertTriangle size={16} /> نقص مخزون ({num(lowStock.length)})
            </button>
            {lowOpen && (
              <div className="absolute top-full mt-2 start-0 w-72 card p-3 z-40 animate-pop">
                <p className="label mb-2">تحتاج توريد</p>
                <ul className="space-y-1.5 max-h-72 overflow-auto">
                  {lowStock.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 text-sm bg-red-50 rounded-xl px-3 py-2">
                      <span className="font-semibold">{s.name}</span>
                      <span className="tnum text-red-700 font-bold">{fmtQty(s.qty, s.unit)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {canExpense && (
          <button type="button" onClick={() => setExpenseOpen(true)} className="btn-soft px-3.5 py-2 text-sm">
            <Wallet size={16} /> تسجيل مصروف
          </button>
        )}
        <Link href="/close" className="btn-dark px-4 py-2 text-sm">
          <Lock size={16} /> تقفيل الوردية
        </Link>
      </header>

      {/* ================= المساحة الرئيسية | main ================= */}
      <div className="flex-1 grid grid-cols-[1fr_370px] min-h-0">
        <section className="overflow-auto p-4 space-y-4 min-h-0">
          {catalog.products.length === 0 ? (
            <div className="card">
              <Empty icon={<Plus />} title="لا توجد أصناف للبيع بعد">
                {canProducts ? (
                  <Link href="/products" className="text-sky-700 font-semibold underline">
                    أضف الأصناف والنكهات من صفحة «الأصناف»
                  </Link>
                ) : (
                  "اطلب من المدير إضافة الأصناف"
                )}
              </Empty>
            </div>
          ) : (
            <>
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {["", ...categories].map((c) => (
                    <button
                      key={c || "all"}
                      type="button"
                      onClick={() => setCat(c)}
                      className={`btn px-4 py-2 text-sm ${cat === c ? "bg-ink text-white" : "bg-white ring-1 ring-ink-100 text-ink"}`}
                    >
                      {c || "الكل"}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {products.map((p) => (
                  <ProductButton key={p.id} p={p} onClick={() => cart.start(p)} />
                ))}
              </div>

              {active && (
                <div className="card p-4 space-y-4 ring-2 ring-sky-200 animate-rise" key={active.uid}>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-lg">{active.product.name}</h2>
                    {active.size && <span className="chip bg-sky text-ink">{active.size.name}</span>}
                    {active.weight_g ? <span className="chip bg-sky text-ink tnum">{grams(active.weight_g)}</span> : null}
                    <div className="flex-1" />
                    <span className="font-bold tnum text-sky-700">{money(linePrice(active))}</span>
                  </div>

                  {/* الحجم | size */}
                  {active.product.pricing === "size" && active.product.sizes.length > 1 && (
                    <div>
                      <p className="label mb-1.5">الحجم</p>
                      <div className="flex flex-wrap gap-2">
                        {active.product.sizes.map((z) => (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => cart.setSize(z)}
                            className={`btn px-5 py-3 text-base ring-2 ${
                              active.size?.id === z.id ? "bg-sky ring-ink text-ink" : "bg-white ring-ink-100"
                            }`}
                          >
                            <span>{z.name}</span>
                            <span className="text-sm tnum opacity-70">{money(z.price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {active.product.pricing === "weight" && (
                    <button type="button" onClick={() => setWeightOpen(true)} className="btn-soft px-4 py-2.5">
                      <Scale size={18} /> {active.weight_g ? `الوزن: ${grams(active.weight_g)} — تغيير` : "أدخل الوزن"}
                    </button>
                  )}

                  {/* النكهات | flavors */}
                  {max > 0 && (
                    <div>
                      <p className="label mb-1.5">
                        النكهات — {max === 1 ? "اختر نكهة" : `اختر حتى ${num(max)}`}{" "}
                        <span className="text-ink tnum">({num(active.flavors.length)}/{num(max)})</span>
                      </p>
                      {catalog.flavors.length ? (
                        <div className="grid grid-cols-4 xl:grid-cols-6 gap-2">
                          {catalog.flavors.map((f) => {
                            const picked = active.flavors.some((x) => x.id === f.id);
                            const blocked = !picked && active.flavors.length >= max && max > 1;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                disabled={blocked}
                                onClick={() => cart.toggleFlavor(f)}
                                className={`btn relative py-3 px-2 text-sm ring-2 ${
                                  picked ? "bg-sky ring-ink text-ink" : "bg-white ring-ink-100 text-ink"
                                }`}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10 shrink-0"
                                  style={{ background: f.color ?? "#eee" }}
                                />
                                <span className="truncate">{f.name}</span>
                                {lowIds.has(f.id) && (
                                  <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-600" title="نقص" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-700">لا توجد نكهات — أضفها من صفحة الأصناف.</p>
                      )}
                    </div>
                  )}

                  {/* الإضافات | extras */}
                  {catalog.extras.length > 0 && (
                    <div>
                      <p className="label mb-1.5">إضافات (اختياري)</p>
                      <div className="flex flex-wrap gap-2">
                        {catalog.extras.map((x) => {
                          const picked = active.extras.some((e) => e.id === x.id);
                          return (
                            <button
                              key={x.id}
                              type="button"
                              onClick={() => cart.toggleExtra(x)}
                              className={`btn px-3.5 py-2 text-sm ring-2 ${
                                picked ? "bg-lemon ring-ink" : "bg-white ring-ink-100"
                              }`}
                            >
                              {x.name}
                              <span className="text-xs tnum opacity-70">+{num(x.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* ================= السلة | cart ================= */}
        <aside className="bg-white border-s border-ink-100 flex flex-col min-h-0">
          <div className="px-4 py-3 flex items-center justify-between border-b border-ink-100">
            <h2 className="font-bold">الطلب {cart.lines.length > 0 && <span className="text-ink-400 tnum">({num(cart.lines.length)})</span>}</h2>
            {cart.lines.length > 0 && (
              <button type="button" onClick={cart.clear} className="btn-ghost px-2 py-1 text-xs text-red-700">
                <Trash2 size={14} /> مسح الكل (Esc)
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {!cart.lines.length && <p className="text-center text-sm text-ink-300 py-16">اختر صنفاً للبدء</p>}
            {cart.lines.map((l) => (
              <CartRow key={l.uid} l={l} active={l.uid === cart.activeUid} />
            ))}
          </div>

          <div className="p-4 border-t border-ink-100 space-y-3">
            <div className="flex items-end justify-between">
              <span className="font-semibold text-ink-500">الإجمالي</span>
              <span className="text-4xl font-bold tnum">{money(total)}</span>
            </div>
            {error && <p className="text-xs font-semibold text-red-700 bg-red-50 rounded-xl p-2.5 text-center">{error}</p>}
            <button
              type="button"
              disabled={!ready || pending}
              onClick={() => setPayOpen(true)}
              className="btn-go w-full py-5 text-xl"
            >
              {pending ? "جاري الحفظ…" : "الدفع والطباعة ⏎"}
            </button>
            {receipt && (
              <button type="button" onClick={() => void printSlip()} className="btn-soft w-full py-2.5 text-sm">
                <Printer size={16} /> إعادة طباعة فاتورة #{num(receipt.number)}
              </button>
            )}
          </div>
        </aside>
      </div>

      {notice && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3 shadow-lift animate-rise flex items-center gap-3 text-base font-semibold ${
            notice.ok ? "bg-ink text-white" : "bg-red-600 text-white"
          }`}
        >
          {notice.ok ? <CheckCircle2 className="text-lemon" /> : <AlertTriangle />}
          {notice.text}
          {!notice.ok && (
            <button type="button" className="btn bg-white/15 px-3 py-1 text-sm" onClick={() => window.print()}>
              طباعة يدوية
            </button>
          )}
          <button type="button" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {weightOpen && active && active.product.pricing === "weight" && (
        <WeightDialog
          pricePerKg={active.product.price_per_kg ?? 0}
          initial={active.weight_g}
          onCancel={() => {
            if (!active.weight_g) cart.remove(active.uid);
            setWeightOpen(false);
          }}
          onConfirm={(g) => {
            cart.setWeight(g);
            setWeightOpen(false);
          }}
        />
      )}
      {payOpen && <PayDialog total={total} pending={pending} error={error} onCancel={() => setPayOpen(false)} onPay={pay} />}
      {expenseOpen && (
        <EntryDialog kind="expense" shiftOpen used={expenseCategories} onClose={() => setExpenseOpen(false)} />
      )}

      <PrintPortal>{receipt && <ReceiptSlip r={receipt} shop={shop} />}</PrintPortal>
    </div>
  );
}

function ProductButton({ p, onClick }: { p: Product; onClick: () => void }) {
  const prices = p.sizes.map((s) => s.price);
  const price =
    p.pricing === "weight"
      ? `${money(p.price_per_kg)} / كجم`
      : prices.length === 1
        ? money(prices[0])
        : `${money(Math.min(...prices))} – ${num(Math.max(...prices))}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn flex-col items-stretch text-start p-0 overflow-hidden bg-white ring-1 ring-ink-100 hover:ring-2 hover:ring-sky shadow-sm"
    >
      <span className="h-2" style={{ background: p.color ?? "#00ADEF" }} />
      <span className="px-3 pt-2 pb-2.5">
        <span className="block font-bold text-base leading-tight">{p.name}</span>
        <span className="block text-xs text-ink-500 tnum mt-1">{price}</span>
      </span>
    </button>
  );
}

function CartRow({ l, active }: { l: CartLine; active: boolean }) {
  const cart = useCart();
  const need = missing(l);
  return (
    <div
      onClick={() => cart.setActive(l.uid)}
      className={`rounded-2xl p-3 cursor-pointer ring-2 transition ${active ? "ring-sky bg-sky-50" : "ring-transparent bg-ink-50/70"}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight">
            {l.product.name}
            {l.size && <span className="text-ink-500"> — {l.size.name}</span>}
            {l.weight_g ? <span className="text-ink-500 tnum"> — {grams(l.weight_g)}</span> : null}
          </p>
          {l.flavors.length > 0 && <p className="text-xs text-ink-500 truncate mt-0.5">{l.flavors.map((f) => f.name).join(" + ")}</p>}
          {l.extras.length > 0 && <p className="text-xs text-sky-700 truncate">+ {l.extras.map((e) => e.name).join(" + ")}</p>}
          {need && (
            <p className="text-xs font-bold text-amber-700 mt-1">
              {need === "size" ? "اختر الحجم" : need === "weight" ? "أدخل الوزن" : "اختر النكهة"}
            </p>
          )}
        </div>
        <div className="text-end shrink-0">
          <p className="font-bold tnum text-sm">{money(linePrice(l))}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cart.setQty(l.uid, l.qty - 1);
              }}
              className="w-7 h-7 rounded-lg bg-white ring-1 ring-ink-100 grid place-items-center"
              aria-label="إنقاص"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center font-bold tnum text-sm">{num(l.qty)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cart.setQty(l.uid, l.qty + 1);
              }}
              className="w-7 h-7 rounded-lg bg-white ring-1 ring-ink-100 grid place-items-center"
              aria-label="زيادة"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cart.remove(l.uid);
              }}
              className="w-7 h-7 rounded-lg bg-red-50 text-red-700 grid place-items-center"
              aria-label="حذف"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightDialog({
  pricePerKg,
  initial,
  onConfirm,
  onCancel,
}: {
  pricePerKg: number;
  initial: number | null;
  onConfirm: (g: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial ? String(initial) : "");
  const g = Number(val || 0);
  return (
    <Modal title="الوزن بالجرام" onClose={onCancel}>
      <div className="rounded-2xl bg-ink-50 ring-1 ring-ink-100 p-4 text-center">
        <p className="text-3xl font-bold tnum">
          {num(g)} <span className="text-base">جرام</span>
        </p>
        <p className="font-semibold text-sky-700 tnum mt-1">{money(Math.round((pricePerKg * g) / 10) / 100)}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[250, 500, 750, 1000].map((x) => (
          <button key={x} type="button" onClick={() => setVal(String(x))} className="btn-soft py-2.5 text-sm tnum">
            {x >= 1000 ? "1 كجم" : `${x} جم`}
          </button>
        ))}
      </div>
      <Keypad
        value={val}
        onChange={setVal}
        maxLength={5}
        onEnter={() => g > 0 && onConfirm(g)}
        enterLabel="تأكيد الوزن"
        enterDisabled={g <= 0}
      />
    </Modal>
  );
}

function PayDialog({
  total,
  pending,
  error,
  onPay,
  onCancel,
}: {
  total: number;
  pending: boolean;
  error: string | null;
  onPay: (p: Payment, paid: number | null) => void;
  onCancel: () => void;
}) {
  const [paid, setPaid] = useState("");
  const paidNum = Number(paid || 0);
  const change = Math.round((paidNum - total) * 100) / 100;
  return (
    <Modal title="الدفع" onClose={onCancel} size="lg">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div className="rounded-2xl bg-ink-800 text-white p-5 text-center">
            <p className="text-xs text-ink-300 font-semibold">المطلوب</p>
            <p className="text-5xl font-bold tnum mt-1 text-lemon">{money(total)}</p>
          </div>
          <button type="button" disabled={pending} onClick={() => onPay("cash", total)} className="btn-go w-full py-5 text-lg">
            <Banknote /> نقدي — المبلغ بالضبط ⏎
          </button>
          <button type="button" disabled={pending} onClick={() => onPay("bank", null)} className="btn-sky w-full py-4 text-base">
            <Landmark size={20} /> تحويل بنكي / بنكك
          </button>
          <div className="rounded-2xl border-2 border-dashed border-ink-200 p-3">
            <p className="label">المبلغ المستلم من الزبون</p>
            <p className="text-2xl font-bold tnum">{money(paidNum)}</p>
            {paidNum > 0 && (
              <p className={`font-bold tnum mt-1 ${change < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {change < 0 ? `ناقص ${money(Math.abs(change))}` : `الباقي للزبون: ${money(change)}`}
              </p>
            )}
          </div>
          {error && <p className="text-sm font-semibold text-red-700 bg-red-50 rounded-xl p-2.5">{error}</p>}
        </div>
        {/* فارغ = المبلغ بالضبط، فالبيع يصبح Enter ثم Enter */}
        <Keypad
          value={paid}
          onChange={setPaid}
          maxLength={9}
          allowDecimal
          onEnter={() => onPay("cash", paidNum > 0 ? paidNum : total)}
          enterLabel={paidNum > 0 ? "نقدي وطباعة" : "نقدي بالضبط وطباعة"}
          enterDisabled={pending || (paidNum > 0 && paidNum < total)}
        />
      </div>
    </Modal>
  );
}
