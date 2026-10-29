\set ON_ERROR_STOP on
\echo 'Staging-only migration 100: beginning guarded atomic transaction'
BEGIN;
SELECT pg_advisory_xact_lock(736420261);
DO $check$
BEGIN
  IF current_database() <> 'redeemer_school_staging' THEN
    RAISE EXCEPTION 'REFUSED: wrong database: %', current_database();
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'REFUSED: expected postgres migration role, got %', current_user;
  END IF;
  IF to_regclass('public.schema_migrations') IS NULL
     OR to_regclass('public.schools') IS NULL
     OR to_regclass('public.user_accounts') IS NULL
     OR to_regprocedure('app.current_school_id()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='redeemer_runtime') THEN
    RAISE EXCEPTION 'REFUSED: staging migration prerequisites missing';
  END IF;
  IF to_regclass('public.public_school_posts') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSED: public_school_posts already exists; investigate manually';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='100_public_school_posts.sql') THEN
    RAISE EXCEPTION 'REFUSED: migration 100 is already recorded';
  END IF;
END
$check$;
\ir 100_public_school_posts.sql
INSERT INTO public.schema_migrations(version) VALUES('100_public_school_posts.sql');
DO $check$
BEGIN
  IF to_regclass('public.public_school_posts') IS NULL THEN
    RAISE EXCEPTION 'Migration did not create publishing table';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.public_school_posts'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'Missing forced row-level security';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='public_school_posts' AND policyname='tenant_school_scope') THEN
    RAISE EXCEPTION 'Missing tenant isolation policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='100_public_school_posts.sql') THEN
    RAISE EXCEPTION 'Migration history not recorded';
  END IF;
END
$check$;
COMMIT;
\echo 'Migration 100 committed; run verify.sql separately.'
