-- =====================================================================
-- الدوال والتقارير | functions, views, security
-- =====================================================================

-- ---------------------------------------------------------------------
-- التحقق من الرقم السري | verify a staff PIN
-- ---------------------------------------------------------------------
create or replace function verify_staff_pin(p_staff_id uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
    where id = p_staff_id
      and is_active
      and pin_hash = crypt(p_pin, pin_hash)
  );
$$;

-- تعيين رقم سري | set / change a PIN (hashes it)
create or replace function set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language sql
security definer
set search_path = public
as $$
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_staff_id;
$$;

-- ---------------------------------------------------------------------
-- فتح وردية | open a shift
-- ---------------------------------------------------------------------
create or replace function open_shift(p_staff_id uuid, p_opening_cash numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if exists (select 1 from shifts where status = 'open') then
    raise exception 'هناك وردية مفتوحة بالفعل. أقفلها أولاً.';
  end if;

  insert into shifts (staff_id, opening_cash)
  values (p_staff_id, coalesce(p_opening_cash, 0))
  returning id into v_id;

  return jsonb_build_object('shift_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- إنشاء فاتورة | create an order + deduct inventory, atomically.
-- Prices are ALWAYS recomputed from the database — never trusted
-- from the client.
--
-- p_items shape:
-- [{ "variant_id": uuid,
--    "qty": 1,
--    "weight_grams": 250,                      -- weight kind only
--    "flavors": [{ "flavor_id": uuid, "grams": null }],
--    "extras":  [{ "extra_id":  uuid, "qty": 1 }] }]
-- ---------------------------------------------------------------------
create or replace function create_order(
  p_staff_id       uuid,
  p_payment_method text,
  p_items          jsonb,
  p_discount       numeric default 0,
  p_paid_amount    numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id      uuid;
  v_order_id      uuid;
  v_order_no      bigint;
  v_default_scoop numeric;
  v_item          jsonb;
  v_variant       product_variants;
  v_item_id       uuid;
  v_unit_price    numeric(12,2);
  v_extras_total  numeric(12,2);
  v_line_total    numeric(12,2);
  v_qty           int;
  v_weight        numeric(12,2);
  v_content_grams numeric(12,2);
  v_flavors       jsonb;
  v_n_flavors     int;
  v_flavor        jsonb;
  v_flavor_row    flavors;
  v_grams         numeric(12,2);
  v_extra         jsonb;
  v_extra_row     extras;
  v_extra_qty     numeric(10,2);
  v_subtotal      numeric(12,2) := 0;
  v_total         numeric(12,2);
begin
  if p_payment_method not in ('cash','card','wallet') then
    raise exception 'طريقة دفع غير صحيحة: %', p_payment_method;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'الفاتورة فارغة';
  end if;

  select id into v_shift_id from shifts where status = 'open' limit 1;
  if v_shift_id is null then
    raise exception 'لا توجد وردية مفتوحة. افتح الوردية أولاً.';
  end if;

  select default_scoop_grams into v_default_scoop from shop_settings where id;
  v_default_scoop := coalesce(v_default_scoop, 60);

  insert into orders (shift_id, staff_id, payment_method, discount, paid_amount)
  values (v_shift_id, p_staff_id, p_payment_method, coalesce(p_discount, 0), p_paid_amount)
  returning id, order_no into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_variant
      from product_variants
     where id = (v_item->>'variant_id')::uuid;

    if v_variant.id is null then
      raise exception 'صنف غير موجود في قائمة الأسعار';
    end if;

    v_qty    := greatest(coalesce((v_item->>'qty')::int, 1), 1);
    v_weight := nullif(v_item->>'weight_grams', '')::numeric;

    -- ---- السعر | price, from the DB ----
    if v_variant.kind = 'weight' then
      if v_weight is null or v_weight <= 0 then
        raise exception 'أدخل الوزن للصنف %', v_variant.name_ar;
      end if;
      v_unit_price    := round(v_variant.price_per_kg * v_weight / 1000.0, 2);
      v_content_grams := v_weight;
    else
      v_unit_price    := v_variant.price;
      v_content_grams := coalesce(v_variant.scoops, 1)
                       * coalesce(v_variant.grams_per_scoop, v_default_scoop);
    end if;

    -- ---- الإضافات: المجموع أولاً | extras subtotal first ----
    v_extras_total := 0;
    for v_extra in select * from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb))
    loop
      select * into v_extra_row from extras where id = (v_extra->>'extra_id')::uuid;
      if v_extra_row.id is not null then
        v_extras_total := v_extras_total
          + v_extra_row.price * coalesce((v_extra->>'qty')::numeric, 1);
      end if;
    end loop;

    v_line_total := round((v_unit_price + v_extras_total) * v_qty, 2);
    v_subtotal   := v_subtotal + v_line_total;

    insert into order_items (
      order_id, variant_id, name_ar, kind, scoops, weight_grams,
      qty, unit_price, extras_total, line_total
    ) values (
      v_order_id, v_variant.id, v_variant.name_ar, v_variant.kind,
      v_variant.scoops, v_weight, v_qty, v_unit_price, v_extras_total, v_line_total
    ) returning id into v_item_id;

    -- ---- النكهات + خصم المخزون | flavors + stock deduction ----
    v_flavors   := coalesce(v_item->'flavors', '[]'::jsonb);
    v_n_flavors := jsonb_array_length(v_flavors);

    for v_flavor in select * from jsonb_array_elements(v_flavors)
    loop
      select * into v_flavor_row from flavors where id = (v_flavor->>'flavor_id')::uuid;
      if v_flavor_row.id is null then
        continue;
      end if;

      -- explicit grams, else split the cup/scoop content evenly
      v_grams := coalesce(
        nullif(v_flavor->>'grams', '')::numeric,
        round(v_content_grams / greatest(v_n_flavors, 1), 2)
      ) * v_qty;

      insert into order_item_flavors (order_item_id, flavor_id, name_ar, grams)
      values (v_item_id, v_flavor_row.id, v_flavor_row.name_ar, v_grams);

      update flavors set stock_grams = stock_grams - v_grams where id = v_flavor_row.id;

      insert into inventory_movements
        (item_type, flavor_id, qty_delta, unit, reason, order_id, staff_id)
      values ('flavor', v_flavor_row.id, -v_grams, 'gram', 'sale', v_order_id, p_staff_id);
    end loop;

    -- ---- التعبئة: كوب/كون + ملعقة | packaging: cup/cone + spoon ----
    if v_variant.packaging_id is not null then
      update packaging set stock_qty = stock_qty - v_qty where id = v_variant.packaging_id;
      insert into inventory_movements
        (item_type, packaging_id, qty_delta, unit, reason, order_id, staff_id)
      values ('packaging', v_variant.packaging_id, -v_qty, 'piece', 'sale', v_order_id, p_staff_id);
    end if;

    if v_variant.spoon_packaging_id is not null then
      update packaging set stock_qty = stock_qty - v_qty where id = v_variant.spoon_packaging_id;
      insert into inventory_movements
        (item_type, packaging_id, qty_delta, unit, reason, order_id, staff_id)
      values ('packaging', v_variant.spoon_packaging_id, -v_qty, 'piece', 'sale', v_order_id, p_staff_id);
    end if;

    -- ---- تسجيل الإضافات + خصمها | record + deduct extras ----
    for v_extra in select * from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb))
    loop
      select * into v_extra_row from extras where id = (v_extra->>'extra_id')::uuid;
      if v_extra_row.id is null then
        continue;
      end if;

      v_extra_qty := coalesce((v_extra->>'qty')::numeric, 1) * v_qty;

      insert into order_item_extras (order_item_id, extra_id, name_ar, qty, price)
      values (v_item_id, v_extra_row.id, v_extra_row.name_ar, v_extra_qty, v_extra_row.price);

      update extras
         set stock_qty = stock_qty - (v_extra_row.qty_per_use * v_extra_qty)
       where id = v_extra_row.id;

      insert into inventory_movements
        (item_type, extra_id, qty_delta, unit, reason, order_id, staff_id)
      values ('extra', v_extra_row.id,
              -(v_extra_row.qty_per_use * v_extra_qty), v_extra_row.unit,
              'sale', v_order_id, p_staff_id);
    end loop;
  end loop;

  v_total := greatest(round(v_subtotal - coalesce(p_discount, 0), 2), 0);

  update orders
     set subtotal      = v_subtotal,
         total         = v_total,
         change_amount = case
                           when p_paid_amount is null then null
                           else round(p_paid_amount - v_total, 2)
                         end
   where id = v_order_id;

  -- the receipt payload, ready to print
  return jsonb_build_object(
    'order_id',  v_order_id,
    'order_no',  v_order_no,
    'subtotal',  v_subtotal,
    'discount',  coalesce(p_discount, 0),
    'total',     v_total,
    'change',    case when p_paid_amount is null then null else round(p_paid_amount - v_total, 2) end,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name_ar',    oi.name_ar,
               'qty',        oi.qty,
               'unit_price', oi.unit_price,
               'line_total', oi.line_total,
               'weight_grams', oi.weight_grams,
               'flavors', (select coalesce(jsonb_agg(f.name_ar), '[]'::jsonb)
                             from order_item_flavors f where f.order_item_id = oi.id),
               'extras',  (select coalesce(jsonb_agg(jsonb_build_object(
                                    'name_ar', e.name_ar, 'price', e.price)), '[]'::jsonb)
                             from order_item_extras e where e.order_item_id = oi.id)
             ) order by oi.id), '[]'::jsonb)
        from order_items oi where oi.order_id = v_order_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- إلغاء فاتورة | void an order and return its stock
