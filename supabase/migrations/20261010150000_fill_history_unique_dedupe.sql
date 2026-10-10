-- Every fill was stored twice in public.fill_history (same occurred_at). The extension now
-- serializes its reconcile, and this migration removes the rows already duplicated and makes
-- a repeat insert impossible. NOT APPLIED to production: review first. Do not run it from the app.

-- 1. Keep the earliest row of each (user, moment, site) group.
-- Role is not part of the key. The unique index below is (user_id, occurred_at, site); leaving
-- two rows that differ only by role would make that index fail to build and roll this delete back.
delete from public.fill_history a
using public.fill_history b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.occurred_at = b.occurred_at
  and a.site is not distinct from b.site;

-- 2. One row per user, moment and site. NULLS NOT DISTINCT so a missing site (stored as null)
-- cannot be inserted twice: a plain unique index treats nulls as different values.
create unique index if not exists fill_history_user_occurred_site_key
  on public.fill_history (user_id, occurred_at, site) nulls not distinct;
-- The extension inserts rows and ignores the 23505 this index raises for a row that is already
-- stored (two extension pages reconciling at once). It does not need an upsert, so it works the
-- same before and after this migration.
