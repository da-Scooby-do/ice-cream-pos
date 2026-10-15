import type { Unit } from "./format";
import type { Perm, Role } from "./perms";

// أنواع البيانات المشتركة | shared shapes (server ⇄ client ⇄ cloud).

export type Shop = {
  name: string;
  phone: string | null;
  address: string | null;
  footer: string | null;
  scoop_grams: number;
};

export type StaffRow = {
  id: string;
  name: string;
  role: Role;
  perms: Perm[];
  active: boolean;
  created_at: string;
};

export type StockItem = {
  id: string;
  name: string;
  kind: "flavor" | "item";
  unit: Unit;
  qty: number;
  alert_qty: number;
  color: string | null;
  active: boolean;
  sort: number;
};

export type Size = {
  id: string;
  name: string;
  price: number;
  scoops: number;
  active: boolean;
  sort: number;
};

export type RecipeLine = {
  size_id: string | null;
  stock_item_id: string;
  qty: number;
};

export type Pricing = "size" | "weight";

export type Product = {
  id: string;
  name: string;
  category: string;
  pricing: Pricing;
  price_per_kg: number | null;
  max_flavors: number;
  scoop_grams: number | null;
  color: string | null;
  active: boolean;
  sort: number;
  sizes: Size[];
  recipe: RecipeLine[];
};

export type Extra = {
  id: string;
  name: string;
  price: number;
  stock_item_id: string | null;
  qty: number;
  active: boolean;
  sort: number;
};

export type PosCatalog = {
  products: Product[];
  flavors: StockItem[];
  extras: Extra[];
};

export type Payment = "cash" | "bank";

export const PAYMENT_LABEL: Record<Payment, string> = {
  cash: "نقدي",
  bank: "تحويل بنكي",
};

export type ShiftKind = "day" | "night";

export const SHIFT_LABEL: Record<ShiftKind, string> = {
  day: "الوردية الصباحية",
  night: "الوردية المسائية",
};

// --- البيع | a sale -------------------------------------------------------

export type OrderItemInput = {
  product_id: string;
  size_id: string | null;
  qty: number;
  weight_g: number | null;
  flavor_ids: string[];
  extra_ids: string[];
};

export type ReceiptItem = {
  name: string;
  size: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  weight_g: number | null;
  flavors: string[];
  extras: string[];
};

export type Receipt = {
  order_id: string;
  number: number;
  created_at: string;
  cashier: string;
  payment: Payment;
  total: number;
  paid: number | null;
  change: number | null;
  items: ReceiptItem[];
  voided?: boolean;
};

// --- التقارير | reports (computed on the laptop, mirrored to the phone) ---

export type Totals = {
  orders: number;
  voids: number;
  sales_cash: number;
  sales_bank: number;
  /** how many receipts were paid cash / by bank transfer (older cloud snapshots lack these) */
  orders_cash?: number;
  orders_bank?: number;
  sales: number;
  other_income: number;
  income: number; // sales + other income
  expenses: number;
  net: number; // income − expenses
};

export type ProductSale = {
  product: string;
  size: string | null;
  category: string;
  qty: number;
  revenue: number;
  weight_g: number;
};

/** count: number of receipts, for the cash / bank sales lines */
export type MoneyLine = { category: string; amount: number; count?: number };

export type EntryRow = {
  id: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  note: string | null;
  drawer: boolean;
  shift_id: string | null;
  business_date: string;
  created_at: string;
  staff: string;
  staff_id: string;
  voided: boolean;
};

export type ShiftInfo = {
  id: string;
  kind: ShiftKind;
  business_date: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_cash: number;
  counted_cash: number | null;
  expected_cash: number | null;
  note: string | null;
};

export type Drawer = {
  opening: number;
  cash_sales: number;
  cash_income: number;
  cash_expenses: number;
  expected: number;
  counted: number | null;
  diff: number | null;
};

export type ShiftStatement = {
  shop: Shop;
  shift: ShiftInfo;
  totals: Totals;
  drawer: Drawer;
  income_lines: MoneyLine[];
  expenses: EntryRow[];
  products: ProductSale[];
  /** اليوم كاملاً حتى الآن، إن كانت هناك ورديات أخرى | the whole day so far */
  day: { date: string; shifts: number; totals: Totals } | null;
};

export type FlavorUse = { name: string; grams: number; color?: string | null };

export type DayStatement = {
  date: string;
  totals: Totals;
  shifts: (ShiftInfo & { totals: Totals })[];
  income_lines: MoneyLine[];
  expense_lines: MoneyLine[];
  entries: EntryRow[];
  products: ProductSale[];
  flavors: FlavorUse[];
};

export type DayRow = {
  date: string;
  orders: number;
  income: number;
  expenses: number;
  net: number;
  /** sales by payment: amount and number of receipts (older cloud snapshots lack these) */
  cash?: number;
  bank?: number;
  orders_cash?: number;
  orders_bank?: number;
};

export type MonthStatement = {
  month: string;
  totals: Totals;
  income_lines: MoneyLine[];
  expense_lines: MoneyLine[];
  products: ProductSale[];
  days: DayRow[];
  flavors: FlavorUse[];
};

export type Dashboard = {
  from: string;
  to: string;
  totals: Totals & { avg_ticket: number; items: number };
  products: { name: string; category: string; qty: number; revenue: number }[];
  sizes: { product: string; size: string; qty: number; revenue: number }[];
  categories: { category: string; qty: number; revenue: number }[];
  /** day_orders: how many of the hour's receipts were in a day shift (older cloud snapshots lack it) */
  by_hour: { hour: number; orders: number; revenue: number; day_orders?: number }[];
  by_weekday: { day: number; orders: number; revenue: number; days: number }[];
  by_day: { date: string; orders: number; revenue: number }[];
  flavors: FlavorUse[];
};

export type StockLevel = {
  id: string;
  name: string;
  kind: "flavor" | "item";
  unit: Unit;
  qty: number;
  alert_qty: number;
  low: boolean;
};

export type StockMonthRow = {
  id: string;
  name: string;
  kind: "flavor" | "item";
  unit: Unit;
  opening: number;
  restocked: number;
  sold: number;
  adjusted: number;
  closing: number;
};

export type RestockRow = {
  id: string;
  date: string;
  created_at: string;
  item: string;
  unit: Unit;
  qty: number;
  cost: number | null;
  note: string | null;
  staff: string;
};

export type StockMonth = {
  month: string;
  items: StockMonthRow[];
  restocks: RestockRow[];
};

export type OrderRow = {
  id: string;
  number: number;
  created_at: string;
  business_date: string;
  shift_kind: ShiftKind;
  shift_open: boolean;
  cashier: string;
  payment: Payment;
  total: number;
  voided: boolean;
  void_reason: string | null;
  summary: string;
};
