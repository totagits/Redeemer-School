# Redeemer staging — public website publishing rollout

This feature is **not** enabled merely by merging application code. It adds
`server/migrations/100_public_school_posts.sql`, which creates separate,
tenant-isolated public website posts. It never reuses or publicly exposes
private Guardian/Student/Class announcements.

## Deployment gate: required checks

1. Confirm the target is **Redeemer staging** (`redeemer-staging.totag.network`),
   not production (`redeemer.totag.network`).
2. Take a verified **staging PostgreSQL backup**. Record timestamp, database
   identity, and restoration method; inspect that the backup file actually exists.
3. Check that `DATABASE_URL` is the administrative migration connection and
   `RUNTIME_DATABASE_URL` is the restricted role for the *same staging database*.
   Never copy either URL into chat, screenshots, or source control.
4. Inspect `schema_migrations` to confirm migration history and whether
   `100_public_school_posts.sql` has been applied. Review pending migrations
   to avoid unexpectedly applying other schema changes.
5. Apply the reviewed migration with administrative credentials during the
   authorized staging maintenance window (standard `npm run db:migrate`
   applies **all pending migrations**, not just this one). Do not run it
   blindly against an uninspected DB.
6. Verify table, grants and forced RLS as the restricted runtime role, including
   attempted cross-school access returning zero records.
7. Deploy the branch containing the application endpoints and editor only after
   the migration is confirmed; verify Coolify status and its resulting commit.
8. As a staging School Admin: create a harmless test **DRAFT** school news
   entry. Confirm it does **not** appear on the public homepage.
9. Explicitly select Publish. Check homepage, News & Events and School Calendar
   only show approved public posts. Create/publish an EVENT with a valid date
   and confirm it displays using Liberia local time.
10. Unpublish. Check a refreshed public browser no longer displays the entry.
    Check signed-out and guardian accounts cannot manage public posts.
11. Independently verify that private CLASS, GUARDIAN, STAFF, grades, finance and
    messaging data **never** appears on the public feed.
12. Keep production release blocked until the school approves and the same
    checks are completed against an authorized production migration plan.

## Key release safeguards

- The public API returns only `status = 'PUBLISHED'` records from
  `public_school_posts`, **never** from private `announcements`.
- Editorial entry is accessible only to authorized school administrators and
  principals with `communications.write`.
- New content begins as DRAFT, with Publish an explicit additional action.
- No student photos, names, grades, tuition, student IDs or private guardian
  messages should be included in public editorial content.
- If a database migration is missing, the public component shows that updates
  are temporarily unavailable. Do not replace the message with invented content.
- Public-content UI suppresses HTTP caching so an unpublish becomes visible on
  refresh. Edge/proxy cache configuration also must be verified.

**As of authoring: no database migration, staging deployment, or public browser
verification has been performed by this change set.**
