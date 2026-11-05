# Leave, manual payroll and external service readiness

Updated 5 November 2026. Production remains paused.

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

Migration 115_leave_payroll_workflows.sql extends existing leave/payroll tables and adds append-only workflow events with forced school RLS. Staging backup, deployment, migration and live browser verification are pending at this commit. No production release is authorized.
