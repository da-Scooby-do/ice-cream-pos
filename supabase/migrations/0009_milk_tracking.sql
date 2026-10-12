-- =====================================================================
-- تتبع الحليب | milk (and any other ingredient) tracked in stock
-- An ingredient is an extras row with kind = 'ingredient': it has stock,
-- a unit (ml), a low-stock alert and a movement history, but it never
-- appears among the toppings on the counter screen. A product can use
-- one ingredient per unit sold (ingredient_qty, e.g. 300 ml of milk in a
-- medium shake); create_order deducts it and void_order returns it.
-- =====================================================================

alter table extras add column if not exists kind text not null default 'topping';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'extras_kind_check') then
    alter table extras add constraint extras_kind_check check (kind in ('topping', 'ingredient'));
  end if;
end;
$$;

alter table product_variants add column if not exists ingredient_id uuid references extras(id);
alter table product_variants add column if not exists ingredient_qty numeric(10,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_ingredient_qty_check') then
    alter table product_variants
      add constraint product_variants_ingredient_qty_check check (ingredient_qty is null or ingredient_qty >= 0);
  end if;
end;
$$;

-- create_order, unchanged except for the ingredient block
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
set search_path = public, extensions
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

    -- ---- المكوّن (الحليب) | the product's ingredient, e.g. milk in a shake ----
    if v_variant.ingredient_id is not null and coalesce(v_variant.ingredient_qty, 0) > 0 then
      update extras
         set stock_qty = stock_qty - v_variant.ingredient_qty * v_qty
       where id = v_variant.ingredient_id;
      insert into inventory_movements
        (item_type, extra_id, qty_delta, unit, reason, order_id, staff_id)
      select 'extra', e.id, -(v_variant.ingredient_qty * v_qty), e.unit, 'sale', v_order_id, p_staff_id
        from extras e where e.id = v_variant.ingredient_id;
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

revoke all on function create_order(uuid, text, jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function create_order(uuid, text, jsonb, numeric, numeric) to service_role;
