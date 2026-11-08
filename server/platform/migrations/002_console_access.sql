-- Console identities are pre-provisioned by the registry database owner.
-- The runtime role cannot create operators, expand their scope or register users.
CREATE TABLE totag_platform.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  display_name text NOT NULL,
  access_level text NOT NULL CHECK(access_level IN ('GLOBAL_CONFIGURATOR','SCOPED')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(issuer,subject)
);
CREATE TABLE totag_platform.operator_scopes (
  operator_id uuid NOT NULL REFERENCES totag_platform.operators(id),
  institution_id uuid NOT NULL REFERENCES totag_platform.institutions(id),
  access_level text NOT NULL CHECK(access_level IN ('READ','CONFIGURE')),
  PRIMARY KEY(operator_id,institution_id)
);
CREATE TABLE totag_platform.console_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  operator_id uuid NOT NULL REFERENCES totag_platform.operators(id),
  csrf_token text NOT NULL,
  mfa_verified boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>created_at)
);
CREATE TABLE totag_platform.login_challenges (
  state_hash text PRIMARY KEY,
  cookie_hash text NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE totag_platform.institution_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES totag_platform.institutions(id),
  asset_path text NOT NULL,
  media_type text NOT NULL CHECK(media_type IN ('image/png','image/webp','image/jpeg')),
  file_bytes bytea NOT NULL CHECK(octet_length(file_bytes) BETWEEN 24 AND 2097152),
  checksum text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES totag_platform.operators(id),
  publication_authorized boolean NOT NULL CHECK(publication_authorized),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,asset_path)
);
CREATE TABLE totag_platform.console_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES totag_platform.operators(id),
  action text NOT NULL,
  institution_id uuid REFERENCES totag_platform.institutions(id),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON totag_platform.operators,totag_platform.operator_scopes TO totag_registry_operator;
GRANT SELECT,INSERT,DELETE ON totag_platform.console_sessions,totag_platform.login_challenges TO totag_registry_operator;
GRANT SELECT,INSERT ON totag_platform.institution_logos,totag_platform.console_events TO totag_registry_operator;
REVOKE ALL ON ALL TABLES IN SCHEMA totag_platform FROM PUBLIC;
