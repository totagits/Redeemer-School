\set ON_ERROR_STOP on
\pset pager off
SELECT current_database() AS database_name,
       to_regclass('public.public_school_posts') AS publishing_table;
SELECT version, applied_at FROM public.schema_migrations WHERE version='100_public_school_posts.sql';
SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE oid=to_regclass('public.public_school_posts');
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='public_school_posts';
SELECT has_table_privilege('redeemer_runtime','public.public_school_posts','SELECT') AS runtime_select,
       has_table_privilege('redeemer_runtime','public.public_school_posts','INSERT') AS runtime_insert,
       has_table_privilege('redeemer_runtime','public.public_school_posts','UPDATE') AS runtime_update;
SELECT count(*) AS total_public_posts FROM public.public_school_posts;
