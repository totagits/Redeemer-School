-- Migration 101: single high-quality featured photo per public website post.
-- SQL applied separately to staging after backup; never run on startup.
CREATE TABLE public_school_post_images (
 school_id uuid NOT NULL,
 post_id uuid NOT NULL,
 image_bytes bytea NOT NULL CHECK(octet_length(image_bytes) BETWEEN 100 AND 1572864),
 mime_type text NOT NULL CHECK(mime_type='image/webp'),
 pixel_width int NOT NULL CHECK(pixel_width BETWEEN 1200 AND 4096),
 pixel_height int NOT NULL CHECK(pixel_height BETWEEN 675 AND 4096),
 caption text NOT NULL DEFAULT '' CHECK(char_length(caption)<=240),
 alt_text text NOT NULL CHECK(char_length(alt_text) BETWEEN 5 AND 240),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id, post_id),
 FOREIGN KEY(school_id, post_id) REFERENCES public_school_posts(school_id, id) ON DELETE CASCADE
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public_school_post_images TO redeemer_runtime;
ALTER TABLE public_school_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_school_post_images FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON public_school_post_images
 USING(school_id=app.current_school_id())
 WITH CHECK(school_id=app.current_school_id());
