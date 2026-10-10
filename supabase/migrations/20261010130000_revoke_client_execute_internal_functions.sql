-- Security advisor fixes (2.0 launch checklist).
--
-- public.increment_usage(uuid, text) and public.rls_auto_enable() are SECURITY DEFINER
-- and were executable by PUBLIC, anon and authenticated (callable through the Data API).
-- Neither is called by the extension or the Go API (grep verified); rls_auto_enable is the
-- body of the ensure_rls event trigger, which runs as the owner and needs no client grant.
-- Revoke client EXECUTE, keep service_role, and pin search_path on increment_usage.
--
-- profiles.plan is NOT changed here: a column-level REVOKE is ineffective while the
-- table-level UPDATE/INSERT grants exist (see 20260922144859_lock_profiles_plan_writes.sql);
-- the BEFORE STATEMENT/ROW guard triggers there already reject any non-service_role change
-- to plan. No data is modified.

alter function public.increment_usage(uuid, text) set search_path = pg_catalog, public;

revoke all on function public.increment_usage(uuid, text) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.increment_usage(uuid, text) to service_role;
grant execute on function public.rls_auto_enable() to service_role;
