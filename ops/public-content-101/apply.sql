\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(736420261);
DO $guard$
BEGIN
 IF current_database()<>'redeemer_school_staging' OR current_user<>'postgres' THEN
   RAISE EXCEPTION 'Not staging admin database';
 END IF;
 IF to_regclass('public.public_school_posts') IS NULL OR
    NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='100_public_school_posts.sql') THEN
   RAISE EXCEPTION 'Publishing migration 100 prerequisite missing';
 END IF;
 IF to_regclass('public.public_school_post_images') IS NOT NULL OR
    EXISTS(SELECT 1 FROM schema_migrations WHERE version='101_public_school_post_featured_images.sql') THEN
   RAISE EXCEPTION 'Migration 101 already applied or table exists';
 END IF;
END $guard$;
\ir 101_public_school_post_featured_images.sql
INSERT INTO public.schema_migrations(version) VALUES('101_public_school_post_featured_images.sql');
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.public_school_post_images'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='public_school_post_images' AND policyname='tenant_school_scope') THEN
  RAISE EXCEPTION 'Missing tenant isolation or forced RLS';
 END IF;
END $check$;
COMMIT;
