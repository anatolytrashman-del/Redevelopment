-- 20261023-osnova-03-legacy-guard.sql
-- THIS MIGRATION CHANGES RLS ON EXISTING (LEGACY) TABLES. IT IS NOT TO BE APPLIED WITHOUT ANATOLY'S SEPARATE APPROVAL.
-- MUST BE APPLIED BEFORE ANY CLIENT-ONLY USER ACCOUNT (E.G. A CLIENT EMPLOYEE) IS CREATED.
-- Adds RESTRICTIVE policy "osnova_legacy_guard" on legacy public tables that have RLS enabled,
-- and on storage.objects for non client-files buckets. Only denies for authenticated users who
-- have a row in client_members (i.e. pure client users). Existing accounts without client_members
-- keep full access (function returns true for them).
-- Idempotent. Does NOT enable RLS on any table (known gap: legacy tables without RLS stay without).
-- Does not modify any existing policies.
--
-- Откат:
--   DO $$
--   DECLARE r record;
--   BEGIN
--     FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS osnova_legacy_guard ON public.%I', r.tablename);
--     END LOOP;
--     DROP POLICY IF EXISTS osnova_legacy_guard_storage ON storage.objects;
--   END $$;
--   drop function if exists public.osnova_is_legacy_allowed();
--   NOTIFY pgrst, 'reload schema';

-- Function: returns true for anon (null uid), platform_owner, or users that have NO client_members row.
create or replace function public.osnova_is_legacy_allowed()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() is null
    or public.osnova_is_platform_owner()
    or not exists(select 1 from public.client_members where user_id = auth.uid());
$$;

revoke all on function public.osnova_is_legacy_allowed() from public, anon, authenticated;
grant execute on function public.osnova_is_legacy_allowed() to anon, authenticated, service_role;

-- Apply RESTRICTIVE guard to all currently RLS-enabled public tables EXCEPT the osnova (new) tables.
-- Use format for safe quoting. Only on tables that already have RLS (do not enable RLS).
DO $$
DECLARE
  r record;
  cnt int := 0;
  osnova_tables text[] := array[
    'clients','platform_roles','user_profiles','positions','client_members',
    'security_log','auth_login_attempts','auth_provider_configs',
    'client_requests','client_request_events','client_added_suppliers',
    'client_supplier_notes','client_supplier_prices',
    'import_batches','client_approval_rules'
  ];
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public'
      AND c.relrowsecurity = true
      AND NOT (t.tablename = ANY(osnova_tables))
    ORDER BY tablename
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS osnova_legacy_guard ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY osnova_legacy_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.osnova_is_legacy_allowed())) WITH CHECK ((select public.osnova_is_legacy_allowed()))',
      r.tablename
    );
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'osnova_legacy_guard applied to % legacy tables', cnt;
END $$;

-- Storage: RESTRICTIVE guard on storage.objects for buckets other than 'client-files'.
-- client-only users (those with client_members, not owners) cannot access legacy buckets via authenticated.
DROP POLICY IF EXISTS osnova_legacy_guard_storage ON storage.objects;
CREATE POLICY osnova_legacy_guard_storage ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id = 'client-files' OR (select public.osnova_is_legacy_allowed())
  )
  WITH CHECK (
    bucket_id = 'client-files' OR (select public.osnova_is_legacy_allowed())
  );

NOTIFY pgrst, 'reload schema';
