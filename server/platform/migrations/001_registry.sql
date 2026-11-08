-- Control-plane database only. Never run through the school migration runner.
DO $$ BEGIN
  IF to_regclass('public.schools') IS NOT NULL THEN
    RAISE EXCEPTION 'Use a separate TOTAG registry database, not a school database';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='totag_registry_operator'
    AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Existing registry privilege role is unsafe; review it before migration';
  END IF;
END $$;

CREATE SCHEMA totag_platform;
REVOKE ALL ON SCHEMA totag_platform FROM PUBLIC;

CREATE TABLE totag_platform.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,49}$'),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT','STAGING','PRODUCTION')),
  name text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  configuration jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code,environment)
);

-- Requested domains reserve names in the registry, but do not route traffic or
-- certify DNS ownership. Verification and activation are separate release work.
CREATE TABLE totag_platform.requested_domains (
  hostname text PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES totag_platform.institutions(id),
  UNIQUE (institution_id, hostname)
);

CREATE UNIQUE INDEX dedicated_database_reference_unique ON totag_platform.institutions
  ((configuration->'deployment'->>'databaseReference'));
CREATE UNIQUE INDEX dedicated_deployment_reference_unique ON totag_platform.institutions
  ((configuration->'deployment'->>'reference'));

CREATE TABLE totag_platform.configuration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES totag_platform.institutions(id),
  revision integer NOT NULL,
  configuration jsonb NOT NULL,
  operator_reference text NOT NULL,
  change_reason text NOT NULL,
  database_login text NOT NULL,
  database_role text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, revision)
);

CREATE FUNCTION totag_platform.record_configuration_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,totag_platform AS $$
DECLARE
  operator_ref text := current_setting('totag.operator_reference',true);
  reason text := current_setting('totag.change_reason',true);
BEGIN
  IF operator_ref IS NULL OR btrim(operator_ref)='' OR length(operator_ref)>500
     OR reason IS NULL OR btrim(reason)='' OR length(reason)>500 THEN
    RAISE EXCEPTION 'Operator reference and change reason are required';
  END IF;
  IF NEW.configuration->'school'->>'code' IS DISTINCT FROM NEW.code
     OR NEW.configuration->'school'->>'name' IS DISTINCT FROM NEW.name
     OR NEW.configuration->'deployment'->>'environment' IS DISTINCT FROM NEW.environment
     OR NEW.configuration->'deployment'->>'model' IS DISTINCT FROM 'DEDICATED_DATABASE' THEN
    RAISE EXCEPTION 'Invalid institution identity or deployment model';
  END IF;
  IF TG_OP='INSERT' AND NEW.revision<>1 THEN
    RAISE EXCEPTION 'New institutions start at revision 1';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id OR NEW.code<>OLD.code OR NEW.environment<>OLD.environment
       OR NEW.configuration->'deployment' IS DISTINCT FROM OLD.configuration->'deployment' THEN
      RAISE EXCEPTION 'Revision or immutable deployment identity changed';
    END IF;
  END IF;
  INSERT INTO totag_platform.configuration_history
    (institution_id,revision,configuration,operator_reference,change_reason,database_login,database_role)
    VALUES(NEW.id,NEW.revision,NEW.configuration,operator_ref,reason,session_user,current_setting('role'));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION totag_platform.record_configuration_change() FROM PUBLIC;
CREATE TRIGGER institution_change_history AFTER INSERT OR UPDATE ON totag_platform.institutions
  FOR EACH ROW EXECUTE FUNCTION totag_platform.record_configuration_change();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='totag_registry_operator') THEN
    CREATE ROLE totag_registry_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA totag_platform TO totag_registry_operator;
GRANT SELECT, INSERT ON totag_platform.institutions TO totag_registry_operator;
GRANT UPDATE (name,revision,configuration,updated_at) ON totag_platform.institutions TO totag_registry_operator;
GRANT SELECT, INSERT ON totag_platform.requested_domains TO totag_registry_operator;
GRANT SELECT ON totag_platform.configuration_history TO totag_registry_operator;
REVOKE ALL ON ALL TABLES IN SCHEMA totag_platform FROM PUBLIC;

COMMENT ON SCHEMA totag_platform IS
  'TOTAG operator configuration registry. No student records, credentials, billing or live tenant routing.';
