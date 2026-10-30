# Candidate examination preview: sitting, marking and private results

This draft combines the candidate foundations with the deployed staging receipts and
eligibility preview. No staging or production changes have been deployed.

## Implemented

- Migrations 104-109: private question/attempt storage, hashed single-use credentials,
  expiring sessions and guardian email verification records with forced tenant RLS.
- Eligibility rejects malformed fees, unverified waivers and unknown application states.
- Current settlement, application, assignment and GMT time window are checked on login
  and session validation. Paper and interview examinations cannot create online sessions.
- Registrar requests email verification only for a guardian already stored on the
  application; 30-minute hashed verification tokens, three requests per 15 minutes.
- Guardian proves mailbox control on /examination/verify-email. Proof is usable for 30
  days, school/application scoped, revocable, and only valid while the address matches.
- Registrar sends a one-time examination code only to that verified address. No raw
  access code is returned to the staff browser. Resend requests use idempotency keys.
- Candidate /examination uses a separate Secure/HttpOnly/SameSite=Strict cookie,
  same-origin JSON POST checks, CSRF on logout, per-process attempt limits and revocation.
- New routes and staff email controls stay disabled unless
  ENABLE_CANDIDATE_EXAM_PREVIEW=true. Do not enable before staging release review.
- Principal/School Administrator approves and freezes an immutable question snapshot
  while the online examination is a draft. Online scheduling requires this approval.
- Candidates can start or resume one scoped attempt, save multiple-choice and short
  answers, and explicitly submit. Candidate responses whitelist question fields and
  never include answer keys. Answer keys stay in the private approval snapshot.
- Attempts/answers are locked during writes; saves and submissions recheck the server
  clock and eligibility. Same-reference submission retries return the original result;
  other submissions and edits after submission are rejected. New writes after the
  deadline are rejected, rather than silently accepted or auto-graded.

- Staff manually mark each submitted answer against its approved question snapshot;
  totals and percentages are calculated from validated per-question marks. Revision
  checks reject stale edits. Candidates never receive answer keys.
- A different Principal/School Administrator must approve the marks. Approved marks
  and the original release record are immutable in PostgreSQL as well as the API.
- Leaders explicitly release approved results to the current verified guardian email.
  The email contains a separate hashed-access-code credential valid for seven days,
  not marks. Replacement codes revoke previous codes. Guardian proof must remain valid.
- /examination/results shows only released totals, percentage and school feedback.
  Codes stay out of URLs and browser storage; closing the result clears it from view.

## Validation

All 323 local automated tests pass (one Linux CI-only PostgreSQL check is skipped).
GitHub run [41121871538](https://github.com/totagits/Redeemer-School/actions/runs/41121871538)
passed all 324 tests with no skips, TypeScript and the frontend build at code commit
`6098f9231baa5bfd6d581c007a8016bb14b450b9`.
The full existing migration chain executes in disposable embedded PostgreSQL (PGlite),
including 104-109. Tests exercise real RLS, composite foreign keys, duplicate attempts,
invalid question JSON, single-use redemption, rollback, expiry, guardian email changes,
HTTP cookies, origin checks, CSRF, rate limits and sign-out. Email delivery tests use a
mock transport; no real email or personal data is sent. TypeScript and Vite build pass.
The candidate and verification pages were checked locally with the feature disabled.
A separate fictional UI preview exercised starting, both answer types, save/reload,
saving the final edit at submission and the locked confirmation screen. That preview
uses mocked responses; the separate HTTP/database tests exercise the real handlers.
A fictional local result preview also verified the approved mark/feedback display and
that closing it clears the private result. Database-backed HTTP tests cover invalid and
stale marks, separate approval, forbidden self-approval, SQL immutability, unverified
email refusal, release, replacement, expiry and revoked guardian proof.
Real provider delivery and enabled staging end-to-end proof remain pending.

Run `npm run test:exam-postgres` with Docker running to execute contention checks
against a disposable official PostgreSQL 18 container. The existing Linux CI test step
also runs this check. The runner never reads DATABASE_URL, binds only to 127.0.0.1,
uses a random temporary password and removes its own container afterward. It applies
the full migration chain to a fresh database and verifies actual lock waits between
independent connections: one-use redemption, expiry during a lock wait, guardian
request throttling, submission versus answer saves, submission retry idempotency and
approval versus mark edits. No live database credentials, applicant records or email
provider are used. Local Docker startup failed on this workstation; all six server
contention scenarios subsequently passed in the GitHub run linked above.

## Staging preparation record

On 2026-10-30, Coolify confirmed the existing staging application and database were
running. Its source remained `fix/vite-esbuild-peer-conflict` with commit selection
`HEAD`; no source settings were edited. A fresh backup of `redeemer_school_staging`
completed successfully at **20:22:22 UTC**, size **2.57 MB**, in the existing local
backup schedule. This confirms backup creation, not a restore rehearsal.

The next release candidate is the tested code commit above on
`work/staging-candidate-access`. Keep the candidate preview disabled during the
initial staging deployment and migration verification. Staging has a configured
restricted runtime connection; an application migration/admin connection was not
listed among its variables. Confirm migration access and applied versions before
execution rather than assuming the runtime account can create the schema.

No new staging release or migrations have been executed. The deployment preflight
was paused because Coolify displayed unsaved source settings and automatic review
blocked navigating away to avoid losing them. Preserve those settings until the
user chooses whether to discard them. Production remains paused.

## Limits and rollout gates

- Disposable PostgreSQL 18 contention tests pass. Staging migration state, runtime
  permissions and end-to-end behavior on the Hostinger instance still need verification.
- The public sign-in limiter is per process; use a shared limiter before multiple replicas.
- Mailbox proof is not legal guardianship verification or an admission decision. Registrar
  must verify the recorded guardian relationship through the school intake process.
- The current staging test examination is PAPER: retain its schedule, fee, and receipt.
  Use a separate ONLINE fictional examination for candidate sign-in tests.
- Back up staging, review migrations 104-109 and obtain migration/access approval before
  enabling the preview. Test only with an explicitly chosen guardian test mailbox.
- There is no automatic submission at timeout, automatic scoring, pass/fail rule or
  admission decision. Approved-mark correction/re-review is not implemented; do not
  approve live marks until the school has agreed its review and correction process.
- No production deployment, staging migration or real email was performed in this change.
