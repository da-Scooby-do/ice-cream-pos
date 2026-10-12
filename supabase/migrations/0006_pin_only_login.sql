-- =====================================================================
-- الدخول بالرقم السري فقط | PIN-only login
-- The login screen no longer lists names: the PIN alone identifies the
-- person. So every active PIN must be unique, and wrong guesses are
-- throttled per device (8 failures / 10 minutes).
-- =====================================================================

-- محاولات الدخول الخاطئة | failed login attempts, for throttling
create table if not exists login_failures (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_ip_at on login_failures (ip, at desc);
alter table login_failures enable row level security;
revoke all on table login_failures from anon, authenticated;

-- هل الرقم مستخدم؟ | is this PIN already used by another active person?
create or replace function pin_in_use(p_pin text, p_except uuid default null)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from staff s
    where s.is_active
      and s.deleted_at is null
      and (p_except is null or s.id <> p_except)
      and s.pin_hash = crypt(p_pin, s.pin_hash)
  );
$$;

-- الدخول | log in with a PIN. Empty result = wrong PIN.
create or replace function login_with_pin(p_pin text, p_ip text)
returns table (id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip    text := coalesce(nullif(p_ip, ''), 'unknown');
  v_fails int;
  v_hits  int;
begin
  select count(*) into v_fails
    from login_failures f
   where f.ip = v_ip and f.at > now() - interval '10 minutes';
  if v_fails >= 8 then
    raise exception 'محاولات خاطئة كثيرة. انتظر 10 دقائق ثم حاول مجدداً.';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'الرقم السري من 4 إلى 6 أرقام';
  end if;

  select count(*) into v_hits
    from staff s
   where s.is_active and s.deleted_at is null
     and s.pin_hash = crypt(p_pin, s.pin_hash);

  if v_hits = 0 then
    insert into login_failures (ip) values (v_ip);
    return;
  end if;

  if v_hits > 1 then
    raise exception 'هذا الرقم السري مستخدم لأكثر من موظف. اطلب من المدير تغييره.';
  end if;

  return query
    select s.id, s.name, s.role
      from staff s
     where s.is_active and s.deleted_at is null
       and s.pin_hash = crypt(p_pin, s.pin_hash);
end;
$$;

-- الأرقام السرية فريدة | creating or changing a PIN rejects one already in use
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
  if pin_in_use(p_pin) then
    raise exception 'هذا الرقم السري مستخدم لموظف آخر. اختر رقماً مختلفاً.';
  end if;

  insert into staff (name, role, pin_hash)
  values (p_name, p_role, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'الرقم السري من 4 إلى 6 أرقام';
  end if;
  if pin_in_use(p_pin, p_staff_id) then
    raise exception 'هذا الرقم السري مستخدم لموظف آخر. اختر رقماً مختلفاً.';
  end if;
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_staff_id;
end;
$$;

revoke all on function pin_in_use(text, uuid)        from public, anon, authenticated;
revoke all on function login_with_pin(text, text)    from public, anon, authenticated;
revoke all on function create_staff(text, text, text) from public, anon, authenticated;
revoke all on function set_staff_pin(uuid, text)     from public, anon, authenticated;
grant execute on function pin_in_use(text, uuid)        to service_role;
grant execute on function login_with_pin(text, text)    to service_role;
grant execute on function create_staff(text, text, text) to service_role;
grant execute on function set_staff_pin(uuid, text)     to service_role;
