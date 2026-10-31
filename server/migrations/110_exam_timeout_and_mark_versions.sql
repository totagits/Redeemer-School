-- Additive staging rollout: timeout receipts and preserved correction versions.
ALTER TABLE admission_exam_attempts ADD COLUMN submission_reason text;
UPDATE admission_exam_attempts SET submission_reason='MANUAL' WHERE status='SUBMITTED';
ALTER TABLE admission_exam_attempts ADD CHECK ((
 (status='SUBMITTED' AND submission_reason IN ('MANUAL','TIMEOUT')) OR
 (status<>'SUBMITTED' AND submission_reason IS NULL)) IS TRUE);

ALTER TABLE admission_exam_marking
 ADD COLUMN superseded_at timestamptz,
 ADD COLUMN correction_of uuid,
 ADD COLUMN correction_reason text,
 ADD COLUMN correction_requested_by uuid,
 ADD COLUMN correction_requested_at timestamptz,
 ADD CONSTRAINT marking_version_identity UNIQUE(school_id,exam_id,application_id,attempt_id,id),
 ADD FOREIGN KEY(school_id,exam_id,application_id,attempt_id,correction_of)
 REFERENCES admission_exam_marking(school_id,exam_id,application_id,attempt_id,id),
 ADD FOREIGN KEY(school_id,correction_requested_by) REFERENCES user_accounts(school_id,id),
 ADD CHECK(correction_of IS NULL OR correction_of<>id),
 ADD CHECK(((correction_of IS NULL AND correction_reason IS NULL AND correction_requested_by IS NULL AND correction_requested_at IS NULL)
 OR (correction_of IS NOT NULL AND char_length(btrim(correction_reason)) BETWEEN 10 AND 1000
 AND correction_requested_by IS NOT NULL AND correction_requested_at IS NOT NULL)) IS TRUE),
 ADD CHECK(superseded_at IS NULL OR (approved_at IS NOT NULL AND superseded_at>=approved_at));
ALTER TABLE admission_exam_marking DROP CONSTRAINT admission_exam_marking_school_id_attempt_id_key;
CREATE UNIQUE INDEX admission_exam_marking_current ON admission_exam_marking(school_id,attempt_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX admission_exam_marking_correction_once ON admission_exam_marking(school_id,correction_of) WHERE correction_of IS NOT NULL;

CREATE OR REPLACE FUNCTION app.guard_approved_exam_marking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.school_id,NEW.exam_id,NEW.application_id,NEW.attempt_id,NEW.correction_of,NEW.correction_reason,NEW.correction_requested_by,NEW.correction_requested_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.school_id,OLD.exam_id,OLD.application_id,OLD.attempt_id,OLD.correction_of,OLD.correction_reason,OLD.correction_requested_by,OLD.correction_requested_at)
 THEN RAISE EXCEPTION 'Marking identity and correction history are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.approved_at IS NOT NULL AND
 ROW(NEW.marks,NEW.total_points,NEW.maximum_points,NEW.feedback,NEW.revision,NEW.marked_by,NEW.marked_at,NEW.approved_by,NEW.approved_at)
 IS DISTINCT FROM ROW(OLD.marks,OLD.total_points,OLD.maximum_points,OLD.feedback,OLD.revision,OLD.marked_by,OLD.marked_at,OLD.approved_by,OLD.approved_at)
 THEN RAISE EXCEPTION 'Approved examination marks are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.released_at IS NOT NULL AND ROW(NEW.released_at,NEW.released_by) IS DISTINCT FROM ROW(OLD.released_at,OLD.released_by)
 THEN RAISE EXCEPTION 'Original result release is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.superseded_at IS NOT NULL AND NEW IS DISTINCT FROM OLD
 THEN RAISE EXCEPTION 'Superseded examination marks are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
