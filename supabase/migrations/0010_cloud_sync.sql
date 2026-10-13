-- =====================================================================
-- النسخة السحابية | the cloud copy for the desktop app (v2).
--
-- From v2 the shop runs on a laptop app with its own database. The laptop
-- copies every change here (cloud_rows) and publishes ready-made reports
-- (cloud_snapshots) for the owner's phone. Only the Vercel server writes or
-- reads these tables, with the secret key; the public key can do nothing.
--
-- The v1 tables (staff, orders, …) are no longer used by the app and can be
-- dropped once you no longer need their history.
-- =====================================================================

create table if not exists cloud_rows (
  tbl        text not null,
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tbl, id)
);

create table if not exists cloud_snapshots (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table cloud_rows enable row level security;
alter table cloud_snapshots enable row level security;

revoke all on table cloud_rows from public, anon, authenticated;
revoke all on table cloud_snapshots from public, anon, authenticated;
grant all on table cloud_rows to service_role;
grant all on table cloud_snapshots to service_role;

-- محاولات الدخول الخاطئة من الجوال | wrong-PIN throttle for the phone login
-- (already exists if the v1 migrations were applied)
create table if not exists login_failures (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_ip_at on login_failures (ip, at desc);
alter table login_failures enable row level security;
revoke all on table login_failures from public, anon, authenticated;
grant all on table login_failures to service_role;
