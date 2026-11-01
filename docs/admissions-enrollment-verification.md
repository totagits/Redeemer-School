# Admissions-to-enrollment verification

Production remains paused. This report distinguishes a complete isolated SQL/HTTP journey from live staging browser checks and school acceptance.

## Connected isolated rehearsal

`server/admissionsEnrollmentDatabase.test.js` applies every migration to a disposable PostgreSQL engine, creates two fictional schools and actual staff roles, and signs in through the real authentication router. Cookies, CSRF, permissions, SQL and forced tenant row security are exercised. Email and invitation delivery are captured locally; no provider message, real applicant decision or persistent account is created.

Verified chain:

1. Public application consent and receipt reach the Registrar with source/history. Early enrollment, invalid status transitions, teacher decisions and foreign-school access are denied.
2. Registrar creates/assigns an online examination. Finance alone configures the examination fee (explicit zero in this fixture). The Principal reviews/freezes questions before scheduling; the Registrar cannot self-authorize that approval.
3. Guardian mailbox proof precedes credential delivery. Candidate signs in, sees questions without answer keys, saves and submits answers. The disposable fixture alone advances its examination window to avoid waiting.
4. Registrar marks; a separate Principal approves and releases a private result. The application remains UNDER_REVIEW after a 100% result: no automatic admission decision.
5. A School Administrator records the fictional admission acceptance; Registrar enrolls into the selected school class. A retry cannot create a second student/enrollment; enrolled applications cannot be changed through admission status controls. The learner, guardian relationship, activity and audit are retained.
6. Only an account manager can issue linked student/guardian invitations. Failed delivery rolls the account and guardian linkage back. Single-use invitations activate the accounts; reuse fails. Each family account sees the enrolled learner; family users cannot access Admissions. Existing intake guardian relationships are preserved instead of duplicated. Default finance visibility and communication consent stay off.

## Defects corrected

- Question approval previously required the authoring permission that the standard Principal role does not have, despite displaying a leadership approval control. It now requires admissions read plus the existing explicit Principal/School Administrator role gate. Registrar and teacher remain denied. Principal question authoring and general admission status editing are not enabled.
- Parent portal creation previously inserted another guardian and relationship after enrollment had already created them. It now reuses a single active, unlinked guardian matched by learner and email inside the invitation transaction. Ambiguous records stop for staff review; no school-wide email match silently grants a portal account. Existing names/contact/primary relationship history are preserved.

## Validation

Local full regression suite: 362 total, 361 passed, zero failed, one platform-specific PostgreSQL wrapper skipped on Windows. Type checking and build passed. CI run 41301803362 passed all 362 tests, zero failed/skipped, plus type checking/build for f611605d313227f6bbb97096434f141e681c8713. No schema migration is required for these route fixes.

Live staging browser evidence and deployment are recorded below when verified. Provider email delivery and human password entry for newly created staging accounts are separate acceptance steps; isolated captured invitations do not claim those actions occurred in a browser.


## Live staging follow-up on 1 November 2026

Revision f611605d313227f6bbb97096434f141e681c8713 deployed successfully in Coolify deployment ip9pj1qr3epjvkzhxvgrzws3 (11:27:00 UTC start). No migration, production setting or provider integration was changed.

A new clearly fictional public applicant was submitted through review/confirm/receipt screens: RIA-2026-983966D6, TEST Intake Workflow 20261101. Its original guardian contact uses a non-deliverable fixture address. Existing examination acceptance fixtures were left unchanged; the full online examination/decision/account chain above ran in the isolated database, not a new live exam for this browser applicant.

Registrar reviewed the incoming application. A separate School Administrator recorded test acceptance. Registrar enrolled TEST-INTAKE-20261101 into configured Grade 4 / 2027-2028. Admissions shows ENROLLED, disables further admission-status edits and hides the enrollment form. Four activity entries preserve public receipt, Registrar review, administrator acceptance and enrollment. Student records shows the new learner, class, enrollment timeline and original guardian. No existing learner was edited, no payment/invoice was issued, and no Digital ID was issued.

The owner delegated test-inbox selection and explicitly approved creation of the two scoped family accounts and setup emails. The student account links only to this learner. A distinct fictional secondary guardian contact was added before its portal invitation; the original primary intake contact remains intact. Guardian published-results, finance and communications permissions are off. Both invitation actions returned account-created/email-sent success. Owner password selection, actual inbox receipt and subsequent live family-session checks remain pending. No password was entered or read by the agent. Personal addresses and setup tokens are deliberately excluded from this public repository.

Evidence is saved locally in workspace outputs: admissions-intake-browser-receipt.jpg, admissions-registrar-review.jpg, admissions-enrolled-history.jpg, admissions-learner-guardian-records.jpg and admissions-student-invitation-prepared.jpg. Screenshots containing contact details are not committed.

This is a completed isolated connected rehearsal plus a live public-to-enrollment and invitation handoff. Final live activation is pending; this is not complete school acceptance.