-- ---------------------------------------------------------------------
create or replace function void_order(p_order_id uuid, p_staff_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not exists (select 1 from orders where id = p_order_id and status = 'completed') then
    raise exception 'الفاتورة غير موجودة أو ملغاة مسبقاً';
  end if;

  -- reverse every movement this order caused
  for r in select * from inventory_movements where order_id = p_order_id and reason = 'sale'
  loop
    if r.item_type = 'flavor' then
      update flavors   set stock_grams = stock_grams - r.qty_delta where id = r.flavor_id;
    elsif r.item_type = 'packaging' then
      update packaging set stock_qty   = stock_qty   - r.qty_delta where id = r.packaging_id;
    else
      update extras    set stock_qty   = stock_qty   - r.qty_delta where id = r.extra_id;
    end if;

    insert into inventory_movements
      (item_type, flavor_id, packaging_id, extra_id, qty_delta, unit, reason, order_id, staff_id, note)
    values (r.item_type, r.flavor_id, r.packaging_id, r.extra_id,
            -r.qty_delta, r.unit, 'void', p_order_id, p_staff_id, p_reason);
  end loop;

  update orders
     set status = 'void', voided_at = now(), void_reason = p_reason
   where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- ملخص الوردية | shift summary (used live and on the Z-report)
-- ---------------------------------------------------------------------
create or replace function shift_summary(p_shift_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with s as (select * from shifts where id = p_shift_id),
  o as (
    select * from orders
     where shift_id = p_shift_id and status = 'completed'
  )
  select jsonb_build_object(
    'shift_id',      s.id,
    'cashier',       st.name,
    'opened_at',     s.opened_at,
    'closed_at',     s.closed_at,
    'status',        s.status,
    'opening_cash',  s.opening_cash,
    'counted_cash',  s.counted_cash,
    'orders_count',  (select count(*) from o),
    'cash_sales',    (select coalesce(sum(total),0) from o where payment_method = 'cash'),
    'card_sales',    (select coalesce(sum(total),0) from o where payment_method in ('card','wallet')),
    'total_sales',   (select coalesce(sum(total),0) from o),
    'discounts',     (select coalesce(sum(discount),0) from o),
    'voids_count',   (select count(*) from orders where shift_id = p_shift_id and status = 'void'),
    'expected_cash', s.opening_cash
                     + (select coalesce(sum(total),0) from o where payment_method = 'cash'),
    'difference',    case when s.counted_cash is null then null else
                       s.counted_cash - (s.opening_cash
                       + (select coalesce(sum(total),0) from o where payment_method = 'cash'))
                     end,
    'top_flavors', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select oif.name_ar, round(sum(oif.grams)) as grams
          from order_item_flavors oif
          join order_items oi on oi.id = oif.order_item_id
          join o on o.id = oi.order_id
         group by oif.name_ar
         order by sum(oif.grams) desc
         limit 8
      ) t
    )
  )
  from s join staff st on st.id = s.staff_id;
