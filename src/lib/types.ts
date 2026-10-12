export type Role = "cashier" | "manager";
export type VariantKind = "scoop" | "cup" | "weight" | "cone";
export type VariantCategory = "icecream" | "shake";
export type PaymentMethod = "cash" | "card" | "wallet";

export type Staff = {
  id: string;
  name: string;
  role: Role;
};

export type Flavor = {
  id: string;
  name_ar: string;
  color: string;
  stock_grams: number;
  low_stock_grams: number;
};

export type Variant = {
  id: string;
  name_ar: string;
  kind: VariantKind;
  category: VariantCategory;
  scoops: number | null;
  grams_per_scoop: number | null;
  price: number | null;
  price_per_kg: number | null;
  max_flavors: number;
  sort_order: number;
};

export type Extra = {
  id: string;
  name_ar: string;
  price: number;
  stock_qty: number;
  low_stock_qty: number;
};

export type LowStockRow = {
  item_type: "flavor" | "packaging" | "extra";
  id: string;
  name_ar: string;
  stock: number;
  threshold: number;
  unit: string;
};

export type ShiftSummary = {
  shift_id: string;
  cashier: string;
  opened_at: string;
  closed_at: string | null;
  status: "open" | "closed";
  opening_cash: number;
  counted_cash: number | null;
  orders_count: number;
  cash_sales: number;
  card_sales: number;
  total_sales: number;
  discounts: number;
  voids_count: number;
  expected_cash: number;
  difference: number | null;
  top_flavors: { name_ar: string; grams: number }[];
};

export type ReceiptItem = {
  name_ar: string;
  qty: number;
  unit_price: number;
  line_total: number;
  weight_grams: number | null;
  flavors: string[];
  extras: { name_ar: string; price: number }[];
};

export type Receipt = {
  order_id: string;
  order_no: number;
  subtotal: number;
  discount: number;
  total: number;
  change: number | null;
  items: ReceiptItem[];
  // filled in by the client for printing
  shop_name?: string;
  receipt_footer?: string;
  cashier?: string;
  payment_method?: PaymentMethod;
  created_at?: string;
};

// ---- إدارة الأصناف | manager catalog rows ----
export type AdminVariant = Variant & {
  packaging_id: string | null;
  spoon_packaging_id: string | null;
  ingredient_id: string | null;
  ingredient_qty: number | null;
  is_active: boolean;
};

export type AdminFlavor = Flavor & { sort_order: number; is_active: boolean };

export type AdminExtra = Extra & { sort_order: number; is_active: boolean };

/** مكوّن مثل الحليب — مخزون بالمل، لا يظهر كإضافة | an ingredient such as milk */
export type AdminIngredient = {
  id: string;
  name_ar: string;
  stock_qty: number;
  low_stock_qty: number;
  sort_order: number;
  is_active: boolean;
};

export type PackagingKind = "cup" | "cone" | "spoon" | "biscuit" | "bag";

export type AdminPackaging = {
  id: string;
  name_ar: string;
  kind: PackagingKind;
  stock_qty: number;
  low_stock_qty: number;
  sort_order: number;
  is_active: boolean;
};

export type AdminStaff = {
  id: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_shift_at: string | null;
};
