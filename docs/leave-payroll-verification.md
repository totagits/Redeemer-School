# Leave, manual payroll and external service readiness

Updated 7 November 2026. Production remains paused.

The owner approved: employees request leave, HR reviews, a separate Principal or School Administrator decides; Finance prepares manual payroll, a separate leader approves, then Finance records payment completed outside the ERP.

## Scope

- Leave requests use the existing staff tables. Employees see their own requests. HR and leadership see the review queue. Employee self-review/self-approval, the HR reviewer deciding the same request, overlapping active requests, stale revisions and foreign-school records are blocked. Pending requests can be cancelled by their employee; approved leave requires an independent leader to cancel. Reasons, review notes and actor history are retained.
- Leave dates are calendar dates. No statutory entitlement, accrual, public-holiday deduction or automatic leave balance is invented. School-approved rules remain necessary before automating those calculations.
- Finance prepares one-currency payroll periods with a manual schedule reference. Each employee line records gross, additions, deductions, the server-calculated exact-cent net and a review explanation. Only the original preparer edits a draft. Review locks its lines. A different leader can approve or return it. Approved/paid employee periods cannot overlap. Paid runs are immutable through the workflow.
- Payment recording requires an actual date and a unique evidence reference after approval. It performs no bank or mobile-money transfer, provider payout, general-ledger posting or statutory remittance. Payroll corrections after payment and statutory tax/social-security calculations remain outside this increment.
- Employees see only their own paid payslips through their linked staff record. HR has no payroll-run access through its HR role. Finance and leadership have the assigned payroll access.
- External services shows server-side configuration readiness without secrets, network calls, messages or payments. MTN MoMo and SMS remain Partial until the provider-specific acceptance is complete. Existing email delivery evidence remains separate from configuration status.
- New sidebar workspaces have role-filtered narrated visual demonstrations, using fictional practice screens.

## Validation

The full local regression suite passed 379 tests, no failures, with one existing platform-specific skip. Type checking and the frontend build passed. Additional independent-leader self-approval cases passed in the isolated authenticated SQL test.

The disposable PostgreSQL-compatible database tests exercise actual authentication, CSRF, runtime RLS, review transitions, employee privacy, foreign-school denial, date overlap, exact decimal arithmetic, locked lines, returning drafts, independent approval, payment retries and duplicate periods. Provider readiness never sends traffic. Existing MTN adapter regression tests remain included in the full suite.

GitHub run 42094264965 passed all 380 tests with no failures or skips for implementation 63732a2975ece2c273ea749c0d389a0d6f93af11.

The final interface polish d82f75534bb8e0b0367b5dc7ff677c3701343ee9 also passed all 380 tests without failures or skips in GitHub run 42096322030. Type checking and build passed. It hides action forms when the signed-in user has no available action and consistently displays two-decimal payroll totals. Coolify deployment ivxn3lu3dllsyr4fovw5ofdl was confirmed Finished with this revision on 5 November; it required no additional migration.

## Staging evidence

The fresh redeemer_school_staging backup succeeded at 19:29:59 UTC on 5 November, 3.01 MB: pg-dump-redeemer_school_staging-1793906997-2tov7qm8qijjeq1shlkbssaz.dmp. Deployment 8rgd9lfvkczcd0kkhlv5shz9 finished successfully with the tested revision. Migration 115_leave_payroll_workflows.sql committed inside a transaction, migration lock and explicit staging-database guard. Its ledger entry and forced row security on leave requests, payroll runs, payroll lines and workflow events were verified.

Live leave: HR Manager James Williams requested TEST ONLY — leave workflow 20261105 for 1–2 February 2027. School Administrator Michael Gwoah recorded the separate HR review; his reviewed request had no approval action. Principal James Doe approved it. The history retained all three actors and timestamps. The Principal then cancelled the fictional leave, retaining history and leaving no active test absence.

Live manual payroll: Finance Agnes Thompson created the October 2026 USD run with reference STAGING-TEST-PAYROLL-20261105-NO-REAL-PAY for fictional employee TEST-HR-20261105 only. Gross 100.05 + additions 10.10 − deductions 5.02 produced net 105.13. Submission locked the employee amounts. Principal James Doe approved separately. Finance recorded simulated payment evidence STAGING-TEST-NO-TRANSFER-20261105 dated 5 November. The paid view has no edit or payment action; actor history is retained. No real salary, contract, tax or funds transfer was involved. Finance's own payslip view remained empty rather than exposing the fictional employee's pay. Actual employee payslip access was proven in the isolated authenticated SQL test; no new live account invitation was sent.

Live external readiness: MoMo SANDBOX configuration ready, MTN SMS incomplete/disabled, staging email configuration ready. No live enable flag changed and no provider traffic was sent. Existing MTN adapter acceptance remains separate from the readiness view.

Live guide: selecting Payroll started the 14-step narrated visual demonstration automatically and advanced to its approval/payment screen without manual lesson or narration clicks. Evidence screenshots are in outputs/leave-payroll-staging-backup.jpg, outputs/leave-payroll-migration-verified.jpg, outputs/leave-approved-history.jpg, outputs/manual-payroll-paid-history.jpg, outputs/external-service-readiness.jpg and outputs/manual-payroll-automatic-guide.jpg.

The final browser reload was initially blocked by the automatic approval usage limit. On 7 November, authorized Edge access succeeded through the normal browser approval mechanism. After loading the deployed interface and signing in as HR Manager, the cancelled test leave was expanded. No leave action selector, note form or save button was displayed. View leave history retained the request, separate HR review, Principal approval and cancellation, including actors and timestamps. This completes the final visual check of the interface polish. Evidence: outputs/leave-final-cancelled-verified.jpg. No workflow, backup, deployment or migration was repeated.

No production release is authorized. Remaining dependencies are the school-approved automated leave/payroll rules, post-payment correction/statutory remittance scope, and actual MTN provider approvals and witnessed acceptance.
