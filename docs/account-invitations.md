# Staging account invitation setup

Account creation for teachers, school staff, students, and guardians sends a one-time password setup link through Resend. The raw link token is sent only in the email; PostgreSQL stores its SHA-256 hash. Links expire after 48 hours and can be redeemed once.

## Coolify staging environment variables

Set these on the Redeemer staging application's **Production** environment scope. Mark them **Runtime** and leave **Build time** off:

| Variable | Staging value |
| --- | --- |
| `RESEND_API_KEY` | The restricted Resend sending key for `mail.redeemer.totag.network` |
| `RESEND_FROM_EMAIL` | `Redeemer ERP Staging <staging@mail.redeemer.totag.network>` |
| `APP_PUBLIC_URL` | `https://redeemer-staging.totag.network` |
| `EMAIL_MODE` | `staging` |

In staging, an administrator can send an invitation to any valid email address without changing Coolify settings for each user. Staging invitation messages are clearly marked `[STAGING]`. Use inboxes controlled by the testing team and fictional school records; do not enter real student or guardian data. The staging app still requires the configured Resend sender, API key, and public URL.

## Database migration and deployment

Run `npm run db:migrate` against the **staging database only** using the migration/admin connection. This applies any pending migrations, including the school-role setup and `007_account_invitations.sql`, which creates the invitation-token table and narrowly scoped password-setup function. After it succeeds, remove any temporary admin `DATABASE_URL` from the running app. Keep `RUNTIME_DATABASE_URL` as the app's connection. Deploy the code after migration is successful.

To test, create a fictional account using an email inbox you can access. The recipient should receive a clearly marked staging email with a 48-hour setup link, set a password of at least 12 characters, and sign in using school code `RIA`. An email or database failure rolls back account creation; it does not display a temporary password.

Do not switch `EMAIL_MODE` to `production` or reuse the staging API key in the production app. Configure separate production sender verification, API key, URL, and delivery controls before enabling live invitations.
