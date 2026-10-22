-- One-time account setup links. Only token hashes are stored; the raw token is
-- delivered to the invited user and is never persisted in the database.
CREATE TABLE account_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  CHECK (expires_at > created_at),
  UNIQUE (school_id, id)
);

CREATE INDEX account_invitations_user_pending_idx
  ON account_invitations (school_id, user_id, expires_at DESC)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON account_invitations
  USING (school_id = app.current_school_id())
  WITH CHECK (school_id = app.current_school_id());
GRANT SELECT, INSERT, UPDATE ON TABLE account_invitations TO redeemer_runtime;

-- A narrow no-login definer role allows the anonymous setup-link endpoint to
-- redeem a token without granting the app role a cross-school RLS bypass.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'redeemer_invite_redeemer') THEN
    EXECUTE 'CREATE ROLE redeemer_invite_redeemer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE redeemer_invite_redeemer WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, app TO redeemer_invite_redeemer;
GRANT CREATE ON SCHEMA app TO redeemer_invite_redeemer;
GRANT SELECT (school_id, user_id, token_hash, expires_at, redeemed_at, revoked_at), UPDATE (redeemed_at)
  ON TABLE account_invitations TO redeemer_invite_redeemer;
GRANT SELECT (id, school_id, role, status, deactivated_at, must_reset_password)
  ON TABLE user_accounts TO redeemer_invite_redeemer;
GRANT UPDATE (password_hash, must_reset_password, failed_login_count, locked_until, updated_at)
  ON TABLE user_accounts TO redeemer_invite_redeemer;
GRANT INSERT ON TABLE audit_events TO redeemer_invite_redeemer;

CREATE OR REPLACE FUNCTION app.consume_account_invitation(p_token_hash text, p_password_hash text)
RETURNS TABLE (school_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invitation record;
BEGIN
  SELECT i.school_id, i.user_id, u.role
    INTO invitation
    FROM public.account_invitations i
    JOIN public.user_accounts u ON u.school_id = i.school_id AND u.id = i.user_id
   WHERE i.token_hash = p_token_hash
     AND i.redeemed_at IS NULL
     AND i.revoked_at IS NULL
     AND i.expires_at > now()
     AND u.status = 'ACTIVE'
     AND u.deactivated_at IS NULL
     AND u.must_reset_password = true
   FOR UPDATE OF i, u;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.user_accounts
     SET password_hash = p_password_hash,
         must_reset_password = false,
         failed_login_count = 0,
         locked_until = NULL,
         updated_at = now()
   WHERE user_accounts.school_id = invitation.school_id
     AND user_accounts.id = invitation.user_id;

  UPDATE public.account_invitations
     SET redeemed_at = now()
   WHERE account_invitations.school_id = invitation.school_id
     AND account_invitations.user_id = invitation.user_id
     AND account_invitations.token_hash = p_token_hash
     AND account_invitations.redeemed_at IS NULL;

  INSERT INTO public.audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (invitation.school_id, invitation.user_id, 'ACCOUNT_INVITATION_REDEEMED', 'USER_ACCOUNT', invitation.user_id,
          jsonb_build_object('role', invitation.role));

  RETURN QUERY SELECT invitation.school_id, invitation.user_id;
END;
$$;

ALTER FUNCTION app.consume_account_invitation(text, text) OWNER TO redeemer_invite_redeemer;
REVOKE CREATE ON SCHEMA app FROM redeemer_invite_redeemer;
REVOKE ALL ON FUNCTION app.consume_account_invitation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_account_invitation(text, text) TO redeemer_runtime;

COMMENT ON TABLE account_invitations IS
  'Single-use, expiring initial account setup links; only SHA-256 token hashes are stored.';
