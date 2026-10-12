-- =====================================================================
-- اختياري | OPTIONAL — let a removed person's name be used again.
-- Run this once in the Supabase SQL Editor. Until then, a name that
-- belonged to a removed staff member can't be given to someone new.
-- =====================================================================

drop index if exists staff_name_unique;
create unique index staff_name_unique on staff (name) where deleted_at is null;
