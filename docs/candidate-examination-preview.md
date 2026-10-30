# Candidate examination preview: sitting, marking and private results

This draft combines the candidate foundations with the deployed staging receipts and
eligibility preview. The code and migrations are deployed to staging with the
candidate preview initially disabled, then enabled for the authorized fictional
guardian-email test. Production remains paused and unchanged.

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
- Staging verification, examination and result emails require an exact mailbox in
  EMAIL_ALLOWED_RECIPIENTS. An empty list, wildcard or domain suffix permits no sends.
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

All 326 local automated tests pass (one Linux CI-only PostgreSQL check is skipped).
GitHub run [41124248847](https://github.com/totagits/Redeemer-School/actions/runs/41124248847)
passed all 327 tests with no skips, TypeScript and the frontend build at code commit
`b8d344cd2169f310bcc3defa1d230ed33de6ab53`.
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

The user approved discarding the unsaved source settings. A read-only database
preflight confirmed migrations 104-109 were absent. The earlier 102/103 examination
and fee tables already existed but their versions were absent from schema_migrations;
do not blindly rerun the full migration chain against staging or mark those older
versions applied without first reconciling their actual schema.

Using the existing database-container postgres account, the six SQL files 104-109
were downloaded from tested commit 6098f9231baa5bfd6d581c007a8016bb14b450b9,
checked against their Git-blob SHA-256 hashes, then applied and recorded in one
transaction. The transaction guarded the exact staging database name, existing fee
schema and absence of the new tables/versions, with advisory locking and timeouts.
It committed successfully. All six versions are recorded, and all nine new tables
have forced RLS. The runtime role is neither superuser nor BYPASSRLS, has the needed
marking permissions and cannot update approved question snapshots. No administrative
database credentials were added to the application.

Staging deployed 6098f92 successfully, followed by the email recipient restriction
at b8d344c (Coolify deployment bekib8nafrwjxpf2qsxbu6nm). The saved source is
work/staging-candidate-access pinned to b8d344cd2169f310bcc3defa1d230ed33de6ab53.
Staging was changed to manual deployments after its existing webhook automatically
deployed the pushed email fix. Future draft pushes must not trigger releases.

Live readiness reports ready/database connected/authentication configured. The
candidate status reports enabled=false and sittingAvailable=false; /examination
shows the unavailable notice. The existing fictional PAPER examination remains
SCHEDULED with an LRD 500 fee and LRD 500 settlement, reference RIA_EX0001_2026.
The user subsequently authorized a guardian test mailbox. EMAIL_MODE was explicitly
set to staging, EMAIL_ALLOWED_RECIPIENTS restricted to that mailbox, and the preview
enabled as a runtime-only setting. Coolify deployment 1yogmv5ntbgn5fspjdrwixr9
succeeded at 20:50 UTC on the same pinned code. The guardian verification form loads.

Through the existing Registrar account, fictional application TEST-ONLINE-20261030-01
was created with clearly marked test names and notes, using the authorized mailbox.
The staff verification action returned "Verification code sent to the recorded
guardian email." This proves provider acceptance, not inbox receipt or mailbox proof.
Actual guardian code entry/verification is pending. No candidate access code or
private result code has been issued.

The user reported that no verification email arrived. A read-only delivery-status
lookup using the existing staging Resend key returned HTTP 401 restricted_api_key;
the key is restricted to sending, not delivery-log access. This is not evidence
that the original send failed. No key permissions were expanded and no duplicate
message was sent. Delivery diagnosis awaits sign-in to the existing Resend dashboard;
the connected Gmail account is not the authorized recipient mailbox.

A separate ONLINE draft, TEST — Grade 4 Online Guardian Access 20261030, has that
fictional applicant assigned and two harmless test questions (maximum four points).
The existing School Administrator reviewed and froze its question set. Scheduling
confirmation was not verified as completed; last observed status was DRAFT. Fee
configuration and the enabled candidate sitting/result workflow remain pending.
The proposed draft window was 2026-10-30 21:15–22:15 GMT; recheck the current time
and adjust the draft before scheduling if the window is no longer appropriate.

The pre-test disabled status described above is historical; the staging preview is
currently enabled for this controlled test. Public repository notes deliberately
omit the guardian mailbox and all verification/access codes. Production is unchanged.

## Limits and rollout gates

- Disposable PostgreSQL 18 contention tests and staging schema/runtime checks pass.
  Inbox receipt, guardian proof and enabled candidate sitting/results remain unverified.
- The public sign-in limiter is per process; use a shared limiter before multiple replicas.
- Mailbox proof is not legal guardianship verification or an admission decision. Registrar
  must verify the recorded guardian relationship through the school intake process.
- The current staging test examination is PAPER: retain its schedule, fee, and receipt.
  Use a separate ONLINE fictional examination for candidate sign-in tests.
- A pre-migration staging backup, migrations 104-109 and the authorized mailbox setup
  are complete. Complete mailbox proof before issuing an examination code. Never use
  a real student record for this test.
- There is no automatic submission at timeout, automatic scoring, pass/fail rule or
  admission decision. Approved-mark correction/re-review is not implemented; do not
  approve live marks until the school has agreed its review and correction process.
- No production deployment, candidate examination-access email or result email was
  performed. One authorized staging guardian-verification email was accepted for sending.
