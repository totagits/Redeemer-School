CREATE TABLE totag_platform.school_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_request_id uuid NOT NULL UNIQUE,
 reference text NOT NULL UNIQUE,
 payload_hash text NOT NULL,
 request_data jsonb NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','UNDER_REVIEW','WAITING_FOR_INFORMATION','DECLINED','CONFIGURATION_PREPARED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 institution_id uuid REFERENCES totag_platform.institutions(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='CONFIGURATION_PREPARED')=(institution_id IS NOT NULL))
);
CREATE TABLE totag_platform.school_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES totag_platform.school_requests(id),
 operator_id uuid REFERENCES totag_platform.operators(id),
 status text NOT NULL,
 reason text NOT NULL,
 revision integer NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON totag_platform.school_requests,totag_platform.school_request_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON totag_platform.school_requests TO totag_registry_operator;
GRANT SELECT,INSERT ON totag_platform.school_request_events TO totag_registry_operator;
