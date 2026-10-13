-- =====================================================================
-- بيانات البداية | starting data for the shop
-- الأسعار بالجنيه السوداني (SDG) — عدّلها من صفحة الإعدادات
-- Prices in SDG — placeholders, edit them to match the shop
-- =====================================================================

insert into shop_settings (id, shop_name, currency, receipt_footer, default_scoop_grams)
values (true, 'محل الآيس كريم', 'SDG', 'شكراً لزيارتكم 🍦', 60)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- الموظفون | staff.  ⚠️ غيّر الأرقام السرية بعد أول تشغيل
-- ---------------------------------------------------------------------
insert into staff (name, pin_hash, role) values
  ('المدير',  crypt('1234', gen_salt('bf')), 'manager'),
  ('كاشير 1', crypt('1111', gen_salt('bf')), 'cashier')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- النكهات | flavors (stock in grams)
-- ---------------------------------------------------------------------
insert into flavors (name_ar, color, stock_grams, low_stock_grams, sort_order) values
  ('فانيلا',       '#F5E6C8',  8000, 2000,  1),
  ('شوكولاتة',     '#6B4226', 10000, 2000,  2),
  ('مانجو',        '#FFB22C',  7000, 2000,  3),
  ('مستكة',        '#F7F3E8',  6000, 2000,  4),
  ('فراولة',       '#F2708A',  7000, 2000,  5),
  ('ليمون',        '#EDE75A',  5000, 1500,  6),
  ('كريمة',        '#FFF8E7',  6000, 2000,  7),
  ('فستق',         '#A8C256',  5000, 1500,  8),
  ('كراميل',       '#C98A3C',  5000, 1500,  9),
  ('تمر',          '#7B4B2A',  4000, 1500, 10),
  ('موز',          '#F5D76E',  4000, 1500, 11),
  ('جوز الهند',    '#FBFBF5',  4000, 1500, 12)
on conflict (name_ar) do nothing;

-- ---------------------------------------------------------------------
-- مواد التعبئة | packaging (by piece)
-- ---------------------------------------------------------------------
insert into packaging (name_ar, kind, stock_qty, low_stock_qty, sort_order) values
  ('كوب صغير', 'cup',     500, 100, 1),
  ('كوب وسط',  'cup',     400, 100, 2),
  ('كوب كبير', 'cup',     300,  80, 3),
  ('كون',      'cone',    400, 100, 4),
  ('بسكويت',   'biscuit', 300,  80, 5),
  ('ملعقة',    'spoon',  1000, 200, 6),
  ('كيس',      'bag',     300, 100, 7),
  ('كوب ميلك شيك', 'cup', 300,  50, 8),
  ('شفاطة',    'spoon',   500, 100, 9)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- الأصناف | product variants = the POS buttons
-- ---------------------------------------------------------------------

-- بالسكوب | by scoop (served in a cup + spoon)
insert into product_variants
  (name_ar, kind, scoops, grams_per_scoop, price, packaging_id, spoon_packaging_id, max_flavors, sort_order)
select v.name_ar, 'scoop', v.scoops, 60, v.price,
       (select id from packaging where name_ar = 'كوب صغير'),
       (select id from packaging where name_ar = 'ملعقة'),
       v.max_flavors, v.sort_order
from (values
  ('سكوب واحد',    1,  800::numeric, 1, 1),
  ('سكوبين',       2, 1500::numeric, 2, 2),
  ('ثلاثة سكوبات', 3, 2100::numeric, 3, 3)
) as v(name_ar, scoops, price, max_flavors, sort_order)
on conflict do nothing;

-- أكواب جاهزة | fixed-size cups
insert into product_variants
  (name_ar, kind, scoops, grams_per_scoop, price, packaging_id, spoon_packaging_id, max_flavors, sort_order)
values
  ('كوب صغير', 'cup', 2, 60, 1200,
     (select id from packaging where name_ar = 'كوب صغير'),
     (select id from packaging where name_ar = 'ملعقة'), 2, 10),
  ('كوب وسط',  'cup', 3, 60, 2000,
     (select id from packaging where name_ar = 'كوب وسط'),
     (select id from packaging where name_ar = 'ملعقة'), 3, 11),
  ('كوب كبير', 'cup', 5, 60, 3000,
     (select id from packaging where name_ar = 'كوب كبير'),
     (select id from packaging where name_ar = 'ملعقة'), 4, 12)
on conflict do nothing;

-- بالوزن | by weight (priced per kg, packed in a bag)
insert into product_variants
  (name_ar, kind, price_per_kg, packaging_id, max_flavors, sort_order)
values
  ('بالوزن', 'weight', 6000,
     (select id from packaging where name_ar = 'كيس'), 4, 20)
on conflict do nothing;

-- كون وبسكويت | cones & biscuits
insert into product_variants
  (name_ar, kind, scoops, grams_per_scoop, price, packaging_id, max_flavors, sort_order)
values
  ('كون سكوب',   'cone', 1, 60, 1000,
     (select id from packaging where name_ar = 'كون'), 1, 30),
  ('كون سكوبين', 'cone', 2, 60, 1800,
     (select id from packaging where name_ar = 'كون'), 2, 31),
  ('بسكويت',     'cone', 2, 60, 1200,
     (select id from packaging where name_ar = 'بسكويت'), 2, 32)
on conflict do nothing;

-- ميلك شيك | milkshakes — a fixed-price cup in the 'shake' category
insert into product_variants
  (name_ar, kind, category, scoops, grams_per_scoop, price, packaging_id, spoon_packaging_id, max_flavors, sort_order)
select v.name_ar, 'cup', 'shake', v.scoops, 60, v.price,
       (select id from packaging where name_ar = 'كوب ميلك شيك'),
       (select id from packaging where name_ar = 'شفاطة'),
       v.max_flavors, v.sort_order
from (values
  ('ميلك شيك صغير', 2, 1500::numeric, 2, 40),
  ('ميلك شيك وسط',  3, 2000::numeric, 2, 41),
  ('ميلك شيك كبير', 4, 2500::numeric, 3, 42)
) as v(name_ar, scoops, price, max_flavors, sort_order)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- الإضافات | extras
-- ---------------------------------------------------------------------
insert into extras (name_ar, price, unit, qty_per_use, stock_qty, low_stock_qty, sort_order) values
  ('صوص لوتس',        500, 'portion', 1, 200, 20, 1),
  ('نوتيلا',          600, 'portion', 1, 200, 20, 2),
  ('مكسرات',          400, 'portion', 1, 250, 25, 3),
  ('رشة شوكولاتة',    200, 'portion', 1, 300, 30, 4),
  ('سبرنكلز',         200, 'portion', 1, 300, 30, 5),
  ('شوكولاتة سائلة',  400, 'portion', 1, 250, 25, 6),
  ('عسل',             300, 'portion', 1, 150, 15, 7)
on conflict (name_ar) do nothing;

-- ---------------------------------------------------------------------
-- الحليب | milk — an ingredient (not a topping), tracked in ml.
-- 20 L to start, alert at 5 L; milkshakes use 100 ml per scoop.
-- ---------------------------------------------------------------------
insert into extras (name_ar, price, unit, qty_per_use, stock_qty, low_stock_qty, kind, sort_order)
values ('حليب', 0, 'ml', 1, 20000, 5000, 'ingredient', 100)
on conflict (name_ar) do nothing;

update product_variants
   set ingredient_id  = (select id from extras where name_ar = 'حليب'),
       ingredient_qty = coalesce(scoops, 3) * 100
 where category = 'shake' and ingredient_id is null;
