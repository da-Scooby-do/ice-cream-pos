-- =====================================================================
-- إدارة الموظفين | staff management
-- =====================================================================

-- اسمان متطابقان يربكان شاشة الدخول | two identical names confuse the login screen
create unique index if not exists staff_name_unique on staff (name);

-- إنشاء موظف مع تشفير الرقم السري | create a staff member, PIN bcrypt-hashed in the DB
create or replace function create_staff(p_name text, p_role text, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if p_role not in ('cashier', 'manager') then
    raise exception 'الصلاحية غير صحيحة';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'الرقم السري من 4 إلى 6 أرقام';
  end if;

  insert into staff (name, role, pin_hash)
  values (p_name, p_role, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function create_staff(text, text, text) from public, anon, authenticated;
grant execute on function create_staff(text, text, text) to service_role;
