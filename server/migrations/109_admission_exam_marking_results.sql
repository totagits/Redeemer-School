-- Draft staging only. Marks require separate approval before private release.
ALTER TABLE admission_exam_attempts ADD CONSTRAINT admission_exam_attempt_application_identity UNIQUE(school_id,exam_id,application_id,id);
CREATE TABLE admission_exam_marking (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 marks jsonb NOT NULL CHECK(jsonb_typeof(marks)='array'),
 total_points numeric(10,2) NOT NULL CHECK(total_points>=0),
 maximum_points numeric(10,2) NOT NULL CHECK(maximum_points>0 AND total_points<=maximum_points),
 percentage numeric(5,2) GENERATED ALWAYS AS (round(total_points/maximum_points*100,2)) STORED,
 feedback text NOT NULL DEFAULT '' CHECK(char_length(feedback)<=2000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 marked_by uuid NOT NULL,
 marked_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid,
 approved_at timestamptz,
 released_by uuid,
 released_at timestamptz,
 UNIQUE(school_id,attempt_id),
 UNIQUE(school_id,exam_id,application_id,id),
 FOREIGN KEY(school_id,exam_id,application_id,attempt_id) REFERENCES admission_exam_attempts(school_id,exam_id,application_id,id),
 FOREIGN KEY(school_id,exam_id,application_id) REFERENCES admission_exam_assignments(school_id,exam_id,application_id),
 FOREIGN KEY(school_id,marked_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,approved_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,released_by) REFERENCES user_accounts(school_id,id),
 CHECK((approved_at IS NULL AND approved_by IS NULL) OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at>=marked_at AND approved_by<>marked_by)),
 CHECK((released_at IS NULL AND released_by IS NULL) OR (released_at IS NOT NULL AND approved_at IS NOT NULL AND released_at>=approved_at AND released_by IS NOT NULL))
);
CREATE TABLE admission_exam_result_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 marking_id uuid NOT NULL,
 guardian_verification_id uuid NOT NULL,
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 revoked_at timestamptz,
 UNIQUE(school_id,token_hash),
 FOREIGN KEY(school_id,exam_id,application_id,marking_id) REFERENCES admission_exam_marking(school_id,exam_id,application_id,id),
 FOREIGN KEY(school_id,application_id,guardian_verification_id) REFERENCES admission_guardian_email_verifications(school_id,application_id,id)
);
GRANT SELECT,INSERT,UPDATE ON admission_exam_marking,admission_exam_result_access TO redeemer_runtime;
ALTER TABLE admission_exam_marking ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_marking FORCE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_result_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_result_access FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_marking USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON admission_exam_result_access USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());

CREATE FUNCTION app.guard_approved_exam_marking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.approved_at IS NOT NULL AND
   ROW(NEW.marks,NEW.total_points,NEW.maximum_points,NEW.feedback,NEW.revision,NEW.marked_by,NEW.marked_at,NEW.approved_by,NEW.approved_at)
   IS DISTINCT FROM
   ROW(OLD.marks,OLD.total_points,OLD.maximum_points,OLD.feedback,OLD.revision,OLD.marked_by,OLD.marked_at,OLD.approved_by,OLD.approved_at)
 THEN RAISE EXCEPTION 'Approved examination marks are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.released_at IS NOT NULL AND ROW(NEW.released_at,NEW.released_by) IS DISTINCT FROM ROW(OLD.released_at,OLD.released_by)
 THEN RAISE EXCEPTION 'Original result release is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER approved_exam_marking_immutable BEFORE UPDATE ON admission_exam_marking
 FOR EACH ROW EXECUTE FUNCTION app.guard_approved_exam_marking();
