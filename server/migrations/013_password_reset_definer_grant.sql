-- Grant session cleanup to the actual SECURITY DEFINER function owner. This
-- handles databases where the function owner differs from the expected role.
DO $$
DECLARE
  definer_role name;
BEGIN
  SELECT r.rolname
    INTO definer_role
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'app'
     AND p.proname = 'consume_password_reset'
     AND p.pronargs = 2
     AND p.prosecdef;

  IF definer_role IS NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER password-reset function was not found';
  END IF;

  EXECUTE format('GRANT DELETE ON TABLE public.auth_sessions TO %I', definer_role);
END $$;
