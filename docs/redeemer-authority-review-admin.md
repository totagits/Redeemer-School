# Redeemer school-authority staging review

Prepared 8 November 2026. Production remains paused. SaaS development is deferred while the school review is prepared.

## Shareable review links

- Review briefing, role tasks and feedback: https://redeemer-staging.totag.network/review
- Payroll policy worksheet: https://redeemer-staging.totag.network/review/payroll
- Public website: https://redeemer-staging.totag.network/
- Student/Guardian access: https://redeemer-staging.totag.network/portal

The separate staff entry is supplied privately to the designated administrator and authorized staff. It is not linked from the public website or review briefing. Do not forward staff credentials or another person's invitation.

## Administrator account and invitations

The designated administrator must have an individual, authorized staging account. A public link does not create an administrator or grant a role. The coordinator must confirm their name, email and whether an existing administrator account belongs to them before account provisioning. Creating another School Administrator is a privileged access change, not ordinary public registration; it needs the owner's explicit authorization and the controlled account process.

Once signed in:

1. Open User guide and start the tour. Then open People & accounts for staff account/invitation management. Use a different email and individual account for each reviewer.
2. Prepare the reviewer roster: name, email, approved role, and assigned fictional class/learner. Verify addresses before sending setup emails. The blank roster is available in the review briefing; it has no password column.
3. Create the appropriate staff record/account and assign only its approved role: Principal, Registrar, Teacher, Finance, HR or Inventory. Send the individual setup invitation through the application. Reviewers choose their own passwords. A setup link is one-time, expiring and personal; it is not a generic registration link for a whole group.
4. Create a distinct class/cohort named **TEST Authority Review 20261108**, using the existing approved school year/grade. Assign the review teacher to it. Use fictional learner numbers starting **TEST-REVIEW-20261108-**; do not move or repurpose the earlier TEST-INTAKE learner or real records.
5. Enroll fictional learners in that class. Create Student portal accounts linked to the intended learner; create Guardian accounts and relationships linked to that same fictional learner. An unlinked portal account will not show a meaningful school experience. Adult reviewers may use these role accounts to simulate a student/family experience; no actual child data is needed.
6. Leave Guardian finance/communication permissions off unless the owner explicitly approves that part of the review. Enable published-result visibility only for the assigned fictional learner when the school requests it. The earlier restricted-guardian fixture must retain its restrictions.
7. Use separate people for preparation/review/approval. A Finance preparer must not also approve the same payroll; a teacher/marker must not independently approve their own result. Do not solve a denial by combining every role into one account.
8. Check invitation delivery and activation, one account at a time, then check the intended learner/class view. Suspend or correct misassigned accounts through authorized account management; never share one administrator password as a workaround.

The existing staging email service has delivery evidence, but new recipient addresses and sender/provider restrictions still need checking when actual invitations are sent. No account or invitation is created by publishing the review links.

## Fictional workflow rehearsal

Use the new TEST class and fictional cases. Start with website navigation and the narrated User guide, then the Teacher -> Student submission/revision -> separate leadership result publication -> authorized Guardian view. Registrar can rehearse fictional admission/enrollment separately. HR can rehearse a TEST vacancy and leave request; Finance can prepare a draft manual payroll for independent review. Inventory can rehearse a TEST requisition and receiving.

Do not send real SMS, use live MTN payment prompts or record genuine payroll payments. If reviewers need to simulate a payment record, the coordinator must identify the fictional run and evidence reference clearly beforehand. Paid records are intentionally locked and are not disposable drafts. No demonstration may select real staff/learners as its target.

## Feedback and policy review

Reviewers submit one workflow observation through the review page. It is stored as an ENQUIRY with a **STAGING REVIEW** subject in the existing private **Website requests** queue. It sends no automatic email/SMS and grants no permission. The coordinator should assign and follow up each entry, using its reference. The normal limit is six requests per 15 minutes from one connection.

Payroll worksheet entries stay in that browser page until the reviewer prints/saves a PDF. They are not automatically saved or approved. Obtain the completed worksheet and the school's independent approval before implementing automated rules. Other policy proposals can be recorded in feedback and followed up for formal documents. No employee salaries, identifiers, banking details or passwords belong in feedback.

## Review controls

- Agree review times before deploying changes. Keep the reviewed staging revision recorded and avoid disruptive releases during sessions. No permanent freeze mechanism is claimed.
- Keep live Collections and SMS disabled. Do not purchase a bundle, send chargeable messages or change provider credentials for this review.
- Preserve prior test evidence and history. Give each reviewer their own fictional records rather than overwriting previously accepted cases.
- Track findings as Confirmed / Needs change / Awaiting school policy / Awaiting provider / Retest / Accepted. Feedback alone is not production approval.
- Account provisioning and the end-to-end reviewer activation check remain pending until the designated administrator's identity and authority are confirmed.

## Release record

The review pages and worksheet are an additive staging preparation. They reuse the existing private enquiry queue; no database migration is required. No production deployment is authorized.

- Reviewed release: `95f7859822297addaab135e4af4f5ec226827278`, GitHub run [42486239063](https://github.com/totagits/Redeemer-School/actions/runs/42486239063). All 423 tests passed without failures/skips; type checking and build passed. Local checks passed 422 with one existing platform-specific skip.
- Coolify staging deployment `aqqsxz0wqiatgj2xioshf3i5` finished successfully. It began 8 November at 13:44:34 UTC (07:44:34 America/Chicago). The staging commit pin was saved and reloaded before deployment. Keep this reviewed revision pinned during school review sessions.
- The review briefing loaded on staging with the role tasks, family link, feedback form and explicit unfinished-work notices. No public staff-entry URL was added.
- One fictional preparation entry committed with receipt `WEB-2026-5F7FFA9CAB61`, subject `STAGING REVIEW — Review briefing preparation`. It is a test observation, not a school policy/acceptance decision. No automatic message or payment was triggered.
- The live payroll worksheet loaded, accepted a clearly labelled temporary TEST edit, and was cleared again. Entries were not submitted as school policy. The blank roster download completed successfully. Printing/saving a PDF remains a reviewer-controlled action.
- Private staff and family links both loaded the correct sign-in page with school code RIA. No new authority account, privilege grant, password or invitation has been created.
- Evidence in workspace outputs: `authority-review-briefing.jpg`, `authority-review-feedback-receipt.jpg`, `authority-review-policy-edit.jpg`. The local administrator instructions include the privately distributed staff URL; that URL is not added to this public repository briefing.
- Designated administrator name/email and existing-account status remain pending. Their account activation, individual reviewer invitations, isolated TEST class/learners and final reviewer access checks must follow that appointment. Existing test records have not been repurposed.
