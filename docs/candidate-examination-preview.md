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
GitHub run [41203338298](https://github.com/totagits/Redeemer-School/actions/runs/41203338298)
passed all 327 tests with no skips, TypeScript and the frontend build at code commit
`09f74e2f4b2b5c43ec1444830483aa1ba1018e7b`.
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
Real guardian verification and access-email delivery are verified in staging.
Candidate sitting, marking and private-result release remain pending.

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
The user subsequently completed code entry successfully; the verification page
confirmed that the Registrar could issue an examination-access code.

The user reported that no verification email arrived. A read-only delivery-status
lookup using the existing staging Resend key returned HTTP 401 restricted_api_key;
the key is restricted to sending, not delivery-log access. This is not evidence
that the original send failed. No key permissions were expanded. After the user
signed in to the existing Resend dashboard, the original email was marked Delivered
but was 38 minutes old, beyond its 30-minute verification window. One fresh challenge
was then requested through the Registrar workflow; the new email was also marked
Delivered. Provider delivery means Gmail accepted it, not confirmed inbox placement
or user receipt. The user was given an all-folders Gmail search and asked to use the
newest code. Mailbox proof was subsequently confirmed in the verification UI.
The connected Gmail tool account is not
the authorized recipient mailbox, so it was not used to read recipient messages.

A separate ONLINE examination, TEST — Grade 4 Online Guardian Access 20261030, has
the fictional applicant assigned and two harmless questions (maximum four points).
The School Administrator reviewed and froze the question set.

On 2026-10-31, on-page schedule/time review replaced browser confirmation popups.
An additional server fix permits a never-published draft with an old date to move to
a future window, while started scheduled sessions and attended/scored assignments
remain protected. The real HTTP/database test covers those allowed/blocked cases.
Deployment ad2fsy4atnqxgjrm0064jg44 succeeded with tested code 09f74e2; this is now
the saved staging pin on work/staging-candidate-access, with manual deployment.

The existing online draft was corrected through the audited staff workflow and
scheduled for **2026-10-31 13:15–14:15 GMT** (08:15–09:15 America/Chicago). Its fee
was configured as LRD 0, with no settlement/payment collected. Eligibility returned
ELIGIBLE. A one-use examination-access code was sent through the staff action and
its new message was visible in the authorized Gmail inbox at 08:01 local time.
The candidate signed in inside the permitted window, started the two-question
examination, saved both answers and reloaded successfully. A final short-answer edit
was submitted without separately pressing Save; staff saw the final answer, confirming
submission preserved it. Submission at **13:16:42 GMT** closed further edits.

The School Administrator marked the fictional answers **4/4 (100%)**. Self-approval
was unavailable. The separate Principal test account exposed an API permission
mismatch: approval incorrectly required general admissions editing despite the
leader-specific approval control. Commit **16da2c2587f91c7190885c24c16613f6210cba9e**
requires admissions read access plus the existing leader-role check for approval and
release; marking still requires admissions write. Regression checks use the
Principal's actual read-only admissions access, preserve CSRF, reject Registrar and
self-approval, and retain approved-mark immutability. All **327 CI tests passed**
(run 41205370604), including PostgreSQL 18 contention checks. Type checking and build
also passed. Local tests passed 326 with the Linux-only contention wrapper skipped.

Coolify deployment **dhbenonrhscsy8mo2sndloxv** succeeded at **13:24:32 UTC** with
16da2c2 pinned, manual deployments retained. The Principal test account then approved
the marks and released the result at **13:25:07 GMT**. These are separate test accounts
operated during one test, not a claim of independent human review. The staging result
email appeared in the authorized Gmail inbox. Its private code successfully opened
/examination/results, showing the correct test reference, 4/4, 100%, staging feedback
and explicit no-admission-decision notice, without questions or answer keys.
No real applicant, payment or admission decision was involved.

The pre-test disabled status described above is historical; the staging preview is
currently enabled for this controlled test. Public repository notes deliberately
omit the guardian mailbox and all verification/access codes. Production is unchanged.

## Limits and rollout gates

- Disposable PostgreSQL 18 contention tests and staging schema/runtime checks pass.
  Guardian proof, access-email receipt, candidate save/reload/submission, separate-account
  marking approval and emailed private-result viewing pass in the live staging test.
- The public sign-in limiter is per process; use a shared limiter before multiple replicas.
- Mailbox proof is not legal guardianship verification or an admission decision. Registrar
  must verify the recorded guardian relationship through the school intake process.
- The original PAPER examination retains its schedule, fee and receipt. Candidate
  sign-in testing uses the separate ONLINE fictional examination described above.
- A pre-migration staging backup, migrations 104-109 and the authorized mailbox setup
  and mailbox proof are complete. Never use a real student record for this test.
- There is no automatic submission at timeout, automatic scoring, pass/fail rule or
  admission decision. Approved-mark correction/re-review is not implemented; do not
  approve live marks until the school has agreed its review and correction process.
- No production deployment was performed. Authorized staging guardian-verification,
  examination-access and private-result emails were received during the fictional test.