$$;

-- ---------------------------------------------------------------------
-- تقفيل الوردية | close the shift, return the Z-report
-- ---------------------------------------------------------------------
create or replace function close_shift(p_shift_id uuid, p_counted_cash numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from shifts where id = p_shift_id and status = 'open') then
    raise exception 'الوردية غير مفتوحة';
  end if;

  update shifts
     set counted_cash = p_counted_cash,
         note         = p_note,
         closed_at    = now(),
         status       = 'closed'
   where id = p_shift_id;

  return shift_summary(p_shift_id);
end;
$$;

-- ---------------------------------------------------------------------
-- تنبيه النقص | low-stock view, drives the red badges
-- ---------------------------------------------------------------------
create or replace view v_low_stock as
  select 'flavor'::text as item_type, id, name_ar,
         stock_grams as stock, low_stock_grams as threshold, 'gram'::text as unit
    from flavors where is_active and stock_grams <= low_stock_grams
  union all
  select 'packaging', id, name_ar, stock_qty, low_stock_qty, 'piece'
    from packaging where is_active and stock_qty <= low_stock_qty
  union all
  select 'extra', id, name_ar, stock_qty, low_stock_qty, unit
    from extras where is_active and stock_qty <= low_stock_qty;

-- ---------------------------------------------------------------------
-- المبيعات اليومية | daily sales, for dad's phone
-- ---------------------------------------------------------------------
create or replace view v_daily_sales as
  select (created_at at time zone 'Africa/Khartoum')::date as day,
         count(*)                                          as orders_count,
         coalesce(sum(total), 0)                           as total_sales,
         coalesce(sum(total) filter (where payment_method = 'cash'), 0)              as cash_sales,
         coalesce(sum(total) filter (where payment_method in ('card','wallet')), 0)  as card_sales,
         coalesce(sum(discount), 0)                        as discounts
    from orders
   where status = 'completed'
   group by 1
   order by 1 desc;

