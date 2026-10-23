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
| `EMAIL_ALLOWED_RECIPIENTS` | Test inbox address(es) you control, entered once |

Staging accepts only the approved inboxes and plus-addressed aliases of those inboxes. Add a test inbox you control to `EMAIL_ALLOWED_RECIPIENTS` once; do not change Coolify for each account. For multiple role tests, use unique aliases such as `yourname+teacher@gmail.com`, `yourname+student@gmail.com`, and `yourname+guardian@gmail.com` when your email provider supports plus-addressing. Resend sends each invite to its alias, and those messages arrive in the same controlled inbox. Each alias is the account's staging login email. Never allowlist real student, guardian, or staff addresses in staging.

## Database migration and deployment

Run `npm run db:migrate` against the **staging database only** using the migration/admin connection. This applies any pending migrations, including the school-role setup and `007_account_invitations.sql`, which creates the invitation-token table and narrowly scoped password-setup function. After it succeeds, remove any temporary admin `DATABASE_URL` from the running app. Keep `RUNTIME_DATABASE_URL` as the app's connection. Deploy the code after migration is successful.

To test, create a fictional account using an allowlisted test email. The recipient should receive a 48-hour setup link, set a password of at least 12 characters, and sign in using school code `RIA`. An email or database failure rolls back account creation; it does not display a temporary password.

Do not switch `EMAIL_MODE` to `production` or reuse the staging API key in the production app. Configure separate production sender verification, API key, URL, and delivery controls before enabling live invitations.
