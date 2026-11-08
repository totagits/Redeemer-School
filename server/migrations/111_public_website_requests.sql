-- Private administrative follow-up for public enquiries, visit preferences and records requests.
CREATE TABLE website_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id),
 reference text NOT NULL,
 client_request_id uuid NOT NULL,
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 category text NOT NULL CHECK(category IN ('ENQUIRY','VISIT','RECORDS')),
 contact_name text NOT NULL CHECK(char_length(contact_name) BETWEEN 2 AND 120),
 email text NOT NULL DEFAULT '' CHECK(char_length(email)<=254),
 phone text NOT NULL DEFAULT '' CHECK(char_length(phone)<=40),
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 3 AND 160),
 message text NOT NULL CHECK(char_length(message) BETWEEN 10 AND 2000),
 preferred_date date,
 consented_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','IN_PROGRESS','WAITING_FOR_VISITOR','RESOLVED','CLOSED')),
 assigned_to uuid,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,reference), UNIQUE(school_id,client_request_id),
 FOREIGN KEY(school_id,assigned_to) REFERENCES user_accounts(school_id,id),
 CHECK(email<>'' OR phone<>''), CHECK(category='VISIT' OR preferred_date IS NULL)
);
CREATE TABLE website_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_user_id uuid,
 event_type text NOT NULL CHECK(event_type IN ('RECEIVED','STATUS_CHANGED','ASSIGNED')),
 from_status text,
 to_status text NOT NULL,
 note text NOT NULL DEFAULT '' CHECK(char_length(note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,request_id) REFERENCES website_requests(school_id,id),
 FOREIGN KEY(school_id,actor_user_id) REFERENCES user_accounts(school_id,id)
);
CREATE INDEX website_requests_queue ON website_requests(school_id,status,created_at DESC,id DESC);
GRANT SELECT,INSERT,UPDATE ON website_requests TO redeemer_runtime;
GRANT SELECT,INSERT ON website_request_events TO redeemer_runtime;
ALTER TABLE website_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE website_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_request_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON website_requests USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON website_request_events USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE FUNCTION app.guard_website_request_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.school_id,NEW.reference,NEW.client_request_id,NEW.payload_hash,NEW.category,NEW.contact_name,NEW.email,NEW.phone,NEW.subject,NEW.message,NEW.preferred_date,NEW.consented_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.school_id,OLD.reference,OLD.client_request_id,OLD.payload_hash,OLD.category,OLD.contact_name,OLD.email,OLD.phone,OLD.subject,OLD.message,OLD.preferred_date,OLD.consented_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Original website request is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER website_request_original_immutable BEFORE UPDATE ON website_requests FOR EACH ROW EXECUTE FUNCTION app.guard_website_request_original();
