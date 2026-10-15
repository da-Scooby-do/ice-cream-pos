"use client";

import { CloudDownload, HardDrive, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setupAction, setupRestoreCloudAction, setupRestoreFileAction } from "@/actions/auth";
import { ErrorNote, Field, OkNote, Segmented, useAction } from "@/components/ui";
import { num } from "@/lib/format";
import { useIsDesktop } from "@/lib/print";

type Mode = "new" | "cloud" | "file";

export default function SetupForm({ defaultCloudUrl }: { defaultCloudUrl: string }) {
  const [mode, setMode] = useState<Mode>("new");
  return (
    <div className="w-full max-w-lg card p-6 space-y-5 animate-rise">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/badge.svg" alt="" className="w-16 h-16" />
        <div>
          <h1 className="text-xl font-bold">مرحباً بك في JAC ICE</h1>
          <p className="text-sm text-ink-400">إعداد البرنامج لأول مرة على هذا الجهاز</p>
        </div>
      </div>

      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "new", label: <span className="flex items-center gap-1.5"><Sparkles size={15} /> بداية جديدة</span> },
          { value: "cloud", label: <span className="flex items-center gap-1.5"><CloudDownload size={15} /> من السحابة</span> },
          { value: "file", label: <span className="flex items-center gap-1.5"><HardDrive size={15} /> من ملف</span> },
        ]}
      />

      {mode === "new" && <NewShop />}
      {mode === "cloud" && <FromCloud defaultUrl={defaultCloudUrl} />}
      {mode === "file" && <FromFile />}
    </div>
  );
}

function NewShop() {
  const router = useRouter();
  const [shop, setShop] = useState("JAC ICE");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setupAction({ shop_name: shop, admin_name: name, pin, pin2 }), () => {
          router.replace("/products");
          router.refresh();
        });
      }}
    >
      <Field label="اسم المحل">
        <input className="input" value={shop} onChange={(e) => setShop(e.target.value)} />
      </Field>
      <Field label="اسم المدير" hint="صاحب المحل — يستطيع التحكم في كل شيء">
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="مثلاً: أبو محمد" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الرقم السري (4–8 أرقام)">
          <input
            className="input tnum text-center tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            dir="ltr"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="أعد كتابته">
          <input
            className="input tnum text-center tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            dir="ltr"
            maxLength={8}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <p className="text-xs text-ink-400">
        البرنامج يبدأ فارغاً: بعد الدخول ستضيف النكهات والأكواب والأصناف وأسعارها بنفسك.
      </p>
      <ErrorNote error={error} />
      <button type="submit" disabled={pending} className="btn-go w-full py-3.5 text-base">
        {pending ? "جاري الإعداد…" : "ابدأ"}
      </button>
    </form>
  );
}

function FromCloud({ defaultUrl }: { defaultUrl: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [token, setToken] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const { pending, error, run } = useAction();

  if (done !== null) {
    return (
      <div className="space-y-3">
        <OkNote>تمت استعادة {num(done)} سجلاً من السحابة ✓ — ادخل برقمك السري المعتاد.</OkNote>
        <button type="button" className="btn-dark w-full py-3" onClick={() => router.replace("/login")}>
          الذهاب لتسجيل الدخول
        </button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setupRestoreCloudAction(url, token), (r) => setDone(r.rows));
      }}
    >
      <p className="text-sm text-ink-500">
        للابتوب جديد أو بعد عطل: يُنزّل كل البيانات (الأصناف، المبيعات، المخزون، الموظفين) من النسخة السحابية.
      </p>
      <Field label="رابط السحابة">
        <input className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="رمز الربط (SYNC_TOKEN)">
        <input className="input" dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <button type="submit" disabled={pending || !token} className="btn-go w-full py-3.5 text-base">
        {pending ? "جاري التنزيل… قد يستغرق دقيقة" : "استعادة من السحابة"}
      </button>
    </form>
  );
}

function FromFile() {
  const router = useRouter();
  const [file, setFile] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { pending, error, setError, run } = useAction();
  const desktop = useIsDesktop();

  if (done) {
    return (
      <div className="space-y-3">
        <OkNote>تمت الاستعادة من الملف ✓ — ادخل برقمك السري المعتاد.</OkNote>
        <button type="button" className="btn-dark w-full py-3" onClick={() => router.replace("/login")}>
          الذهاب لتسجيل الدخول
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">
        اختر ملف نسخة احتياطية (ينتهي بـ ‎.db.gz أو ‎.db) — مثلاً من فلاشة أو من مجلد «JAC ICE Backups».
      </p>
      <button
        type="button"
        className="btn-soft w-full py-3"
        disabled={!desktop}
        onClick={async () => {
          setError(null);
          const f = await window.desktop?.chooseBackupFile();
          if (f) setFile(f);
        }}
      >
        <HardDrive size={18} /> اختيار الملف…
      </button>
      {!desktop && <p className="text-xs text-ink-400">متاح داخل برنامج اللابتوب فقط.</p>}
      {file && (
        <p className="text-xs bg-ink-50 rounded-xl px-3 py-2 break-all" dir="ltr">
          {file}
        </p>
      )}
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={pending || !file}
        className="btn-go w-full py-3.5 text-base"
        onClick={() => file && run(() => setupRestoreFileAction(file), () => setDone(true))}
      >
        {pending ? "جاري الاستعادة…" : "استعادة"}
      </button>
    </div>
  );
}
