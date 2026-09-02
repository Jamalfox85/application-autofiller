-- Extension profile sync needs:
--   * a column for PersonalInfo.phoneCountryCode (e.g. "+1")
--   * a stable ordering column for skills (work_experience / education / other_links /
--     application_accounts already have display_order; skills did not)
--
-- Both are additive and default-backfilled, safe to apply to a live database.

alter table public.profiles
  add column if not exists phone_country_code text default '+1';

alter table public.skills
  add column if not exists display_order integer not null default 0;
