# Candidate examination preview: review package

This branch combines the previously separate draft foundations for question storage,
attempts, candidate credentials, redemption, and session validation with the deployed
staging receipt/eligibility code. It does not provide candidate login or an online exam.

## Changes reviewed here

- Preserve the Registrar eligibility preview and existing Finance ledger.
- Reject unknown application states and blank/coerced fee amounts.
- Require independently verified, same-currency waivers with an explicit zero amount.
- Recheck payment/waiver eligibility when validating an existing candidate session.
- Require verification on the staff issuance query as well as redemption.
- Keep the new question-authoring and credential-issuance routes disabled unless
  ENABLE_CANDIDATE_EXAM_PREVIEW is explicitly set to true. Do not set it yet.
- Keep raw credentials out of persistence and logs; retain school/exam/application scope.

## Validation

302 tests passed, TypeScript passed, and Vite production build passed locally.
The suite uses mocked database operations and static SQL checks. A PostgreSQL service
was not available locally, so migrations 104-106 and database concurrency behavior
have NOT been executed or verified here. These checks must not be described as a
complete candidate-access security review.

## Required next implementation

1. Exercise migrations 104-106 in an isolated disposable PostgreSQL database; test
   tenant isolation, malformed question JSON, foreign keys, duplicate attempts,
   concurrent redemption, transaction rollback, and expired credential/session recovery.
2. Complete applicant identity verification, rate-limited redemption HTTP integration,
   secure HttpOnly/SameSite session cookies, CSRF, revocation, and token delivery.
3. Add staff question moderation and the candidate sitting/submission interface.
4. Verify paper/online mode boundaries and ensure candidate responses never expose keys.
5. Back up staging and obtain the specific migration/access approval before enabling.

No production or staging deployment, database migration, credential issuance, or
candidate invitation was performed as part of this review package.
