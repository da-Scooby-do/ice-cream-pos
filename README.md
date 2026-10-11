# 🍦 كاشير الآيس كريم — Ice Cream POS

نظام كاشير ومخزون لمحل آيس كريم واحد، بالعربي، بالجنيه السوداني (SDG)،
مصمم لجهاز ThinkPad وطابعة Xprinter حرارية 80 ملم.

An Arabic, right-to-left point-of-sale and inventory system for a single ice cream shop.
**Next.js 15 · Tailwind · Zustand · Supabase (Postgres) · Vercel.**

---

## ما يفعله النظام | What it does

| | |
|---|---|
| **دخول بالرقم السري** | Each cashier taps their name and a 4–6 digit PIN. |
| **فتح الوردية** | Enter the opening cash in the drawer. Only one shift can be open at a time. |
| **البيع** | Product → flavors → extras (optional) → **Enter, Enter** → receipt prints. |
| **أنواع الأصناف** | By scoop (1/2/3) · fixed cups (S/M/L) · by weight (g/kg) · cone/biscuit. |
| **خصم المخزون تلقائياً** | Every sale deducts the cup/cone, the spoon, ~60 g per scoop of each flavor (or the exact weight), and each extra. |
| **تنبيه النقص** | A red badge on the counter screen when any flavor, cup, or extra drops below its threshold. |
| **تقفيل الوردية** | Count the drawer → see cash vs card, expected vs counted, **short / over** → prints the Z-report. |
| **لوحة المدير** | Live shift totals, daily sales, top flavors, low stock, void orders, restock, edit prices — works on a phone. |

## الأمان | Security

- The browser **never talks to the database**. All reads and writes go through Next.js Server Actions using the service-role key, which stays on the server.
- Every table has Row Level Security on with no policies, and all functions and views are revoked from `public`/`anon`/`authenticated` — the public Supabase key can read and do **nothing**.
- **Prices are recomputed in Postgres on every sale** from the price list. A tampered request cannot change what a customer pays.
- Sessions are httpOnly cookies signed with HMAC-SHA256. PINs are stored bcrypt-hashed.
- Voids are manager-only, require a reason, and return the stock they used. Every stock change is logged in `inventory_movements`.

---

## التشغيل | Setup

### 1. قاعدة البيانات | Database (Supabase)

Run these in the Supabase **SQL Editor**, in order:

1. `supabase/migrations/0001_init.sql` — tables
2. `supabase/migrations/0002_functions.sql` — sales logic, shift close, reports, security
3. `supabase/seed.sql` — starting flavors, cups, extras, prices, and two users

> ⚠️ **غيّر الأرقام السرية فوراً.** The seed creates `المدير` (PIN **1234**) and `كاشير 1` (PIN **1111**). Change them:
> ```sql
> select set_staff_pin((select id from staff where name = 'المدير'), '8642');
> ```
> Add a cashier:
> ```sql
> insert into staff (name, pin_hash, role) values ('أحمد', crypt('2580', gen_salt('bf')), 'cashier');
> ```

The seeded **prices are placeholders** — set the real ones from **المخزون والأسعار** in the app.

### 2. متغيرات البيئة | Environment variables

Copy `.env.example` to `.env.local` (and add them in Vercel → Settings → Environment Variables):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) — never share it |
| `SESSION_SECRET` | *optional* — if unset, derived from the Supabase secret key. Set it (`openssl rand -base64 32`) only if you want sessions independent of that key. |

### 3. التشغيل محلياً | Run locally

```bash
npm install
npm run dev     # http://localhost:3000
```

---

## 🖨️ جهاز المحل | The shop's ThinkPad + Xprinter

### Silent receipt printing

1. Install the **Xprinter 80mm driver**, connect it by USB, and set it as the **default printer**.
2. In the driver's printing preferences, set the paper to **80mm × receipt (continuous)**.
3. Launch Chrome in kiosk-printing mode — `window.print()` then goes straight to the printer with **no dialog**:

**Windows** — double-click `scripts/start-pos.bat` (edit the URL inside it first), or make a desktop shortcut with this target:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://YOUR-APP.vercel.app
```

**Linux** — `scripts/start-pos.sh`.

> `--kiosk-printing` only takes effect if **every** Chrome window is closed first. If the print dialog still appears, close Chrome completely (check the system tray) and relaunch from the shortcut.

### فتح درج النقدية | Opening the cash drawer

The drawer plugs into the Xprinter's RJ11 port. A web page can't send the raw "kick" command, so the **printer driver** does it:
Windows → *Printers & scanners* → Xprinter → *Printing preferences* (or *Printer properties → Device Settings*) → **Cash Drawer: open after printing**. The drawer then pops on every receipt.

### Keyboard shortcuts at the counter

| Key | Action |
|---|---|
| `Enter` | Open payment (when the order is complete) |
| `Enter` again | Exact cash → save → print |
| digits | Type the amount received / weight / PIN |
| `Esc` | Clear the order / close a dialog |

---

## هيكل المشروع | Project layout

```
supabase/
  migrations/0001_init.sql        tables
  migrations/0002_functions.sql   create_order, void_order, open/close_shift, views, security
  seed.sql                        starting data
src/
  app/login       PIN login
  app/shift       open shift
  app/pos         the counter screen (product → flavors → extras → pay)
  app/close       close shift + Z-report
  app/reports     manager dashboard
  app/inventory   restock + prices
  lib/actions.ts  server actions (all mutations)
  lib/queries.ts  server reads
  lib/session.ts  signed PIN session
  store/cart.ts   Zustand cart
  components/     Keypad, ReceiptSheet (80mm), ZReport, LowStockBadge
```
