"use client";

import {
  CloudDownload,
  CloudOff,
  CloudUpload,
  Download,
  FolderOpen,
  HardDrive,
  Printer,
  RefreshCw,
  Settings as SettingsIcon,
  Store,
  Usb,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveShopAction } from "@/actions/manage";
import {
  backupNowAction,
  disconnectCloudAction,
  restoreCloudAction,
  restoreFileAction,
  saveCloudAction,
  setBackupDirAction,
  syncNowAction,
} from "@/actions/system";
import { Card, Page, PageHeader } from "@/components/Page";
import { PrintButton } from "@/components/PrintHost";
import { ReceiptSlip } from "@/components/slips";
import { ErrorNote, Field, Modal, NumInput, OkNote, Segmented, Toggle, useAction } from "@/components/ui";
import { num } from "@/lib/format";
import { useIsDesktop, type PrintMode, type UpdateState } from "@/lib/print";
import { stamp } from "@/lib/time";
import type { Receipt, Shop } from "@/lib/types";

type BackupInfo = {
  dir: string;
  extraDir: string | null;
  last: string | null;
  lastError: string | null;
  files: { name: string; path: string; size: number; at: string }[];
};
type SyncInfo = {
  configured: boolean;
  url: string;
  last_sync_at: string | null;
  last_error: string | null;
  pending_rows: number;
  pending_reports: number;
};

const SAMPLE: Receipt = {
  order_id: "sample",
  number: 128,
  created_at: "2026-07-01T17:30:00.000Z", // fixed, so server and browser render the same text
  cashier: "الكاشير",
  payment: "cash",
  total: 4300,
  paid: 5000,
  change: 700,
  items: [
    { name: "آيس كريم كوب", size: "بولتين", qty: 1, unit_price: 1800, line_total: 1800, weight_g: null, flavors: ["فانيلا", "شوكولاتة"], extras: [] },
    { name: "ميلك شيك", size: "وسط", qty: 1, unit_price: 2500, line_total: 2500, weight_g: null, flavors: ["فراولة"], extras: ["كريمة"] },
  ],
};

export default function Settings({
  shop,
  version,
  backup,
  sync,
}: {
  shop: Shop;
  version: string;
  backup: BackupInfo;
  sync: SyncInfo;
}) {
  return (
    <Page>
      <PageHeader title="الإعدادات" sub={`JAC ICE POS — الإصدار ${version}`} icon={<SettingsIcon size={24} />} />
      <ShopCard shop={shop} />
      <PrinterCard shop={shop} />
      <BackupCard b={backup} />
      <CloudCard s={sync} />
      <UpdatesCard version={version} />
    </Page>
  );
}

// --- بيانات المحل | shop -------------------------------------------------------

function ShopCard({ shop }: { shop: Shop }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: shop.name,
    phone: shop.phone ?? "",
    address: shop.address ?? "",
    footer: shop.footer ?? "",
    scoop_grams: String(shop.scoop_grams),
  });
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const set = (k: keyof typeof f) => (v: string) => {
    setSaved(false);
    setF((x) => ({ ...x, [k]: v }));
  };
  const preview: Shop = { ...shop, ...f, scoop_grams: Number(f.scoop_grams) || 60 };

  return (
    <Card title={<span className="flex items-center gap-2"><Store size={18} /> بيانات المحل والفاتورة</span>}>
      <div className="grid lg:grid-cols-[1fr_auto] gap-6">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveShopAction(f), () => {
              setSaved(true);
              router.refresh();
            });
          }}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="اسم المحل">
              <input className="input" value={f.name} onChange={(e) => set("name")(e.target.value)} />
            </Field>
            <Field label="رقم الهاتف">
              <input className="input" dir="ltr" value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
            </Field>
          </div>
          <Field label="العنوان">
            <input className="input" value={f.address} onChange={(e) => set("address")(e.target.value)} />
          </Field>
          <Field label="تذييل الفاتورة" hint="يظهر أسفل كل فاتورة — يمكن كتابة أكثر من سطر">
            <textarea className="input min-h-20" value={f.footer} onChange={(e) => set("footer")(e.target.value)} />
          </Field>
          <Field label="وزن البولة الافتراضي (جرام)" hint="يُخصم من النكهة لكل بولة — يمكن تغييره لكل صنف">
            <NumInput value={f.scoop_grams} onChange={set("scoop_grams")} suffix="جم" />
          </Field>
          <ErrorNote error={error} />
          {saved && <OkNote>تم الحفظ ✓</OkNote>}
          <button type="submit" disabled={pending} className="btn-go px-6 py-3">
            {pending ? "جاري الحفظ…" : "حفظ"}
          </button>
        </form>
        <div>
          <p className="label mb-2">معاينة الفاتورة</p>
          <div className="bg-ink-50 rounded-2xl p-3">
            <div className="bg-white shadow-card rounded-lg">
              <ReceiptSlip r={SAMPLE} shop={preview} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// --- الطابعة | printer ----------------------------------------------------------

