# Candidate examination preview: guardian email and sign-in

This draft combines the candidate foundations with the deployed staging receipts and
eligibility preview. No staging or production changes have been deployed.

## Implemented

- Migrations 104-107: private question/attempt storage, hashed single-use credentials,
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
- The signed-in candidate page explicitly says question delivery is not yet available.

## Validation

All 318 automated tests pass. The full existing migration chain executes in disposable embedded PostgreSQL (PGlite),
including 104-107. Tests exercise real RLS, composite foreign keys, duplicate attempts,
invalid question JSON, single-use redemption, rollback, expiry, guardian email changes,
HTTP cookies, origin checks, CSRF, rate limits and sign-out. Email delivery tests use a
mock transport; no real email or personal data is sent. TypeScript and Vite build pass.
The candidate and verification pages have been checked in the local browser with the
feature disabled. Real provider delivery and enabled UI end-to-end proof remain pending.

## Limits and rollout gates

- PGlite tests do not prove multi-connection contention on the Hostinger PostgreSQL
  version. Exercise concurrent redemption and issuance on disposable server PostgreSQL.
- The public sign-in limiter is per process; use a shared limiter before multiple replicas.
- Mailbox proof is not legal guardianship verification or an admission decision. Registrar
  must verify the recorded guardian relationship through the school intake process.
- The current staging test examination is PAPER: retain its schedule, fee, and receipt.
  Use a separate ONLINE fictional examination for candidate sign-in tests.
- Back up staging, review migrations 104-107 and obtain migration/access approval before
  enabling the preview. Test only with an explicitly chosen guardian test mailbox.
- Question moderation, candidate question delivery, sitting/submission, scoring, result
  approval and private result release are still unfinished. Do not present this as a
  complete online examination system.
- No production deployment, staging migration or real email was performed in this change.
