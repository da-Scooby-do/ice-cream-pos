-- =====================================================================
-- حذف الموظفين | removing staff
-- "Deleting" a person archives them: they vanish from the staff list and
-- the login screen, but the row stays so old receipts, shifts and
-- Z-reports keep their name.
-- =====================================================================

alter table staff add column if not exists deleted_at timestamptz;

create or replace function archive_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from staff where id = p_staff_id and deleted_at is null) then
    raise exception 'الموظف غير موجود';
  end if;

  if exists (select 1 from shifts where staff_id = p_staff_id and status = 'open') then
    raise exception 'لهذا الموظف وردية مفتوحة. أقفلها أولاً ثم احذفه.';
  end if;

  update staff set deleted_at = now(), is_active = false where id = p_staff_id;
end;
$$;

revoke all on function archive_staff(uuid) from public, anon, authenticated;
grant execute on function archive_staff(uuid) to service_role;
