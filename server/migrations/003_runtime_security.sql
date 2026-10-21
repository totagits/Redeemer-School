-- Least-privilege runtime role and a narrowly scoped school-code resolver.
-- DATABASE_URL remains the migration/admin connection. Runtime requests must use
-- RUNTIME_DATABASE_URL with redeemer_runtime, which is neither superuser nor BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'redeemer_runtime') THEN
    EXECUTE 'CREATE ROLE redeemer_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE redeemer_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'redeemer_auth_lookup') THEN
    EXECUTE 'CREATE ROLE redeemer_auth_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE redeemer_auth_lookup WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO redeemer_runtime', current_database());
END $$;
GRANT USAGE ON SCHEMA public, app TO redeemer_runtime;
GRANT SELECT ON TABLE public.permissions TO redeemer_runtime;
-- School rows remain protected by the forced tenant RLS policy. This SELECT is
-- needed to return the signed-in user's school name and school configuration.
GRANT SELECT ON TABLE public.schools TO redeemer_runtime;
GRANT EXECUTE ON FUNCTION app.current_school_id() TO redeemer_runtime;

DO $$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
    GROUP BY c.table_name
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO redeemer_runtime',
      target_table.table_name
    );
  END LOOP;
END $$;

-- Audit history is append-only for the application role.
REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM redeemer_runtime;
GRANT SELECT, INSERT ON TABLE public.audit_events TO redeemer_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO redeemer_runtime;

-- Authentication needs to resolve the submitted public school code before it can
-- set app.current_school_id. This definer role can read only the public school ID
-- and code columns; it cannot log in and has no rights to operational tables.
GRANT USAGE ON SCHEMA public TO redeemer_auth_lookup;
GRANT SELECT (id, code) ON TABLE public.schools TO redeemer_auth_lookup;
CREATE OR REPLACE FUNCTION app.resolve_school_id_by_code(p_school_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.id
  FROM public.schools AS s
  WHERE s.code = upper(btrim(p_school_code))
  LIMIT 1
$$;
ALTER FUNCTION app.resolve_school_id_by_code(text) OWNER TO redeemer_auth_lookup;
REVOKE ALL ON FUNCTION app.resolve_school_id_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_school_id_by_code(text) TO redeemer_runtime;

COMMENT ON ROLE redeemer_runtime IS
  'Non-superuser application role. Tenant access is constrained by forced row-level security.';
COMMENT ON ROLE redeemer_auth_lookup IS
  'No-login BYPASSRLS definer role restricted to public school ID/code lookup.';
