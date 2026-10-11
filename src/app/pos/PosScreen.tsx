"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createOrderAction, logoutAction } from "@/lib/actions";
import { money, num, weight as fmtWeight } from "@/lib/money";
import type {
  Extra, Flavor, LowStockRow, PaymentMethod, Receipt, Role, Variant, VariantKind,
} from "@/lib/types";
import { linePrice, useCart } from "@/store/cart";
import Keypad from "@/components/Keypad";
import Modal from "@/components/Modal";
import LowStockBadge from "@/components/LowStockBadge";
import ReceiptSheet from "@/components/ReceiptSheet";

const KIND_LABEL: Record<VariantKind, string> = {
  scoop: "بالسكوب",
  cup: "أكواب جاهزة",
  weight: "بالوزن",
  cone: "كون وبسكويت",
};

const KIND_ORDER: VariantKind[] = ["scoop", "cup", "weight", "cone"];

const KIND_ACCENT: Record<VariantKind, string> = {
  scoop: "border-s-berry",
  cup: "border-s-mint",
  weight: "border-s-amber-500",
  cone: "border-s-choco",
};

type Settings = {
  shop_name: string;
  phone: string | null;
  receipt_footer: string | null;
  default_scoop_grams: number;
};

export default function PosScreen({
  flavors, variants, extras, settings, lowStock, cashier, role,
}: {
  flavors: Flavor[];
  variants: Variant[];
  extras: Extra[];
  settings: Settings;
  lowStock: LowStockRow[];
  cashier: string;
  role: Role;
}) {
  const cart = useCart();
  const active = cart.lines.find((l) => l.uid === cart.activeUid) ?? null;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const printedFor = useRef<string | null>(null);

  // صنف بالوزن يطلب الوزن فوراً | a weight item asks for its weight at once
  const needsWeightNow =
    !!active && active.variant.kind === "weight" && active.weightGrams == null;
  useEffect(() => {
    if (needsWeightNow) setWeightOpen(true);
  }, [needsWeightNow, cart.activeUid]);

  // الطباعة | fire the printer once per receipt
  useEffect(() => {
    if (!receipt || printedFor.current === receipt.order_id) return;
    printedFor.current = receipt.order_id;
    const t = setTimeout(() => window.print(), 80);
    return () => clearTimeout(t);
  }, [receipt]);

  const submit = useCallback(
    (method: PaymentMethod, paid?: number | null) => {
      setError(null);
      start(async () => {
        const res = await createOrderAction(cart.toPayload(), method, 0, paid ?? null);
        if (res.ok) {
          setReceipt({ ...res.data, created_at: new Date().toISOString() });
          cart.clear();
          setPayOpen(false);
        } else {
          setError(res.error);
        }
      });
    },
    [cart]
  );

  // Enter من أي مكان = افتح الدفع | Enter anywhere opens payment
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (payOpen || weightOpen) return;
      if (e.key === "Enter" && cart.isReady() && !pending) {
        e.preventDefault();
        setPayOpen(true);
      }
      if (e.key === "Escape" && cart.lines.length) {
        e.preventDefault();
        cart.clear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, weightOpen, pending, cart]);

  const subtotal = cart.subtotal();
  const flavorLimitReached =
    !!active && active.flavors.length >= active.variant.max_flavors;

  return (
    <>
      <div className="min-h-dvh lg:h-dvh lg:overflow-hidden flex flex-col">
        {/* ============ الشريط العلوي | top bar ============ */}
        <header className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-2.5 bg-white border-b border-black/5">
          <h1 className="font-extrabold text-choco text-lg">{settings.shop_name}</h1>

          <span className="text-xs text-choco/50">الكاشير: {cashier}</span>

          <div className="flex-1" />

          <LowStockBadge rows={lowStock} />

          {role === "manager" && (
            <>
              <Link href="/inventory" className="btn px-3 py-2 text-sm bg-cream text-choco border border-black/10">
                المخزون
              </Link>
              <Link href="/reports" className="btn px-3 py-2 text-sm bg-cream text-choco border border-black/10">
                التقارير
              </Link>
            </>
          )}

          <Link href="/close" className="btn px-3 py-2 text-sm bg-choco text-white">
            تقفيل الوردية
          </Link>

          <form action={logoutAction}>
            <button type="submit" className="btn px-3 py-2 text-sm text-choco/50">
              خروج
            </button>
          </form>
        </header>

        {/* ============ المساحة الرئيسية | main area ============ */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3 p-3 min-h-0">
          {/* ---- الأصناف والنكهات | products + flavors ---- */}
          <section className="space-y-3 lg:overflow-auto min-h-0 lg:pe-1">
            {/* الأصناف | product buttons — one compact grid, colour-coded by kind */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {KIND_ORDER.flatMap((kind) => variants.filter((v) => v.kind === kind)).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => cart.startLine(v)}
                  className={`btn px-3 py-2.5 bg-white border-2 border-black/5 border-s-[6px] ${KIND_ACCENT[v.kind]} text-choco text-start hover:bg-berry/5`}
                >
                  <span className="block text-[10px] font-bold text-choco/40 leading-none mb-1">{KIND_LABEL[v.kind]}</span>
                  <span className="block font-bold text-base leading-tight">{v.name_ar}</span>
                  <span className="block text-sm text-berry font-bold tnum mt-0.5">
                    {v.kind === "weight" ? `${money(v.price_per_kg)} / كجم` : money(v.price)}
                  </span>
                </button>
              ))}
            </div>

            {/* النكهات | flavors */}
            <div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h2 className="text-xs font-bold text-choco/40">النكهات</h2>
                {active ? (
                  <span className="text-xs text-choco/50">
                    {active.variant.name_ar} — اختر حتى {num(active.variant.max_flavors)}
                    {flavorLimitReached && (
                      <span className="text-amber-600 font-bold"> (وصلت الحد)</span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-bold">
                    اختر الصنف أولاً ↑
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                {flavors.map((f) => {
                  const picked = !!active?.flavors.some((x) => x.id === f.id);
                  const low = Number(f.stock_grams) <= Number(f.low_stock_grams);
                  const blocked = !active || (!picked && flavorLimitReached);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={blocked}
                      onClick={() => cart.toggleFlavor(f)}
                      className={`btn relative px-2 py-3.5 text-sm border-2 ${
                        picked
                          ? "border-berry bg-berry text-white"
                          : "border-black/5 bg-white text-choco"
                      }`}
                      style={!picked ? { backgroundColor: f.color + "40" } : undefined}
                    >
                      {low && (
                        <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-red-600" />
                      )}
                      <span className="font-bold leading-tight">{f.name_ar}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* الإضافات | extras */}
            <div>
              <h2 className="text-xs font-bold text-choco/40 mb-1.5">الإضافات</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                {extras.map((x) => {
                  const picked = !!active?.extras.some((e) => e.id === x.id);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      disabled={!active}
                      onClick={() => cart.toggleExtra(x)}
                      className={`btn px-2 py-3 text-sm border-2 ${
                        picked
                          ? "border-mint bg-mint text-white"
                          : "border-black/5 bg-white text-choco"
                      }`}
                    >
                      <span className="block font-bold leading-tight">{x.name_ar}</span>
                      <span className="block text-xs tnum opacity-70">+{money(x.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- السلة | cart ---- */}
          <aside className="bg-white rounded-3xl shadow-sm flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
              <h2 className="font-extrabold text-choco">الطلب</h2>
              {!!cart.lines.length && (
                <button
                  type="button"
                  onClick={cart.clear}
                  className="text-xs text-red-600 font-bold"
                >
                  إلغاء الكل
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-2">
              {!cart.lines.length && (
                <p className="text-center text-sm text-choco/30 py-12">
                  اختر صنفاً للبدء
                </p>
              )}

              {cart.lines.map((l) => {
                const isActive = l.uid === cart.activeUid;
                const needsFlavor = !l.flavors.length;
                const needsWeight = l.variant.kind === "weight" && !l.weightGrams;
                return (
                  <div
                    key={l.uid}
                    onClick={() => cart.setActive(l.uid)}
                    className={`rounded-2xl p-3 border-2 cursor-pointer ${
                      isActive ? "border-berry bg-berry/5" : "border-black/5 bg-cream"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-choco text-sm">
                          {l.variant.name_ar}
                          {l.weightGrams ? ` — ${fmtWeight(l.weightGrams)}` : ""}
                        </p>
                        <p className="text-xs text-choco/60 truncate">
                          {l.flavors.map((f) => f.name_ar).join(" + ") || "—"}
                        </p>
                        {!!l.extras.length && (
                          <p className="text-xs text-mint truncate">
                            + {l.extras.map((e) => e.name_ar).join(" + ")}
                          </p>
                        )}
                        {(needsFlavor || needsWeight) && (
                          <p className="text-xs font-bold text-amber-600 mt-1">
                            {needsWeight ? "أدخل الوزن" : "اختر النكهة"}
                          </p>
                        )}
                      </div>

                      <div className="text-end shrink-0">
                        <p className="font-extrabold text-choco tnum text-sm">
                          {money(linePrice(l))}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5 justify-end">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); cart.setQty(l.uid, l.qty - 1); }}
                            className="w-7 h-7 rounded-lg bg-white border border-black/10 font-bold"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-bold tnum text-sm">{num(l.qty)}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); cart.setQty(l.uid, l.qty + 1); }}
                            className="w-7 h-7 rounded-lg bg-white border border-black/10 font-bold"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); cart.removeLine(l.uid); }}
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-600 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* الإجمالي والدفع | total + pay */}
            <div className="p-4 border-t border-black/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-choco/60">الإجمالي</span>
                <span className="text-3xl font-extrabold text-berry tnum">
                  {money(subtotal)}
                </span>
              </div>

              {error && (
                <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-2.5 text-center">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={!cart.isReady() || pending}
                onClick={() => setPayOpen(true)}
                className="btn w-full py-5 text-xl bg-mint text-white"
              >
                {pending ? "جاري الحفظ…" : "دفع وطباعة ⏎"}
              </button>

              {receipt && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn w-full py-2.5 text-sm bg-cream text-choco border border-black/10"
                >
                  إعادة طباعة فاتورة #{num(receipt.order_no)}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ============ نافذة الوزن | weight dialog ============ */}
      {weightOpen && active && (
        <WeightDialog
          pricePerKg={Number(active.variant.price_per_kg ?? 0)}
          onCancel={() => {
            cart.removeLine(active.uid);
            setWeightOpen(false);
          }}
          onConfirm={(grams) => {
            cart.setWeight(grams);
            setWeightOpen(false);
          }}
        />
      )}

      {/* ============ نافذة الدفع | payment dialog ============ */}
      {payOpen && (
        <PayDialog
          total={subtotal}
          pending={pending}
          onCancel={() => setPayOpen(false)}
          onPay={submit}
        />
      )}

      {/* القسيمة المخفية — تظهر عند الطباعة فقط */}
      <ReceiptSheet
        receipt={receipt}
        shopName={settings.shop_name}
        phone={settings.phone}
        footer={settings.receipt_footer}
      />
    </>
  );
}

// ---------------------------------------------------------------------
// إدخال الوزن | weight entry (grams)
// ---------------------------------------------------------------------
function WeightDialog({
  pricePerKg, onConfirm, onCancel,
}: {
  pricePerKg: number;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("");
  const grams = Number(val || 0);
  const price = Math.round(((pricePerKg * grams) / 1000) * 100) / 100;

  return (
    <Modal title="الوزن بالجرام" onClose={onCancel}>
      <div className="h-20 rounded-2xl bg-cream border-2 border-black/10 grid place-items-center">
        <span className="text-3xl font-extrabold text-choco tnum">
          {num(grams)} <span className="text-base font-bold">جرام</span>
        </span>
      </div>
      <p className="text-center font-bold text-berry tnum">{money(price)}</p>

      {/* أوزان جاهزة | quick weights */}
      <div className="grid grid-cols-4 gap-2">
        {[250, 500, 750, 1000].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setVal(String(g))}
            className="btn py-3 text-sm bg-cream border-2 border-black/10 text-choco tnum"
          >
            {g >= 1000 ? "1 كجم" : `${g} جم`}
          </button>
        ))}
      </div>

      <Keypad
        value={val}
        onChange={setVal}
        maxLength={6}
        onEnter={() => grams > 0 && onConfirm(grams)}
        enterLabel="تأكيد الوزن"
        enterDisabled={grams <= 0}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// الدفع | payment
// ---------------------------------------------------------------------
function PayDialog({
  total, pending, onPay, onCancel,
}: {
  total: number;
  pending: boolean;
  onPay: (method: PaymentMethod, paid?: number | null) => void;
  onCancel: () => void;
}) {
  const [paid, setPaid] = useState("");
  const paidNum = Number(paid || 0);
  const change = Math.round((paidNum - total) * 100) / 100;

  return (
    <Modal title="الدفع" onClose={onCancel} wide>
      <div className="grid md:grid-cols-2 gap-4">
        {/* المبلغ والدفع السريع | amount + one-tap payments */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-cream border-2 border-black/10 p-4 text-center">
            <p className="text-xs font-bold text-choco/50">المطلوب</p>
            <p className="text-4xl font-extrabold text-berry tnum">{money(total)}</p>
          </div>

          {/* نقدي سريع — المبلغ بالضبط | exact cash, one click */}
          <button
            type="button"
            disabled={pending}
            onClick={() => onPay("cash", total)}
            className="btn w-full py-5 text-xl bg-mint text-white"
          >
            نقدي — المبلغ بالضبط ⏎
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onPay("card", null)}
              className="btn py-4 text-base bg-choco text-white"
            >
              بطاقة
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPay("wallet", null)}
              className="btn py-4 text-base bg-choco/80 text-white"
            >
              محفظة
            </button>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-black/10 p-3 space-y-1">
            <p className="text-xs font-bold text-choco/50">المبلغ المستلم</p>
            <p className="text-2xl font-extrabold text-choco tnum">{money(paidNum)}</p>
            {paidNum > 0 && (
              <p className={`font-bold tnum ${change < 0 ? "text-red-600" : "text-mint"}`}>
                {change < 0 ? `ناقص ${money(Math.abs(change))}` : `الباقي ${money(change)}`}
              </p>
            )}
          </div>
        </div>

        {/* لوحة الأرقام لحساب الباقي | keypad for change */}
        <Keypad
          value={paid}
          onChange={setPaid}
          maxLength={9}
          allowDecimal
          // فارغ = المبلغ بالضبط، فيصبح البيع: Enter ثم Enter
          // empty = exact amount, so a sale is just Enter, Enter
          onEnter={() => onPay("cash", paidNum > 0 ? paidNum : total)}
          enterLabel={paidNum > 0 ? "نقدي وطباعة" : "نقدي بالضبط وطباعة"}
          enterDisabled={pending || (paidNum > 0 && paidNum < total)}
        />
      </div>
    </Modal>
  );
}