-- ---------------------------------------------------------------------
-- الأمان | security: lock everything down.
-- RLS is enabled with NO policies, so the anon/authenticated roles see
-- nothing. (Not FORCEd: the SECURITY DEFINER functions above run as the
-- table owner and must keep working.)
-- All reads/writes go through the Next.js server with the service-role
-- key. The anon/publishable key can touch nothing, so the app is safe
-- to expose on the open internet.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'shop_settings','staff','flavors','packaging','product_variants','extras',
    'shifts','orders','order_items','order_item_flavors','order_item_extras',
    'inventory_movements'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end;
$$;

revoke all on function create_order(uuid, text, jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function open_shift(uuid, numeric)            from public, anon, authenticated;
revoke all on function close_shift(uuid, numeric, text)     from public, anon, authenticated;
revoke all on function void_order(uuid, uuid, text)         from public, anon, authenticated;
revoke all on function verify_staff_pin(uuid, text)         from public, anon, authenticated;
revoke all on function set_staff_pin(uuid, text)            from public, anon, authenticated;
revoke all on function shift_summary(uuid)                  from public, anon, authenticated;

-- views run with the owner's rights by default and would skip RLS —
-- make them obey the caller, and take them away from the public roles.
alter view v_low_stock   set (security_invoker = true);
alter view v_daily_sales set (security_invoker = true);
revoke all on v_low_stock, v_daily_sales from anon, authenticated;
