-- Keep password changes inside the narrowly privileged definer function,
-- then revoke this user's existing sessions using the tenant-scoped runtime role.
DROP FUNCTION app.consume_password_reset(text, text);

CREATE FUNCTION app.consume_password_reset(p_token_hash text, p_password_hash text)
RETURNS TABLE (school_id uuid, user_id uuid)
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

  INSERT INTO public.audit_events (school_id, actor_user_id, action, entity_type, details)
  VALUES (reset_request.school_id, reset_request.user_id, 'PASSWORD_RESET_COMPLETED',
          'USER_ACCOUNT', jsonb_build_object('method', 'email_link'));

  RETURN QUERY SELECT reset_request.school_id, reset_request.user_id;
END;
$$;

ALTER FUNCTION app.consume_password_reset(text, text) OWNER TO redeemer_password_reset_redeemer;
REVOKE ALL ON FUNCTION app.consume_password_reset(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_password_reset(text, text) TO redeemer_runtime;

-- Session cleanup is performed by redeemer_runtime after it sets the returned
-- school context, so forced tenant RLS constrains the deletion to that school.
GRANT DELETE ON TABLE public.auth_sessions TO redeemer_runtime;
