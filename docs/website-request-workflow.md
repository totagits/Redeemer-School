# Public website requests and private administrative follow-up

Scope approved by the owner on 2026-10-31: Request Information, school visits and records-request forms enter a staff follow-up queue. Production remains paused.

## Public process

- The visitor chooses the relevant public school page, enters name, subject, request text and at least one contact method, consents to follow-up, reviews, then confirms submission.
- School visits may include a preferred future date. Receipt is not an appointment booking.
- Records requests collect only an initial request. No identity documents, passwords, transcripts or confidential learner information should be entered. Staff verify identity/authority through the existing school procedure before any release.
- The response contains only acceptance and a random reference. There is no public request-list or record-lookup endpoint and no administrative login link.
- A client-generated submission reference and normalized payload hash make retries idempotent; conflicting reuse returns a conflict. Server validation, bounded per-process rate limiting, a honeypot, same-origin checks and a small request-body limit apply. Use a shared limiter before multiple replicas.

## Private follow-up

Only existing School Administrator, Principal or Registrar roles with admissions read permission can access Website requests. Other roles, public users and other schools are denied. No account permissions were granted or changed.

The queue has status filtering and pagination. Staff open a request, verify the appropriate process, record an internal note, and can assign follow-up to themselves. Status changes follow NEW -> IN_PROGRESS -> WAITING_FOR_VISITOR / RESOLVED / CLOSED, with deliberate reopening supported. Revision checks reject conflicting updates. Original visitor details are immutable, and follow-up history is append-only under the runtime role.

Follow-up recording sends no email or SMS, creates no booking and releases no documents. Staff use the school's approved contact process and record the outcome. This queue is independent of the remaining MTN MoMo/SMS integration work.

## Deployment and checks

Migration 111 adds the two forced-RLS request/history tables and preservation trigger. It must be reviewed and applied only after a verified staging backup, with an exact database/history guard and its migration ledger entry. Do not rerun the full migration chain against staging, whose earlier 102/103 ledger history remains to reconcile.

The local real-SQL HTTP suite covers enquiry/visit/records receipt, retries/conflicts, input and origin checks, spam limits, administrative role gates, tenant isolation, CSRF, staff assignment/status/history, immutable originals and pagination. Independent PostgreSQL tests add simultaneous public retries and conflicting follow-up updates. The feature commit passed all 337 CI checks (local Windows run: 336 passed, one Linux-only PostgreSQL wrapper skipped). Type checking and production build passed. Live staging validation is recorded below.


## Staging evidence — 2026-10-31

- Verified staging-only backup completed 20:03:06 UTC, 2.63 MB.
- Applied only migration `111_public_website_requests.sql`, with exact staging database and migration-history guards, a transaction, advisory lock, fail-on-error and SHA-256 verification (`2dd5b61978946c40e372a2bb9f3d8b96ae441db8e9037eba00730f74806bd7b1`). COMMIT and ledger entry confirmed.
- Both new tables have enabled and forced row security. Runtime role has no DELETE privilege on either, no superuser status and no RLS bypass.
- Initial staging deployment `kqjo1q3v2fhummme7z332jrk` successfully deployed `8dd4a3c` at 20:04 UTC. Live testing caught a blank administrator workspace: its rendering branch differed from the other staff dashboard branch. Corrected by rendering the self-loading queue before both branches; no database changes required for this correction.
- All three public review/confirm/receipt journeys passed using explicitly fictional contacts at `example.invalid`: enquiry `WEB-2026-D4DD636F635E`, visit `WEB-2026-3B5F6B15FA9C` (preferred date 2026-11-02), records `WEB-2026-EA4D8A90093A`. Receipts do not confirm appointments or release records. No email/SMS was sent.
- Corrected staging revision `c451d20619485b46f6b7e60d01c063c0c2b7ce11` passed CI run 41237347005: 337 passed, zero failed/skipped; type check and build passed. Deployment `rvhdi68sotryugitxjquuneb` started 20:07:33 UTC and finished successfully.
- School Administrator opened Website requests and saw all three matching receipt references. Enquiry assignment to self moved NEW -> IN_PROGRESS; internal follow-up moved to WAITING_FOR_VISITOR then RESOLVED. Each step saved actor, timestamp and note, with a confirmation that no email/SMS was sent. Filtering to RESOLVED and reopening fetched the preserved original and all four history entries from the server.
- Visit details preserved 2026-11-02 and explicitly said this is not an appointment confirmation. Records details required identity/authority verification and warned against putting confidential learner documents in notes. Both remain NEW as visible fictional examples for review.
- Public pages displayed family access without administrative login links. Automated rendering coverage checks all public school pages, header, homepage and family sign-in for administrative login controls/links. Stronger pre-authentication staff-entry protection remains a production gate in the whole-site checklist.
- Evidence: `outputs/website-enquiry-receipt.jpg`, `outputs/website-records-receipt.jpg`, `outputs/website-request-follow-up-history.jpg`, `outputs/website-requests-migration-111.jpg`, `outputs/website-requests-database-protections.jpg` in the task workspace. Production was unchanged; draft PR #57 remains unmerged. This verifies the request workflow, not all remaining school processes or provider integrations.