function PrinterCard({ shop }: { shop: Shop }) {
  const [printers, setPrinters] = useState<
    { name: string; displayName: string; isDefault: boolean; virtual?: boolean; receipt?: boolean }[]
  >([]);
  const [printer, setPrinter] = useState<string>("");
  const [mode, setMode] = useState<PrintMode>("auto");
  const [drawer, setDrawer] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [setup, setSetup] = useState<{ busy: boolean; ok?: string; error?: string }>({ busy: false });
  const desktop = useIsDesktop();

  const load = () => {
    if (!window.desktop) return;
    void window.desktop.listPrinters().then(setPrinters);
    void window.desktop.getConfig().then((c) => {
      setPrinter(c.printer ?? "");
      setMode(c.printMode ?? "auto");
      setDrawer(!!c.drawer);
      setFullscreen(c.fullscreen);
    });
  };
  useEffect(load, []);

  const chosen = printers.find((p) => p.name === printer);
  const receipts = printers.filter((p) => p.receipt);

  return (
    <Card title={<span className="flex items-center gap-2"><Printer size={18} /> الطابعة والشاشة</span>}>
      {!desktop ? (
        <p className="text-sm text-ink-400">إعدادات الطابعة متاحة داخل برنامج اللابتوب.</p>
      ) : (
        <div className="space-y-4">
          <Field label="طابعة الفواتير" hint="اختر طابعة الفواتير (عليها 🧾) — الطباعة تتم مباشرة بدون نافذة">
            <select
              className="input"
              value={printer}
              onChange={async (e) => {
                setPrinter(e.target.value);
                await window.desktop?.setConfig({ printer: e.target.value || null });
              }}
            >
              <option value="">— اختر طابعة الفواتير —</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.receipt ? "🧾 " : ""}
                  {p.displayName || p.name}
                  {p.isDefault ? " (الافتراضية في ويندوز)" : ""}
                  {p.virtual ? " — ليست طابعة فواتير" : ""}
                </option>
              ))}
            </select>
          </Field>
          {chosen?.virtual && (
            <ErrorNote error={`«${chosen.displayName || chosen.name}» تحفظ ملفاً ولا تطبع على الورق — اختر طابعة الفواتير.`} />
          )}

          {/* إعداد الطابعة بدون تعريف | set the printer up with no driver download */}
          <div className="rounded-2xl ring-1 ring-sky-200 bg-sky-50 p-4 space-y-2">
            <p className="font-semibold text-sm">
              {receipts.length ? "طابعة الفواتير لا تطبع جيداً؟" : "لا تظهر طابعة الفواتير؟"} إعدادها بدون تعريف
            </p>
            <p className="text-xs text-ink-500">
              صِل الطابعة بـ USB وشغّلها، ثم اضغط الزر. يضيف البرنامج طابعة «JAC ICE Receipt» بتعريف ويندوز المدمج
              ويطبع عليها مباشرة بلغة الطابعة (ESC/POS) — يعمل مع Rongta و Xprinter ومعظم طابعات الفواتير 80 مم، مع القص التلقائي.
            </p>
            <button
              type="button"
              disabled={setup.busy}
              onClick={async () => {
                setSetup({ busy: true });
                const r = await window.desktop!.setupReceiptPrinter();
                setSetup(r.ok ? { busy: false, ok: `تمت الإضافة على المنفذ ${r.port} ✓ — اضغط «طباعة فاتورة تجربة»` } : { busy: false, error: r.error });
                load();
              }}
              className="btn-go px-4 py-2.5 text-sm"
            >
              {setup.busy ? "جاري الإعداد…" : "إعداد طابعة الفواتير تلقائياً"}
            </button>
            {setup.ok && <OkNote>{setup.ok}</OkNote>}
            <ErrorNote error={setup.error ?? null} />
          </div>

          <div className="space-y-1.5">
            <span className="label block">طريقة الطباعة</span>
            <Segmented<PrintMode>
              value={mode}
              onChange={async (v) => {
                setMode(v);
                await window.desktop?.setConfig({ printMode: v });
              }}
              options={[
                { value: "auto", label: "تلقائي" },
                { value: "raw", label: "مباشرة (ESC/POS)" },
                { value: "driver", label: "عبر تعريف ويندوز" },
              ]}
            />
            <p className="text-xs text-ink-400">
              «تلقائي»: طابعات الفواتير تُطبع مباشرة بلغة الطابعة، وغيرها عبر تعريف ويندوز. إذا خرجت الفاتورة رموزاً غريبة جرّب الطريقة الأخرى.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <PrintButton slip={<ReceiptSlip r={{ ...SAMPLE, number: 0 }} shop={shop} />} label="طباعة فاتورة تجربة" />
          </div>

          <Toggle
            checked={drawer}
            onChange={async (v) => {
              setDrawer(v);
              await window.desktop?.setConfig({ drawer: v });
            }}
            label="فتح درج النقود مع كل بيع نقدي"
            hint="للدرج الموصول بالطابعة — يعمل مع الطباعة المباشرة"
          />
          <Toggle
            checked={fullscreen}
            onChange={async (v) => {
              setFullscreen(v);
              await window.desktop?.setConfig({ fullscreen: v });
            }}
            label="ملء الشاشة"
            hint="يُطبَّق فوراً — للخروج من ملء الشاشة اضغط F11"
          />
        </div>
      )}
    </Card>
  );
}

