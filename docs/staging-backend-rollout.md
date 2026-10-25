# Staging backend rollout

This rollout adds a real sign-in/session API and the least-privilege PostgreSQL
runtime role. It does not yet connect the existing React screens to database
CRUD APIs. Do not enter real student, payroll, or payment data until those
workflows and their authorization checks are implemented.

## Before changing staging

1. Confirm Coolify's staging app is using branch `fix/vite-esbuild-peer-conflict`
   and has deployed the commit containing migration
   `003_runtime_security.sql`.
2. In Coolify, open the **staging PostgreSQL resource** and create/download a
   fresh backup now. The backup must be from after migrations 001 and 002, and
   before migration 003. Keep the file outside the VPS as well.
3. Confirm the staging app's `DATABASE_URL` points to this staging database.
   Never paste a production database URL here.

## Apply migration 003

From the staging app's terminal/console, in the checked-out app directory, run:

```sh
npm run db:migrate
```

The output should say `Applied: 003_runtime_security.sql`. If it says
`Already applied`, that is also okay. If it reports an error, stop and retain
the full error text; do not repeatedly retry an unknown partial failure.

The migration creates `redeemer_runtime` as a non-superuser role with
`NOBYPASSRLS`, grants it tenant-scoped table permissions, and creates the
limited school-code lookup function. It deliberately does not put a database
password in source control.

## Set up runtime credentials

1. Set a strong, unique password for `redeemer_runtime` using a PostgreSQL
   administrator connection. Prefer `psql`'s interactive `\password
   redeemer_runtime` command so the password is not written into shell history.
   If Coolify's database console is SQL-only, use its secure secret entry and
   do not share screenshots containing the password.
2. In **Coolify → staging application → Environment Variables**, add:
   - `RUNTIME_DATABASE_URL`: same staging database host/name as
     `DATABASE_URL`, but username `redeemer_runtime` and the password from
     step 1. Keep the URL private.
   - `APP_SESSION_SECRET`: a unique random secret of at least 32 bytes. For
     example, generate one locally with `openssl rand -base64 48`; enter it
     directly into Coolify and never commit it.
   - `AUTH_SESSION_TTL_MS`: `28800000` (8 hours), unless the school has chosen
     another session policy.
3. Save the variables and redeploy/restart the **staging application** so the
   server receives them. Do not put the runtime password in a public Vite
   variable such as `VITE_*`.
4. Check `https://redeemer-staging.totag.network/api/health/ready`. It should
   report `"authentication":"configured"`. This checks configuration, not
   full login/database permissions.

## Create the first school administrator

After migration 003 is applied, run this from the staging app terminal:

```sh
npm run db:bootstrap-admin
```

Use school code `RIA` for Redeemer International Academy (or another code if
the school has chosen one). Enter the administrator's email and name. Choose a
unique password of at least 12 characters; password input is hidden. Do not
paste passwords into chat or screenshots. This command creates the school,
its `SCHOOL_ADMIN` role and permissions, the first account, and an audit
entry. It refuses to add another first account if one already exists.

## Verify and stop conditions

- `GET /api/health/ready` reports `authentication: configured`.
- `POST /api/auth/login` accepts a JSON body with `schoolCode`, `email`, and
  `password`, and returns a secure, HttpOnly session cookie and account roles.
- `GET /api/auth/session` with that cookie returns the same account.
- `POST /api/auth/logout` requires the returned `csrfToken` in the
  `X-CSRF-Token` header and clears the session.
- A runtime DB URL using a superuser or `BYPASSRLS` role is rejected by the
  auth API.

If health does not report configured, login returns 503, or any migration
fails, stop and inspect Coolify deployment/runtime logs. Do not switch the
staging URL to production credentials. Keep the fresh pre-migration backup
until these checks pass.

## Encrypted applicant documents (migration 016)

After the admission-document code has been deployed to staging, take a fresh
staging backup and run `npm run db:migrate` using the staging database owner
connection, following the same Hostinger VPS console procedure used for the
earlier migrations. Verify the output names
`016_encrypted_admission_documents.sql` as applied. Keep
`STUDENT_DOCUMENT_ENCRYPTION_KEY` configured and stable in Coolify; do not
change it after uploading files, because that would make stored files
undecryptable. Applicant PDF upload, download, and removal stay unavailable
until both the migration and key are ready. Use fictional files in staging.
