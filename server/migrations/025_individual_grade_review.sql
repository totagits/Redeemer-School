-- Track review state per learner mark so one correction does not reopen a whole class batch.
ALTER TABLE assessment_scores
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

UPDATE assessment_scores sc
SET review_status = CASE a.status
  WHEN 'SUBMITTED_FOR_REVIEW' THEN 'PENDING_REVIEW'
  WHEN 'APPROVED' THEN 'APPROVED'
  WHEN 'PUBLISHED' THEN 'PUBLISHED'
  ELSE 'OPEN'
END
FROM assessments a
WHERE a.school_id = sc.school_id AND a.id = sc.assessment_id;

-- Preserve legacy whole-batch returns as returned marks so teachers can still correct them.
UPDATE assessment_scores sc
SET review_status = 'RETURNED',
    return_reason = returned.details->>'reason',
    returned_at = returned.occurred_at
FROM assessments a
JOIN LATERAL (
  SELECT ae.details, ae.occurred_at
  FROM audit_events ae
  WHERE ae.school_id = a.school_id
    AND ae.entity_type = 'ASSESSMENT'
    AND ae.entity_id = a.id
    AND ae.action = 'ASSESSMENT_RETURNED_FOR_REVISION'
  ORDER BY ae.occurred_at DESC, ae.id DESC
  LIMIT 1
) returned ON true
WHERE a.school_id = sc.school_id
  AND a.id = sc.assessment_id
  AND a.status = 'OPEN';

ALTER TABLE assessment_scores
  ADD CONSTRAINT assessment_scores_review_status_check
  CHECK (review_status IN ('OPEN', 'PENDING_REVIEW', 'RETURNED', 'APPROVED', 'PUBLISHED'));

CREATE INDEX assessment_scores_review_queue_idx
  ON assessment_scores (school_id, assessment_id, review_status);
