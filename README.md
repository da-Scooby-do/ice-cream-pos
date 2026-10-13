# 🍦 JAC ICE POS — برنامج كاشير ومخزون

برنامج كاشير ومخزون لمحل **JAC ICE** للآيس كريم، بالعربي وبالجنيه السوداني، **يعمل على اللابتوب بدون إنترنت**،
مع طابعة Xprinter حرارية 80 ملم، ونسخة سحابية يرى منها صاحب المحل التقارير على جواله.

An Arabic, offline-first point-of-sale and inventory **desktop app** for a single ice cream shop
(Windows laptop + 80mm thermal printer), with a cloud copy for backups and the owner's phone.

| | |
|---|---|
| ⬇️ **تنزيل البرنامج (ويندوز)** | [Releases → JAC-ICE-POS-Setup-x.y.z.exe](https://github.com/da-Scooby-do/ice-cream-pos/releases/latest) |
| 📱 **تقارير الجوال** | https://ice-cream-pos.vercel.app |

---

## ما الذي يفعله | What it does

| | |
|---|---|
| **يعمل بدون إنترنت** | Everything (selling, printing, stock, reports) runs on the laptop with its own database. The internet is only used to copy data to the cloud and to download updates. |
| **الدخول بالرقم السري** | PIN only — no names on the login screen. Every PIN is unique. |
| **المدير والموظفون** | Two roles. The **admin** controls everything. A **staff** member can do only what the admin ticks: sell · void receipts · see sales history · see dashboard & statements · record expenses/income · receive stock · count/adjust stock · manage products & prices. Changes apply on the very next click. |
| **ورديتان** | A day (صباحية) and a night (مسائية) shift — or just one. Each opens with the cash in the drawer. A night shift that runs past midnight belongs to the day it started. |
| **البيع** | Product → size → flavors → extras → **Enter, Enter** → the receipt prints silently. Cash (with change) or bank transfer (بنكك). |
| **الأصناف من الصفر** | The app starts empty; the admin adds flavors, cups/cones/spoons/milk, products with their sizes and prices, and what each sale uses up. Products sold by weight are supported. |
| **خصم المخزون تلقائياً** | Each sale deducts scoops × grams from the chosen flavors (or the exact weight), plus the cup/cone/spoon/straw/milk set on that size, plus extras. Voids put it all back. |
| **الإيرادات والمصروفات** | Two ledgers: income (sales + other income) and expenses (rent, electricity, ice, salaries…). Expenses can be added during or at the end of a shift, paid from the drawer or not. |
| **كشف الوردية** | Closing a shift prints an 80mm statement: income, expenses, **net profit**, the cash-drawer check (short/over), items sold, and the whole day's totals when there were two shifts. |
| **الكشف اليومي والشهري** | Daily and monthly statements on screen and on paper: every product × size sold, income by type, expenses by category, net profit, day-by-day table, flavor usage. |
| **المخزون بالتاريخ** | Every delivery is logged with its date, quantity and (optional) cost — which is recorded as an expense automatically. The monthly ledger shows **opening + received − sold ± counted/wasted = closing** for every item. Low-stock alerts in red. |
| **لوحة التحكم** | Best-selling products, most popular sizes, the busiest hours of the day, the busiest day of the week, daily revenue, flavor usage — for today / 7 days / this month / any range. |
| **النسخ الاحتياطي** | Automatic full backup every 12 hours and after every shift close (kept in *Documents → JAC ICE Backups*, last 60), optionally mirrored to a USB stick; one-click restore from any backup file. |
| **السحابة** | When online, every change is copied to Supabase (via the Vercel app) within a minute. A brand-new laptop can be **restored from the cloud** on its first start. |
| **تقارير الجوال** | The owner signs in on his phone with his PIN and sees today, the dashboard, daily/monthly statements and stock — read-only. |
| **التحديثات** | The app updates itself from GitHub Releases in the background and installs on the next restart. |

---

## التثبيت على اللابتوب | Installing on the laptop

1. نزّل `JAC-ICE-POS-Setup-x.y.z.exe` من صفحة [Releases](https://github.com/da-Scooby-do/ice-cream-pos/releases/latest) وشغّله.
   ويندوز قد يظهر «Windows protected your PC» لأن البرنامج غير موقّع بشهادة مدفوعة → **More info → Run anyway** (مرة واحدة).
2. أول تشغيل: اختر **بداية جديدة** (اسم المحل + اسم المدير + رقم سري)، أو **من السحابة** / **من ملف** لاستعادة بيانات سابقة.
3. **الأصناف**: أضف النكهات ← مواد المخزون (الأكواب، البسكويت، الملاعق، الحليب…) ← الأصناف وأحجامها وأسعارها.
4. **الإعدادات ← الطابعة**: اختر طابعة Xprinter واضغط «طباعة فاتورة تجربة».
   لفتح درج النقود تلقائياً: في خصائص الطابعة داخل ويندوز فعّل *Open cash drawer* بعد الطباعة.
5. **الإعدادات ← النسخ الاحتياطي**: اختر فلاشة كمجلد إضافي (موصى به).
6. **الموظفون**: أضف الكاشير وحدد صلاحياته.

اختصارات: `Enter` الدفع · `Esc` مسح الطلب · `F11` ملء الشاشة · `F5` تحديث الصفحة.

## ربط السحابة وتقارير الجوال | Cloud + phone (one time)

1. Supabase → SQL Editor → run [`supabase/migrations/0010_cloud_sync.sql`](supabase/migrations/0010_cloud_sync.sql) (already applied on the live project).
2. Vercel → Project → Settings → Environment Variables → add **`SYNC_TOKEN`** = a long random secret (20+ characters) → **Redeploy**.
   (`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set from v1.)
3. On the laptop: **الإعدادات ← النسخة السحابية** → paste the same token → **ربط واختبار**. Everything is uploaded.
4. The owner opens https://ice-cream-pos.vercel.app on his phone and signs in with his PIN
   (admins, or staff with the *reports* permission).

---

## كيف بُني | How it is built

```
Electron (Windows app)
 ├─ main process ── window, silent printing, file pickers, auto-update
 └─ utility process ── Next.js 15 standalone server on 127.0.0.1
                        └─ SQLite (node:sqlite, built into Electron's Node 24)
                             └─ sync_outbox ──(when online)──▶ Vercel /api/sync ──▶ Supabase
                                                                   │
                                     owner's phone ◀── /m (read-only) ◀┘
```

- **One codebase, two modes.** `POS_RUNTIME=desktop` (set by Electron) → the full app on SQLite.
  On Vercel → only the phone pages (`/m`) and the sync API.
- **SQLite** in WAL mode with `synchronous=FULL`; every sale, its items and every stock movement
  commit in one transaction. Prices are always recomputed on the server.
- **Sync is one-way** (laptop → cloud), so there are no conflicts. Triggers queue every changed row;
  a background job uploads them every minute and publishes ready-made report snapshots for the phone.
- **Printing**: the slip is measured and printed silently at exactly 80 mm × its own length through
  Electron's `webContents.print` — no browser dialog, no wasted paper.
- **Security**: PINs are scrypt-hashed; sessions are HMAC-signed httpOnly cookies re-checked on every
  request; every action checks the permission on the server; the local server listens on 127.0.0.1
  only; the window can't navigate away from the app; the cloud endpoints need the sync token, and
  the cloud is read-only.

### Project layout

| Path | |
|---|---|
| `electron/` | main process, preload bridge, splash |
| `src/lib/db/` | SQLite connection + schema migrations |
| `src/lib/server/` | business logic: sales, shifts, money, stock, catalog, staff, reports, backup, sync |
| `src/actions/` | server actions (each checks the permission) |
| `src/app/(desk)/` | laptop pages · `src/app/m/` phone pages · `src/app/api/sync/` cloud endpoints |
| `src/components/slips.tsx` | the 80mm receipt / shift / day / month / stock slips |
| `supabase/migrations/0010_cloud_sync.sql` | cloud tables (`legacy-v1/` = the old web-only version) |
| `.github/workflows/desktop.yml` | builds, smoke-tests and publishes the Windows installer |

### Development

```bash
npm install
npm run dev:desktop          # the laptop app in a browser: http://localhost:3200 (data in .data/)
npm run desktop:build        # production server for Electron
npm run desktop:run          # the real desktop app
npm run desktop:smoke        # boot + self-test, exits 0/1
npx electron-builder --win   # Windows installer (on Windows; CI does this)
```

**Release:** bump `version` in `package.json`, commit, then push a tag `vX.Y.Z` —
GitHub Actions builds the installer on Windows, smoke-tests it and publishes the release;
installed apps pick it up automatically.
