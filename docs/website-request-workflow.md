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

The local real-SQL HTTP suite covers enquiry/visit/records receipt, retries/conflicts, input and origin checks, spam limits, administrative role gates, tenant isolation, CSRF, staff assignment/status/history, immutable originals and pagination. Independent PostgreSQL tests add simultaneous public retries and conflicting follow-up updates. Live staging validation remains to be recorded.
