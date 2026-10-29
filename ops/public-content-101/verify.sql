\set ON_ERROR_STOP on
\pset pager off
SELECT current_database() AS database_name,to_regclass('public.public_school_post_images') AS featured_image_table;
SELECT version,applied_at FROM schema_migrations WHERE version='101_public_school_post_featured_images.sql';
SELECT relrowsecurity AS rls_enabled,relforcerowsecurity AS rls_forced FROM pg_class WHERE oid=to_regclass('public.public_school_post_images');
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='public_school_post_images';
SELECT has_table_privilege('redeemer_runtime','public.public_school_post_images','SELECT') AS runtime_select,
 has_table_privilege('redeemer_runtime','public.public_school_post_images','INSERT') AS runtime_insert,
 has_table_privilege('redeemer_runtime','public.public_school_post_images','UPDATE') AS runtime_update,
 has_table_privilege('redeemer_runtime','public.public_school_post_images','DELETE') AS runtime_delete;
SELECT count(*) AS saved_featured_images FROM public.public_school_post_images;
