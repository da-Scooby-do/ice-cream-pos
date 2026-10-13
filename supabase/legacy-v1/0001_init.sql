-- =====================================================================
-- نظام كاشير محل الآيس كريم — الهيكل الأساسي لقاعدة البيانات
-- Ice cream shop POS — core schema
-- Currency: SDG (الجنيه السوداني)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- إعدادات المحل | shop settings (single row)
-- ---------------------------------------------------------------------
create table if not exists shop_settings (
  id                  boolean primary key default true check (id),
  shop_name           text not null default 'محل الآيس كريم',
  phone               text,
  address             text,
  currency            text not null default 'SDG',
  receipt_footer      text default 'شكراً لزيارتكم 🍦',
  default_scoop_grams numeric(10,2) not null default 60,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الموظفون | staff (PIN login, bcrypt-hashed)
-- ---------------------------------------------------------------------
create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  pin_hash   text not null,
  role       text not null default 'cashier' check (role in ('cashier','manager')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- النكهات | flavors — stock tracked in grams
-- ---------------------------------------------------------------------
create table if not exists flavors (
  id              uuid primary key default gen_random_uuid(),
  name_ar         text not null unique,
  color           text not null default '#F2A2C0',
  stock_grams     numeric(12,2) not null default 0,
  low_stock_grams numeric(12,2) not null default 2000,
  is_active       boolean not null default true,
  sort_order      int not null default 0
);

-- ---------------------------------------------------------------------
-- مواد التعبئة | packaging — cups, cones, spoons, biscuits (by piece)
-- ---------------------------------------------------------------------
create table if not exists packaging (
  id           uuid primary key default gen_random_uuid(),
  name_ar      text not null,
  kind         text not null check (kind in ('cup','cone','spoon','biscuit','bag')),
  stock_qty    numeric(12,2) not null default 0,
  low_stock_qty numeric(12,2) not null default 50,
  is_active    boolean not null default true,
  sort_order   int not null default 0
);

-- ---------------------------------------------------------------------
-- الأصناف | product variants = the big buttons on the POS screen
--   kind 'scoop'  → سكوب (1 / 2 / 3)       price fixed
--   kind 'cup'    → كوب جاهز (صغير/وسط/كبير) price fixed
--   kind 'weight' → بالوزن                  priced per kg
--   kind 'cone'   → كون / بسكويت            price fixed
-- ---------------------------------------------------------------------
create table if not exists product_variants (
  id                 uuid primary key default gen_random_uuid(),
  name_ar            text not null,
  kind               text not null check (kind in ('scoop','cup','weight','cone')),
  scoops             int,
  grams_per_scoop    numeric(10,2),
  price              numeric(12,2),
  price_per_kg       numeric(12,2),
  packaging_id       uuid references packaging(id) on delete set null,
  spoon_packaging_id uuid references packaging(id) on delete set null,
  max_flavors        int not null default 1,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  constraint price_present check (
    (kind = 'weight' and price_per_kg is not null)
    or (kind <> 'weight' and price is not null)
  )
);

-- ---------------------------------------------------------------------
-- الإضافات | extras — sauces, nuts, sprinkles
-- ---------------------------------------------------------------------
create table if not exists extras (
  id            uuid primary key default gen_random_uuid(),
  name_ar       text not null unique,
  price         numeric(12,2) not null default 0,
  unit          text not null default 'portion' check (unit in ('portion','gram','ml')),
  qty_per_use   numeric(10,2) not null default 1,
  stock_qty     numeric(12,2) not null default 0,
  low_stock_qty numeric(12,2) not null default 10,
  is_active     boolean not null default true,
  sort_order    int not null default 0
);

-- ---------------------------------------------------------------------
-- الورديات | shifts — one open shift at a time
-- ---------------------------------------------------------------------
create table if not exists shifts (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  opening_cash  numeric(12,2) not null default 0,
  counted_cash  numeric(12,2),
  status        text not null default 'open' check (status in ('open','closed')),
  note          text
);

-- only one shift may be open at any moment (single counter)
create unique index if not exists shifts_single_open
  on shifts ((status)) where status = 'open';

-- ---------------------------------------------------------------------
-- الفواتير | orders
-- ---------------------------------------------------------------------
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       bigint generated by default as identity,
  shift_id       uuid not null references shifts(id),
  staff_id       uuid not null references staff(id),
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('cash','card','wallet')),
  paid_amount    numeric(12,2),
  change_amount  numeric(12,2),
  status         text not null default 'completed' check (status in ('completed','void')),
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  void_reason    text
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_shift_idx      on orders (shift_id);

-- بنود الفاتورة | order lines (names snapshotted so old receipts stay correct)
create table if not exists order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  variant_id   uuid references product_variants(id) on delete set null,
  name_ar      text not null,
  kind         text not null,
  scoops       int,
  weight_grams numeric(12,2),
  qty          int not null default 1 check (qty > 0),
  unit_price   numeric(12,2) not null,
  extras_total numeric(12,2) not null default 0,
  line_total   numeric(12,2) not null
);

create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists order_item_flavors (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  flavor_id     uuid references flavors(id) on delete set null,
  name_ar       text not null,
  grams         numeric(12,2) not null
);

create table if not exists order_item_extras (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  extra_id      uuid references extras(id) on delete set null,
  name_ar       text not null,
  qty           numeric(10,2) not null default 1,
  price         numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- حركة المخزون | inventory movements — full audit trail
-- ---------------------------------------------------------------------
create table if not exists inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  item_type    text not null check (item_type in ('flavor','packaging','extra')),
  flavor_id    uuid references flavors(id) on delete cascade,
  packaging_id uuid references packaging(id) on delete cascade,
  extra_id     uuid references extras(id) on delete cascade,
  qty_delta    numeric(12,2) not null,
  unit         text not null,
  reason       text not null check (reason in ('sale','restock','adjustment','waste','void')),
  order_id     uuid references orders(id) on delete set null,
  staff_id     uuid references staff(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  constraint movement_target check (
       (item_type = 'flavor'    and flavor_id    is not null)
    or (item_type = 'packaging' and packaging_id is not null)
    or (item_type = 'extra'     and extra_id     is not null)
  )
);

create index if not exists movements_created_at_idx on inventory_movements (created_at desc);
create index if not exists movements_order_idx      on inventory_movements (order_id);
