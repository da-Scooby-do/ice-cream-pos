-- =====================================================================
-- ميلك شيك + سجل المبيعات | milkshakes + sales history
-- =====================================================================

-- A milkshake is a fixed-price cup (scoops × grams of ice cream, plus a
-- shake cup and a straw) shown in its own «ميلك شيك» section, so it is
-- modelled as kind 'cup' with category 'shake'.
alter table product_variants
  add column if not exists category text not null default 'icecream';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_category_check') then
    alter table product_variants
      add constraint product_variants_category_check check (category in ('icecream', 'shake'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_shake_is_cup') then
    alter table product_variants
      add constraint product_variants_shake_is_cup check (category <> 'shake' or kind = 'cup');
  end if;
end;
$$;

-- ملخص المبيعات لفترة | totals for a filtered period. Done in SQL so it
-- covers every order, not just the page being shown.
create or replace function sales_summary(
  p_from   timestamptz,
  p_to     timestamptz,
  p_staff  uuid default null,
  p_method text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with o as (
    select * from orders
     where created_at >= p_from and created_at < p_to
       and (p_staff  is null or staff_id = p_staff)
       and (p_method is null or payment_method = p_method)
  )
  select jsonb_build_object(
    'orders',       count(*) filter (where status = 'completed'),
    'total',        coalesce(sum(total) filter (where status = 'completed'), 0),
    'cash',         coalesce(sum(total) filter (where status = 'completed' and payment_method = 'cash'), 0),
    'card',         coalesce(sum(total) filter (where status = 'completed' and payment_method in ('card', 'wallet')), 0),
    'discounts',    coalesce(sum(discount) filter (where status = 'completed'), 0),
    'voids',        count(*) filter (where status = 'void'),
    'voided_total', coalesce(sum(total) filter (where status = 'void'), 0)
  )
  from o;
$$;

revoke all on function sales_summary(timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function sales_summary(timestamptz, timestamptz, uuid, text) to service_role;
