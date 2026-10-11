-- Weekly free fills are per GoFillr account. The extension used to keep that
-- count only in chrome.storage. This adds the bit that distinguishes a Pro fill
-- from a counted free fill, and an authenticated RPC that counts the caller's
-- rows for one local ISO week.
--
-- NOT APPLIED. Review, then apply. Do not run it from the app.
--
-- Existing rows: counted_toward_free_quota defaults to true, and this file does
-- not update them. fill_history has no plan snapshot. public.profiles.plan is the
-- account's current plan, not the plan at the time of the fill, so a row cannot
-- be shown to have been a Pro fill. None are reclassified. Fills recorded after
-- this column exists set the flag false when the extension is Pro, and true for
-- a counted free fill (including Workday, which is counted but never hard-stopped).
-- A later step of the same application is not a new fill and is not inserted, so
-- it is not counted here either.
--
-- The count is distinct (occurred_at, site). Rows already stored twice with the
-- same instant and site (see 20261010150000_fill_history_unique_dedupe.sql) must
-- not consume two free fills. Postgres DISTINCT treats null sites as equal, matching
-- that unique index.
--
-- The extension computes Monday 00:00 local through the next Monday 00:00 local
-- (the same window as calendarWeekKey / localWeekRange) and passes those instants.
-- The function rejects a window that is not about seven days so a bad caller cannot
-- count the whole history as one week. Identity is auth.uid() only.

alter table public.fill_history
  add column if not exists counted_toward_free_quota boolean not null default true;

comment on column public.fill_history.counted_toward_free_quota is
  'True when this fill counts toward the weekly free cap. False for a fill recorded while Pro. Existing rows stay true: the table has no per-fill plan, so none are obviously Pro.';

create index if not exists fill_history_free_quota_week_idx
  on public.fill_history (user_id, occurred_at)
  where counted_toward_free_quota;

create or replace function public.free_fills_this_week(week_start timestamptz, week_end timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  total integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if week_start is null
     or week_end is null
     or week_end <= week_start
     or week_end - week_start < interval '6 days'
     or week_end - week_start > interval '8 days' then
    raise exception 'invalid_week' using errcode = 'P0001';
  end if;

  select count(*)::integer into total
  from (
    select distinct h.occurred_at, h.site
    from public.fill_history h
    where h.user_id = uid
      and h.counted_toward_free_quota
      and h.occurred_at >= week_start
      and h.occurred_at < week_end
  ) counted;

  return coalesce(total, 0);
end;
$$;

comment on function public.free_fills_this_week(timestamptz, timestamptz) is
  'Authenticated RPC: how many of the caller''s fill_history rows count toward the free cap in the given local ISO week. Pro rows (counted_toward_free_quota = false) are excluded. Duplicate (occurred_at, site) rows count once.';

revoke all on function public.free_fills_this_week(timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.free_fills_this_week(timestamptz, timestamptz) to authenticated;
