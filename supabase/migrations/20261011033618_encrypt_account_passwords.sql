-- Per-user key for client-side AES-GCM of Application Account passwords.
--
-- The extension encrypts application_accounts.password and the legacy
-- account_password column before save_profile, and stores the same ciphertext
-- in chrome.storage.local. This migration does not rewrite existing password
-- values. The extension encrypts a legacy plaintext value the next time a
-- signed-in session starts (service worker or popup). Values that already use
-- the ciphertext prefix are left unchanged, so the rewrite is safe to repeat.
--
-- The key is a random 32-byte secret, one row per auth user, created on first
-- fetch. Clients cannot insert, update, or delete it. They receive it only
-- from public.ensure_user_account_key(), which checks auth.uid() and returns
-- that caller's secret. The table is not granted to anon, authenticated, or
-- service_role, so the Data API cannot read it. RLS is enabled anyway: a later
-- GRANT still cannot see another user's row.
--
-- Trade-off (do not treat this as zero-knowledge): the secret and the
-- ciphertext live in the same database. A project owner, the postgres role,
-- or a full backup can read both. Vault/pgsodium would encrypt the secret at
-- rest with a root key Supabase holds outside the dump, but the extension
-- still has to receive the raw key to decrypt on each device, so a stolen
-- session would defeat Vault the same way. This design is the smaller one
-- that works across devices for one signed-in user.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.user_account_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 32 raw bytes. The extension imports this as an AES-256-GCM CryptoKey.
  secret bytea not null,
  created_at timestamptz not null default now(),
  constraint user_account_keys_secret_len check (octet_length(secret) = 32)
);

comment on table public.user_account_keys is
  'Per-user AES-256 key for Application Account passwords. Not readable through the Data API.';

alter table public.user_account_keys enable row level security;

create policy user_account_keys_select_own
  on public.user_account_keys
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No INSERT, UPDATE, or DELETE policy. Default deny. Creation is the definer
-- function below, which runs as the owner and bypasses RLS.

revoke all on table public.user_account_keys from public, anon, authenticated, service_role;

-- Ciphertext is longer than the password it replaces. Widen bounded columns
-- when they exist. text columns are left alone. Missing tables are skipped so
-- this file can apply on a database that already renamed profiles.
do $$
declare
  rec record;
begin
  for rec in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'account_password'
      and c.data_type <> 'text'
      and c.table_name in ('profiles', 'candidate_profiles')
  loop
    execute format(
      'alter table public.%I alter column account_password type text',
      rec.table_name
    );
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'application_accounts'
      and column_name = 'password'
      and data_type <> 'text'
  ) then
    alter table public.application_accounts alter column password type text;
  end if;
end
$$;

create or replace function private.ensure_user_account_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing bytea;
  created bytea;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select secret into existing
  from public.user_account_keys
  where user_id = uid;

  if existing is not null then
    return encode(existing, 'base64');
  end if;

  -- pgcrypto lives in the extensions schema on Supabase.
  created := extensions.gen_random_bytes(32);

  insert into public.user_account_keys (user_id, secret)
  values (uid, created)
  on conflict (user_id) do nothing;

  select secret into existing
  from public.user_account_keys
  where user_id = uid;

  if existing is null then
    raise exception 'account_key_unavailable' using errcode = 'P0001';
  end if;

  return encode(existing, 'base64');
end;
$$;

comment on function private.ensure_user_account_key() is
  'Returns the caller''s account-password key, creating it once. Not exposed to the Data API.';

revoke all on function private.ensure_user_account_key() from public, anon, authenticated, service_role;

-- Thin public wrapper so supabase-js can rpc('ensure_user_account_key').
-- SECURITY DEFINER so the caller does not need USAGE on private. The body
-- checks auth.uid() again; the private function checks it too.
create or replace function public.ensure_user_account_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  return private.ensure_user_account_key();
end;
$$;

comment on function public.ensure_user_account_key() is
  'Authenticated RPC: get-or-create the caller''s AES key for Application Account passwords.';

revoke all on function public.ensure_user_account_key() from public, anon, service_role;
grant execute on function public.ensure_user_account_key() to authenticated;
