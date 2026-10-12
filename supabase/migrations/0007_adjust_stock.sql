-- =====================================================================
-- تعديل المخزون | change stock, atomically.
-- p_mode 'add' → توريد/تالف: add (or subtract) an amount
-- p_mode 'set' → جرد: set the exact counted amount
-- The row is locked (FOR UPDATE) while it changes, so a sale that lands
-- at the same moment waits instead of having its deduction overwritten.
-- Returns the new stock level.
-- =====================================================================
create or replace function adjust_stock(
  p_type   text,
  p_id     uuid,
  p_mode   text,
  p_amount numeric,
  p_staff  uuid,
  p_note   text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_old   numeric;
  v_delta numeric;
  v_unit  text;
begin
  if p_mode not in ('add', 'set') then
    raise exception 'عملية غير صحيحة';
  end if;
  if p_amount is null then
    raise exception 'أدخل كمية صحيحة';
  end if;
  if p_mode = 'set' and p_amount < 0 then
    raise exception 'الرصيد لا يمكن أن يكون أقل من صفر';
  end if;

  if p_type = 'flavor' then
    select stock_grams, 'gram' into v_old, v_unit from flavors where id = p_id for update;
  elsif p_type = 'packaging' then
    select stock_qty, 'piece' into v_old, v_unit from packaging where id = p_id for update;
  elsif p_type = 'extra' then
    select stock_qty, unit into v_old, v_unit from extras where id = p_id for update;
  else
    raise exception 'نوع غير صحيح';
  end if;

  if v_old is null then
    raise exception 'الصنف غير موجود';
  end if;

  v_delta := case when p_mode = 'set' then p_amount - v_old else p_amount end;
  if v_delta = 0 then
    return v_old;
  end if;

  if p_type = 'flavor' then
    update flavors set stock_grams = stock_grams + v_delta where id = p_id;
  elsif p_type = 'packaging' then
    update packaging set stock_qty = stock_qty + v_delta where id = p_id;
  else
    update extras set stock_qty = stock_qty + v_delta where id = p_id;
  end if;

  insert into inventory_movements
    (item_type, flavor_id, packaging_id, extra_id, qty_delta, unit, reason, staff_id, note)
  values (
    p_type,
    case when p_type = 'flavor'    then p_id end,
    case when p_type = 'packaging' then p_id end,
    case when p_type = 'extra'     then p_id end,
    v_delta,
    v_unit,
    case when p_mode = 'add' and v_delta > 0 then 'restock' else 'adjustment' end,
    p_staff,
    coalesce(p_note, case when p_mode = 'set' then 'جرد' end)
  );

  return v_old + v_delta;
end;
$$;

revoke all on function adjust_stock(text, uuid, text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function adjust_stock(text, uuid, text, numeric, uuid, text) to service_role;
