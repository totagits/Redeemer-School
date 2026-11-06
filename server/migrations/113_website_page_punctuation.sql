-- Correct imported punctuation without erasing original page history.
CREATE FUNCTION pg_temp.website_punctuation(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
 SELECT replace(replace(value::text, U&'\00e2\20ac\2122', U&'\2019'), U&'\00e2\20ac\201d', U&'\2014')::jsonb
$fn$;
WITH corrected AS (
 UPDATE website_pages SET
 draft_content=pg_temp.website_punctuation(draft_content),
 published_content=pg_temp.website_punctuation(published_content),
 revision=revision+1,
 published_revision=CASE WHEN published_content IS NOT NULL THEN revision+1 ELSE NULL END,
 updated_at=clock_timestamp()
 WHERE draft_content IS DISTINCT FROM pg_temp.website_punctuation(draft_content)
 OR published_content IS DISTINCT FROM pg_temp.website_punctuation(published_content)
 RETURNING *
)
INSERT INTO website_page_history(school_id,slug,action,revision,snapshot,note)
 SELECT school_id,slug,'SAVE_DRAFT',revision,draft_content,'Correct imported punctuation; previous versions retained.' FROM corrected
 UNION ALL
 SELECT school_id,slug,'PUBLISH',revision,published_content,'Correct punctuation in the existing approved public snapshot; wording and approval unchanged.' FROM corrected WHERE published_content IS NOT NULL;