// --- النسخ الاحتياطي | backups ---------------------------------------------------

function BackupCard({ b }: { b: BackupInfo }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const backup = useAction();
  const folder = useAction();
  const [done, setDone] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const restore = useAction();
  const kb = (n: number) => (n >= 1024 * 1024 ? `${num(Math.round(n / 104857.6) / 10)} MB` : `${num(Math.round(n / 1024))} KB`);

  return (
    <Card title={<span className="flex items-center gap-2"><HardDrive size={18} /> النسخ الاحتياطي</span>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          نسخة كاملة تلقائياً كل 12 ساعة وبعد تقفيل كل وردية. آخر نسخة:{" "}
          <b className="tnum">{b.last ? stamp(b.last) : "لا توجد بعد"}</b>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={backup.pending}
            onClick={() => backup.run(backupNowAction, (r) => {
              setDone(r.extraError ? `تم الحفظ على اللابتوب — لكن تعذر النسخ للفلاشة: ${r.extraError}` : "تم إنشاء نسخة احتياطية ✓");
              router.refresh();
            })}
            className="btn-go px-4 py-2.5"
          >
            <Download size={17} /> {backup.pending ? "جاري النسخ…" : "نسخ احتياطي الآن"}
          </button>
          {desktop && (
            <button type="button" onClick={() => void window.desktop?.openPath(b.dir)} className="btn-soft px-4 py-2.5">
              <FolderOpen size={17} /> فتح مجلد النسخ
            </button>
          )}
        </div>
        {done && <OkNote>{done}</OkNote>}
        <ErrorNote error={backup.error} />

        <div className="rounded-2xl ring-1 ring-ink-100 p-4 space-y-2">
          <p className="font-semibold flex items-center gap-2">
            <Usb size={17} /> نسخة إضافية على فلاشة أو مجلد آخر
          </p>
          <p className="text-xs text-ink-400">
            كل نسخة تُنسخ أيضاً إلى هذا المجلد. اختر فلاشة USB أو مجلد OneDrive — إن تعطل اللابتوب تبقى البيانات.
          </p>
          <p className="text-sm bg-ink-50 rounded-xl px-3 py-2 break-all" dir="ltr">
            {b.extraDir ?? "— لم يُحدَّد —"}
          </p>
          {b.lastError && <ErrorNote error={`آخر محاولة: ${b.lastError}`} />}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!desktop || folder.pending}
              onClick={async () => {
                const dir = await window.desktop?.chooseFolder();
                if (dir) folder.run(() => setBackupDirAction(dir), () => router.refresh());
              }}
              className="btn-soft px-4 py-2 text-sm"
            >
              اختيار المجلد…
            </button>
            {b.extraDir && (
              <button
                type="button"
                onClick={() => folder.run(() => setBackupDirAction(null), () => router.refresh())}
                className="btn-ghost px-4 py-2 text-sm"
              >
                إلغاء
              </button>
            )}
          </div>
          <ErrorNote error={folder.error} />
        </div>

        <details className="rounded-2xl ring-1 ring-ink-100 p-4">
          <summary className="font-semibold cursor-pointer">النسخ المحفوظة ({b.files.length}) والاستعادة</summary>
          <p className="text-xs text-ink-400 mt-2 mb-3" dir="ltr">
            {b.dir}
          </p>
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {b.files.map((f) => (
              <li key={f.name} className="flex items-center gap-2 text-sm">
                <span className="tnum flex-1">{stamp(f.at)}</span>
                <span className="text-xs text-ink-400 tnum">{kb(f.size)}</span>
                <button type="button" onClick={() => setRestoring(f.path)} className="btn-ghost px-2 py-1 text-xs text-red-700">
                  استعادة
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!desktop}
            onClick={async () => {
              const f = await window.desktop?.chooseBackupFile(b.dir);
              if (f) setRestoring(f);
            }}
            className="btn-soft px-4 py-2 text-sm mt-3"
          >
            استعادة من ملف آخر…
          </button>
        </details>
      </div>
      {restoring && (
        <Modal title="استعادة نسخة احتياطية" onClose={() => setRestoring(null)}>
          <p className="text-sm">
            ستُستبدل كل البيانات الحالية بهذه النسخة. البيانات الحالية تُحفظ أولاً في نسخة احتياطية جديدة، فيمكنك
            التراجع.
          </p>
          <p className="text-xs bg-ink-50 rounded-xl px-3 py-2 break-all" dir="ltr">
            {restoring}
          </p>
          <ErrorNote error={restore.error} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-soft py-3" onClick={() => setRestoring(null)}>
              تراجع
            </button>
            <button
              type="button"
              disabled={restore.pending}
              className="btn-danger py-3"
              onClick={() =>
                restore.run(() => restoreFileAction(restoring), () => {
                  setRestoring(null);
                  router.replace("/login");
                  router.refresh();
                })
              }
            >
              {restore.pending ? "جاري الاستعادة…" : "استعادة"}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// --- السحابة | cloud --------------------------------------------------------------

function CloudCard({ s }: { s: SyncInfo }) {
  const router = useRouter();
  const [url, setUrl] = useState(s.url);
  const [token, setToken] = useState("");
  const save = useAction();
  const now = useAction();
  const off = useAction();
  const restore = useAction();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card title={<span className="flex items-center gap-2"><CloudUpload size={18} /> النسخة السحابية وتقارير الجوال</span>}>
      <div className="space-y-4">
        <div
          className={`rounded-2xl p-4 ring-1 ${
            !s.configured ? "bg-ink-50 ring-ink-100" : s.last_error ? "bg-amber-50 ring-amber-200" : "bg-emerald-50 ring-emerald-200"
          }`}
        >
          {s.configured ? (
            <div className="text-sm space-y-1">
              <p className="font-bold">
                {s.last_error ? "متصل — آخر محاولة لم تنجح" : "متصل ✓"} <span className="font-normal text-ink-500" dir="ltr">{s.url}</span>
              </p>
              <p>آخر مزامنة: <b className="tnum">{s.last_sync_at ? stamp(s.last_sync_at) : "—"}</b></p>
              <p>في الانتظار: <b className="tnum">{num(s.pending_rows)}</b> سجل · <b className="tnum">{num(s.pending_reports)}</b> تقرير</p>
              {s.last_error && <p className="text-amber-800">السبب: {s.last_error} — سيعيد المحاولة تلقائياً كل دقيقة.</p>}
            </div>
          ) : (
            <p className="text-sm">
              <b>غير متصل.</b> البرنامج يعمل بدون إنترنت تماماً. عند الربط تُرفع نسخة من كل البيانات للسحابة، ويستطيع
              صاحب المحل رؤية التقارير من جواله على <span dir="ltr">{s.url}</span>
            </p>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            save.run(() => saveCloudAction(url, token), () => {
              setToken("");
              setMsg("تم الربط ✓ — جاري رفع البيانات");
              router.refresh();
            });
          }}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="رابط السحابة">
              <input className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label="رمز الربط (SYNC_TOKEN)" hint="نفس الرمز المحفوظ في إعدادات Vercel">
              <input
                className="input"
                dir="ltr"
                type="password"
                value={token}
                placeholder={s.configured ? "••••••• (محفوظ)" : ""}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
          </div>
          <ErrorNote error={save.error ?? now.error ?? off.error} />
          {msg && <OkNote>{msg}</OkNote>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={save.pending || token.length < 16} className="btn-go px-4 py-2.5">
              {save.pending ? "جاري الاختبار…" : s.configured ? "تحديث الرمز" : "ربط واختبار"}
            </button>
            {s.configured && (
              <>
                <button
                  type="button"
                  disabled={now.pending}
                  onClick={() => now.run(syncNowAction, () => router.refresh())}
                  className="btn-soft px-4 py-2.5"
                >
                  <RefreshCw size={16} className={now.pending ? "animate-spin" : ""} /> مزامنة الآن
                </button>
                <button
                  type="button"
                  onClick={() => off.run(disconnectCloudAction, () => router.refresh())}
                  className="btn-ghost px-4 py-2.5 text-red-700"
                >
                  <CloudOff size={16} /> فصل
                </button>
              </>
            )}
          </div>
        </form>

        <details className="rounded-2xl ring-1 ring-ink-100 p-4 text-sm">
          <summary className="font-semibold cursor-pointer">طريقة الربط أول مرة</summary>
          <ol className="list-decimal ps-5 mt-2 space-y-1 text-ink-600">
            <li>في Vercel: Project → Settings → Environment Variables → أضف <b dir="ltr">SYNC_TOKEN</b> بقيمة سرية طويلة (20 حرفاً على الأقل).</li>
            <li>اضغط Redeploy في Vercel.</li>
            <li>اكتب نفس الرمز هنا واضغط «ربط واختبار».</li>
            <li>صاحب المحل يفتح الرابط من جواله ويدخل برقمه السري (المدير أو من لديه صلاحية التقارير).</li>
          </ol>
        </details>

        <div className="rounded-2xl ring-1 ring-red-100 bg-red-50/40 p-4 space-y-2">
          <p className="font-semibold flex items-center gap-2">
            <CloudDownload size={17} /> استعادة كل البيانات من السحابة
          </p>
          <p className="text-xs text-ink-500">
            للابتوب جديد أو بعد عطل: يستبدل البيانات الحالية بالنسخة السحابية (مع حفظ نسخة من الحالية أولاً).
          </p>
          <button
            type="button"
            disabled={token.length < 16 && !s.configured}
            onClick={() => setConfirmRestore(true)}
            className="btn bg-white ring-1 ring-red-200 text-red-700 px-4 py-2 text-sm"
          >
            استعادة من السحابة…
          </button>
        </div>
      </div>
      {confirmRestore && (
        <Modal title="استعادة من السحابة" onClose={() => setConfirmRestore(false)}>
          <p className="text-sm">ستُستبدل كل البيانات على هذا اللابتوب بالنسخة الموجودة في السحابة.</p>
          {!token && (
            <Field label="رمز الربط (SYNC_TOKEN)">
              <input className="input" dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
          )}
          <ErrorNote error={restore.error} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-soft py-3" onClick={() => setConfirmRestore(false)}>
              تراجع
            </button>
            <button
              type="button"
              disabled={restore.pending || token.length < 16}
              className="btn-danger py-3"
              onClick={() =>
                restore.run(() => restoreCloudAction(url, token), () => {
                  router.replace("/login");
                  router.refresh();
                })
              }
            >
              {restore.pending ? "جاري التنزيل…" : "استعادة"}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// --- التحديثات | updates -----------------------------------------------------------

function UpdatesCard({ version }: { version: string }) {
  const [u, setU] = useState<UpdateState | null>(null);
  const desktop = useIsDesktop();
  useEffect(() => {
    if (!window.desktop) return;
    void window.desktop.updateState().then(setU);
    return window.desktop.onUpdate(setU);
  }, []);
  if (!desktop) return null;
  const text: Record<UpdateState["status"], string> = {
    idle: "",
    checking: "جاري البحث عن تحديث…",
    available: `يوجد إصدار جديد ${u?.version ?? ""} — جاري التنزيل`,
    downloading: `جاري تنزيل التحديث ${u?.percent ? `${Math.round(u.percent)}%` : ""}`,
    ready: `الإصدار ${u?.version ?? ""} جاهز للتثبيت`,
    none: "لديك أحدث إصدار ✓",
    error: `تعذر التحقق من التحديثات${u?.error ? `: ${u.error}` : ""}`,
  };
  return (
    <Card title="التحديثات">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          الإصدار الحالي: <b className="tnum">{version}</b>
        </span>
        {u && <span className="text-ink-500">{text[u.status]}</span>}
        <div className="flex-1" />
        {u?.status === "ready" ? (
          <button type="button" onClick={() => void window.desktop?.installUpdate()} className="btn-go px-4 py-2.5">
            إعادة التشغيل والتثبيت
          </button>
        ) : (
          <button type="button" onClick={() => void window.desktop?.checkUpdates()} className="btn-soft px-4 py-2.5">
            <RefreshCw size={16} /> البحث عن تحديث
          </button>
        )}
      </div>
      <p className="text-xs text-ink-400 mt-2">التحديثات تُنزَّل تلقائياً عند توفر الإنترنت وتُثبَّت عند إغلاق البرنامج.</p>
    </Card>
  );
}
