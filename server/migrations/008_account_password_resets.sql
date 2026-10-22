-- Password reset links are single-use, short-lived, and stored only as hashes.
CREATE TABLE account_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at),
  UNIQUE (school_id, id)
);

CREATE INDEX account_password_resets_user_pending_idx
  ON account_password_resets (school_id, user_id, expires_at DESC)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE account_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_password_resets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON account_password_resets
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());
GRANT SELECT, INSERT, UPDATE ON TABLE account_password_resets TO redeemer_runtime;

-- Anonymous reset-token redemption uses a narrowly privileged, no-login role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'redeemer_password_reset_redeemer') THEN
    EXECUTE 'CREATE ROLE redeemer_password_reset_redeemer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE redeemer_password_reset_redeemer WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, app TO redeemer_password_reset_redeemer;
GRANT CREATE ON SCHEMA app TO redeemer_password_reset_redeemer;
GRANT SELECT (school_id, user_id, token_hash, expires_at, redeemed_at, revoked_at),
      UPDATE (redeemed_at)
  ON TABLE account_password_resets TO redeemer_password_reset_redeemer;
GRANT SELECT (id, school_id, status, deactivated_at)
  ON TABLE user_accounts TO redeemer_password_reset_redeemer;
GRANT UPDATE (password_hash, must_reset_password, failed_login_count, locked_until, updated_at)
  ON TABLE user_accounts TO redeemer_password_reset_redeemer;
GRANT DELETE ON TABLE auth_sessions TO redeemer_password_reset_redeemer;
GRANT INSERT ON TABLE audit_events TO redeemer_password_reset_redeemer;

CREATE OR REPLACE FUNCTION app.consume_password_reset(p_token_hash text, p_password_hash text)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reset_request record;
BEGIN
  SELECT r.school_id, r.user_id
    INTO reset_request
    FROM public.account_password_resets r
    JOIN public.user_accounts u ON u.school_id = r.school_id AND u.id = r.user_id
   WHERE r.token_hash = p_token_hash
     AND r.redeemed_at IS NULL
     AND r.revoked_at IS NULL
     AND r.expires_at > now()
     AND u.status = 'ACTIVE'
     AND u.deactivated_at IS NULL
   FOR UPDATE OF r, u;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.user_accounts
     SET password_hash = p_password_hash,
         must_reset_password = false,
         failed_login_count = 0,
         locked_until = NULL,
         updated_at = now()
   WHERE user_accounts.school_id = reset_request.school_id
     AND user_accounts.id = reset_request.user_id;

  UPDATE public.account_password_resets
     SET redeemed_at = now()
   WHERE account_password_resets.school_id = reset_request.school_id
     AND account_password_resets.user_id = reset_request.user_id
     AND account_password_resets.token_hash = p_token_hash
     AND account_password_resets.redeemed_at IS NULL;

  DELETE FROM public.auth_sessions
   WHERE auth_sessions.school_id = reset_request.school_id
     AND auth_sessions.user_id = reset_request.user_id;

  INSERT INTO public.audit_events (school_id, actor_user_id, action, entity_type, details)
  VALUES (reset_request.school_id, reset_request.user_id, 'PASSWORD_RESET_COMPLETED',
          'USER_ACCOUNT', jsonb_build_object('method', 'email_link'));

  RETURN QUERY SELECT reset_request.user_id;
END;
$$;

ALTER FUNCTION app.consume_password_reset(text, text) OWNER TO redeemer_password_reset_redeemer;
REVOKE CREATE ON SCHEMA app FROM redeemer_password_reset_redeemer;
REVOKE ALL ON FUNCTION app.consume_password_reset(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_password_reset(text, text) TO redeemer_runtime;

COMMENT ON TABLE account_password_resets IS
  'Single-use, 60-minute password reset links; only SHA-256 token hashes are stored.';
