# ERP and portal workflow verification

Prepared 31 October 2026, America/Chicago. Production remains paused. School content is awaiting review, not approved.

## Evidence method

`server/schoolJourneysDatabase.test.js` creates a disposable PGlite PostgreSQL database, applies every migration, seeds two fictional schools and eight fictional accounts, then runs the actual authentication and operations routers over HTTP. Tests use password hashing, signed session cookies, database role/permission mappings, CSRF and the restricted runtime role with forced tenant row security. SQL and routes are not mocked. All records disappear when the test database closes. No staging records, provider messages, payments, bookings or admission decisions are created by this suite.

The tests explicitly distinguish functional API evidence from live browser journeys and school acceptance. PGlite is a PostgreSQL engine embedded for tests; it does not replace separate multi-connection PostgreSQL contention tests or a staging browser rehearsal.

## Connected journeys checked

| Journey | Verified assertions | Remaining acceptance |
|---|---|---|
| Sign-in and session | Valid staff/family logins; wrong-audience denial; unauthenticated denial; CSRF denial; logout revokes cookie | Browser account recovery, device/session lifecycle and stronger private staff entry |
| School setup | Invalid year dates rejected; subject retry preserves ID; foreign-school year cannot create a class | Full school-configured setup, timetable conflicts and real school values |
| Lesson resources | Unassigned teacher denied; draft hidden from families; publication visible to linked learner/guardian; other class excluded | Role-specific browser rehearsal, curriculum-resource attachments |
| Assignment | Own class only; duplicate submission rejected; assigned teacher returns for revision; learner resubmits; teacher reviews; unassigned teacher denied | Browser attachment/download and deadline edge cases |
| Marks and publication | Teacher submission; teacher cannot approve; publication before approval rejected; separate Principal approval; no family grade before publication; correct grade after; published marks locked; foreign tenant denied | Complete year-end review/promotion/correction rehearsal and owner policy acceptance |
| Guardian result permissions | Revoking linked guardian result visibility hides published results | Browser permission-change/session checks |
| Attendance | Assigned teacher only; retry reuses lesson session; correction requires reason; one correction-history entry; family sees corrected status; other class excluded | Offline/reconnect and full browser roll-call rehearsal |
| Student/teacher messages | Teacher must belong to class; only participants can read; teacher reply visible to student; other school excluded | Live browser messaging rehearsal without external provider delivery |
| Guardian/office messages | Guardian can use only linked learner; office reply returns; teachers denied office thread/list/reply; foreign school denied | School approval of office responsibility; campus-specific scope review |
| In-app notifications | Own-account list/read state; other learner cannot mark notification read | Browser push/provider delivery remains separate |
| Finance | Fictional LRD/USD invoices; overpayment rejected; paid invoice cannot receive same payment again; two receipts; balances zero by currency; guardian finance permission enforced; other learner and school excluded | Independent cashier roles, reversals, schedules, expenses, reconciliation and MTN MoMo acceptance |
| Procurement | Requisition and order require another approver; receiving respects outstanding quantity; duplicate/excess receiving rejected; stock balance reconciles; over-issue rejected; foreign school excluded | Inventory manager browser journey, transfers and broader stock/valuation reporting |

## Defects found and corrected

1. Assignment review used an untyped optional score in SQL. PostgreSQL could fail before an assigned teacher returned or reviewed submitted work. Added explicit numeric typing; return/resubmit/review now completes.
2. Guardian-office thread reading depended only on broad communications permission, allowing teachers to read private office conversations. Restricted office threads, aggregate inbox data and replies to the School Administrator, Principal and Campus Administrator roles, retaining the existing permissions as additional checks. The UI uses the corresponding server capability. Student-teacher conversations stay separate. This narrows access; it creates no new grants.
3. Procurement decision SQL treated a conditional approver as an untyped value and wrote NULL into a non-null optional note. Added UUID typing and preserved an empty optional note.
4. Requisition and purchase-order approval did not exclude their submitter. Both now require another authorized user. School Administrator submitter and separate Principal approver are exercised in the database suite.

## Validation and deployment

Local full suite after the backend changes: 348 total, 347 passed, zero failed, one Linux-only PostgreSQL wrapper skipped on Windows. Type checking and frontend build passed. The new real-SQL school-journey suite passed all 11 checks, including its parent test.

The backend corrections in `d33bad0f7f5ddf5cfd6e25241826af6151011c2c` passed CI run 41263308855: all 348 passed, zero failed/skipped, plus type checking/build. Staging deployment `wjukr9borr0lhvzmyrk6msjm` started 1 November 2026 at 02:00:32 UTC (31 October, 21:00:32 America/Chicago) and finished successfully. The administrator retained its office inbox; live teacher Communications no longer displayed the guardian inbox. MTN SMS stayed Not ready and dispatch disabled. No schema migration is required for these route corrections. Production remains unchanged; draft PR #57 remains unmerged.

