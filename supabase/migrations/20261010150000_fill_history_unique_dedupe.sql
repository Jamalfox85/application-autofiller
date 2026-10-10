-- Every fill was stored twice in public.fill_history (same occurred_at). The extension now
-- serializes its reconcile, and this migration removes the rows already duplicated and makes
-- a repeat insert impossible. NOT APPLIED to production: review first.

-- 1. Keep the earliest row of each (user, time, site, role) group.
delete from public.fill_history a
using public.fill_history b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.occurred_at = b.occurred_at
  and a.site is not distinct from b.site
  and a.role is not distinct from b.role;

-- 2. One row per user, moment and site.
create unique index if not exists fill_history_user_occurred_site_key
  on public.fill_history (user_id, occurred_at, coalesce(site, ''));
