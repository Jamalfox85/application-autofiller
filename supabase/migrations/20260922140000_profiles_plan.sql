-- Entitlement column read by the resume API when ENFORCE_PLAN_GATE is on.
-- Values are free | pro. Existing rows backfill to free.
--
-- This does not revoke UPDATE on the column. The write-lock is not live yet, so
-- the extension's user-JWT update of its own row is best-effort until the
-- backend says the lock has shipped.

alter table public.profiles
  add column if not exists plan text not null default 'free';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'pro'));
  end if;
end $$;