## Explicitly still open

- School approval of the proposed website text, official facts, policies and asset permissions. The owner confirmed these materials were not previously created; see `school-website-content-review.md` for prepared drafts and a factual checklist.
- Full write/review browser rehearsals in an isolated fictional staging cohort and school acceptance. Existing learner records and published marks were inspected without modification. Read-only live guardian/student role checks are recorded below.
- Full admissions-to-enrollment, year-end reporting/correction/promotion, account invitation/recovery, encrypted document/photo/Digital ID, HR/leave/payroll, expenses, detailed reporting/export and inventory transfer rehearsals. Existing unit/mocked tests and workspace loads are not relabeled as end-to-end acceptance.
- Provider acceptance: Finance remains Partial for MTN MoMo; Communications remains Partial for MTN SMS. No live provider send/charge was attempted.
- Historical migration-ledger reconciliation, backup restore rehearsal, recovery/monitoring, cross-campus scope and whole-school rehearsal, followed by explicit owner release approval.

The full checklist stays in `whole-site-release-checklist.md`. This pass adds measured evidence and fixes; it does not declare the entire ERP or website finished.


## Live role-browser follow-up

Used the existing saved sign-ins through normal school forms, without reading passwords, sending invitations or changing account permissions. Signed out between roles.

- Guardian: separate /portal login succeeded; nine workspaces loaded: My children, Subjects & timetable, Grades & report cards, Attendance, Learning materials, Tuition & payments, Notices & notifications, Message the school, Family photographs. The linked learner remained selected. MTN MoMo checkout remained disabled. No records, message bodies, payments or photograph submissions were changed.
- Student: separate /portal login succeeded; ten workspaces loaded: My classes, Grades, Attendance, Learning materials, School notices, Fees & balance, Assignments, My Digital ID, Messages, Alerts. The Messages view showed the assigned teacher and an empty conversation list. No work, grades, messages, payments, ID issuance or push subscriptions were submitted.
- Teacher: normal /staff login succeeded; assigned class/subject, published resource, gradebook and attendance forms loaded. Communications showed announcements without a Guardian inbox. No existing marks or attendance were edited.
- Live inspection caught two display gaps in the existing teacher shell: the submission-review/student-inbox component was rendered only in a dashboard branch the teacher does not use, and curriculum-read access had a menu entry without a rendered reader view. The component now renders for the teacher Teaching workspace in the shared shell. A read-only curriculum/timetable view filters to the teacher's assignments, and its rendering tests exclude unassigned rows and editing controls. Teacher-shell fixes `3745804` / `a91df31` passed CI; a91df31 ran all 350 tests without failures or skips. Its staging deployment `fbqt1ywtpshy3zwj0taql6ip` succeeded. Teacher Student messages and Student assignment submissions panels then appeared live. Curriculum rendering additionally exposed missing teacher/subject identifiers in the setup response; the identifiers were added within the existing scoped query and an actual setup-API contract assertion now covers them. The roll-call prompt now directs an assigned teacher to select a lesson instead of repeating school setup. Final data-contract correction and deployment are recorded below.

Evidence JSON files: `outputs/guardian-browser-workspace-checks.json` and `outputs/student-browser-workspace-checks.json` in the task workspace. These record headings/state observations, not permission-bypass or complete submission/review browser acceptance. The functional write journeys remain proven separately by the isolated real-SQL suite above.


## Final teacher correction verified

Revision `a356308eeb3004ecee7e71037c2eb5f6b762b664` passed CI 41264202138: **350 passed, zero failed or skipped**, plus type check and build. Staging deployment `f7goep88e6t5i5bqq73royqo` started 1 November 2026 at 02:13:09 UTC (31 October, 21:13:09 America/Chicago) and finished successfully. No schema migration was needed.

The signed-in teacher then opened Curriculum & timetable and saw the actual assigned Grade 4 / Mathematics / 2027–2028, the configured curriculum (300 minutes / five lessons weekly and its objectives), and the truthful empty state that no lessons have yet been scheduled. There were no editing forms in this view. Teaching & learning displayed Student messages, Student assignment submissions and the corrected choose-a-lesson roll-call prompt. No messages, grades, attendance entries or timetable slots were created in these live checks.

Final proof: `outputs/teacher-curriculum-staging-verified.jpg` and `outputs/teacher-review-and-messages-restored.jpg`. The teacher view is left open for review. Production remains paused. Approved school content, complete live write/review rehearsals, remaining staff modules, provider integration and recovery checks remain open as listed above.
