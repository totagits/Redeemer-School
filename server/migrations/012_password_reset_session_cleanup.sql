-- The password-reset SECURITY DEFINER function must revoke existing sessions
-- after a successful password change. Reassert the narrowly scoped grant
-- explicitly in case the original grant was lost or applied to another schema.
GRANT DELETE ON TABLE public.auth_sessions TO redeemer_password_reset_redeemer;

-- Keep the function callable only by the application runtime role.
REVOKE ALL ON FUNCTION app.consume_password_reset(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_password_reset(text, text) TO redeemer_runtime;
