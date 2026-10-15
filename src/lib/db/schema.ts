// مخطط قاعدة البيانات المحلية | the laptop's SQLite schema.
//
// Each entry in MIGRATIONS runs once, in order, tracked by PRAGMA user_version.
// Never edit a shipped migration — append a new one.
//
// Conventions:
//   • ids are UUID text; timestamps are UTC ISO strings; business_date is the
//     shop day (YYYY-MM-DD, Khartoum) a sale/expense belongs to.
//   • money is REAL rounded to 2 decimals in code; stock is REAL in its unit
//     (grams, ml or pieces).
//   • rows are archived (active = 0 / deleted = 1), not deleted, so old
//     receipts and reports keep their names.
//   • every synced table has an outbox trigger, so *any* write — however it
//     happens — is queued for the cloud backup.

export const SYNCED_TABLES = [
  "shop",
  "staff",
  "stock_items",
  "products",
  "product_sizes",
  "recipe_lines",
  "extras",
  "shifts",
  "orders",
  "order_items",
  "money_entries",
  "stock_moves",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

const outboxTriggers = SYNCED_TABLES.map(
  (t) => `
CREATE TRIGGER ${t}_outbox_ins AFTER INSERT ON ${t} BEGIN
  INSERT INTO sync_outbox (tbl, row_id) VALUES ('${t}', NEW.id);
END;
CREATE TRIGGER ${t}_outbox_upd AFTER UPDATE ON ${t} BEGIN
  INSERT INTO sync_outbox (tbl, row_id) VALUES ('${t}', NEW.id);
END;
CREATE TRIGGER ${t}_outbox_del AFTER DELETE ON ${t} BEGIN
  INSERT INTO sync_outbox (tbl, row_id) VALUES ('${t}', OLD.id);
END;`
).join("\n");

const V1 = `
-- إعدادات هذا الجهاز فقط (لا تُرفع للسحابة) | this laptop's own config
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- بيانات المحل | shop profile (one row)
CREATE TABLE shop (
  id          TEXT PRIMARY KEY CHECK (id = 'shop'),
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  footer      TEXT,
  scoop_grams REAL NOT NULL DEFAULT 60 CHECK (scoop_grams > 0),
  updated_at  TEXT NOT NULL
);

CREATE TABLE staff (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  pin_hash   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  perms      TEXT NOT NULL DEFAULT '[]',
  active     INTEGER NOT NULL DEFAULT 1,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- كل ما له رصيد: النكهات (بالجرام) والأكواب والبسكويت والملاعق والحليب…
-- everything with a stock level: flavors (grams), cups, cones, spoons, milk…
CREATE TABLE stock_items (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('flavor', 'item')),
  unit       TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'pcs')),
  qty        REAL NOT NULL DEFAULT 0,
  alert_qty  REAL NOT NULL DEFAULT 0 CHECK (alert_qty >= 0),
  color      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE products (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  pricing      TEXT NOT NULL CHECK (pricing IN ('size', 'weight')),
  price_per_kg REAL CHECK (price_per_kg IS NULL OR price_per_kg >= 0),
  max_flavors  INTEGER NOT NULL DEFAULT 0 CHECK (max_flavors >= 0),
  scoop_grams  REAL CHECK (scoop_grams IS NULL OR scoop_grams > 0),
  color        TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- الأحجام والأسعار | sizes. scoops = how many flavors the customer picks and
-- how many scoops are deducted (scoops × scoop grams, split across flavors).
CREATE TABLE product_sizes (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name       TEXT NOT NULL,
  price      REAL NOT NULL CHECK (price >= 0),
  scoops     INTEGER NOT NULL DEFAULT 0 CHECK (scoops >= 0),
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- ما يستهلكه كل بيع من المخزون | what one sale uses up.
-- size_id NULL = used by every sale of the product (e.g. a spoon).
CREATE TABLE recipe_lines (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  size_id       TEXT REFERENCES product_sizes(id),
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id),
  qty           REAL NOT NULL CHECK (qty > 0),
  updated_at    TEXT NOT NULL
);

CREATE TABLE extras (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  price         REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock_item_id TEXT REFERENCES stock_items(id),
  qty           REAL NOT NULL DEFAULT 0 CHECK (qty >= 0),
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- الورديات: صباحية / مسائية | shifts. Open while closed_at IS NULL.
CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('day', 'night')),
  business_date TEXT NOT NULL,
  opened_by     TEXT NOT NULL REFERENCES staff(id),
  opened_at     TEXT NOT NULL,
  opening_cash  REAL NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_by     TEXT REFERENCES staff(id),
  closed_at     TEXT,
  counted_cash  REAL,
  expected_cash REAL,
  note          TEXT,
  updated_at    TEXT NOT NULL
);
-- وردية مفتوحة واحدة فقط | only one open shift at a time
CREATE UNIQUE INDEX shifts_one_open ON shifts ((closed_at IS NULL)) WHERE closed_at IS NULL;
CREATE INDEX shifts_date ON shifts (business_date);

CREATE TABLE orders (
  id            TEXT PRIMARY KEY,
  number        INTEGER NOT NULL,
  shift_id      TEXT NOT NULL REFERENCES shifts(id),
  staff_id      TEXT NOT NULL REFERENCES staff(id),
  business_date TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  payment       TEXT NOT NULL CHECK (payment IN ('cash', 'bank')),
  total         REAL NOT NULL CHECK (total >= 0),
  paid          REAL,
  change        REAL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES staff(id),
  void_reason   TEXT,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX orders_number ON orders (number);
CREATE INDEX orders_date ON orders (business_date);
CREATE INDEX orders_shift ON orders (shift_id);

-- flavors / extras are JSON snapshots taken at sale time:
--   flavors: [{"id","name","grams"}]   extras: [{"id","name","price"}]
CREATE TABLE order_items (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  product_id   TEXT,
  size_id      TEXT,
  product_name TEXT NOT NULL,
  size_name    TEXT,
  category     TEXT NOT NULL DEFAULT '',
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_price   REAL NOT NULL,
  weight_g     REAL,
  line_total   REAL NOT NULL,
  flavors      TEXT NOT NULL DEFAULT '[]',
  extras       TEXT NOT NULL DEFAULT '[]',
  updated_at   TEXT NOT NULL
);
CREATE INDEX order_items_order ON order_items (order_id);

-- الإيرادات والمصروفات | income & expenses (besides sales).
-- drawer = 1: cash went into / out of the shift's cash drawer.
CREATE TABLE money_entries (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category      TEXT NOT NULL,
  amount        REAL NOT NULL CHECK (amount > 0),
  note          TEXT,
  drawer        INTEGER NOT NULL DEFAULT 0,
  shift_id      TEXT REFERENCES shifts(id),
  business_date TEXT NOT NULL,
  staff_id      TEXT NOT NULL REFERENCES staff(id),
  created_at    TEXT NOT NULL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES staff(id),
  updated_at    TEXT NOT NULL
);
CREATE INDEX money_entries_date ON money_entries (business_date);
CREATE INDEX money_entries_shift ON money_entries (shift_id);

-- سجل حركة المخزون | the stock ledger. Every change to a stock level has a row.
CREATE TABLE stock_moves (
  id             TEXT PRIMARY KEY,
  stock_item_id  TEXT NOT NULL REFERENCES stock_items(id),
  delta          REAL NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('sale', 'void', 'restock', 'adjust', 'waste')),
  order_id       TEXT,
  money_entry_id TEXT,
  note           TEXT,
  staff_id       TEXT,
  business_date  TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX stock_moves_item_date ON stock_moves (stock_item_id, business_date);
CREATE INDEX stock_moves_date ON stock_moves (business_date, reason);

-- طابور الرفع للسحابة | rows waiting to be copied to the cloud backup
CREATE TABLE sync_outbox (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl    TEXT NOT NULL,
  row_id TEXT NOT NULL
);

-- تقارير تحتاج إعادة رفع | report snapshots waiting to be re-published
CREATE TABLE snapshot_queue (
  key TEXT PRIMARY KEY
);

${outboxTriggers}
`;

// v2: نكهات بسعر إضافي | premium flavors (extra per scoop / per kilo)
const V2 = `
ALTER TABLE stock_items ADD COLUMN price_extra REAL NOT NULL DEFAULT 0 CHECK (price_extra >= 0);
ALTER TABLE stock_items ADD COLUMN price_extra_kg REAL NOT NULL DEFAULT 0 CHECK (price_extra_kg >= 0);
`;

export const MIGRATIONS: string[] = [V1, V2];
