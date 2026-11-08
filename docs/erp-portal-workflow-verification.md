# ERP and portal workflow verification

Prepared 31 October 2026, America/Chicago. Production remains paused. The owner-approved website content and its administration editor were verified on staging on 1 November; later dated entries supersede historical pending-content notes.

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

- Content approval and editable website pages: completed for the reviewed wording and existing facts/media; unspecified official details remain for administration to supply. See the 1 November entry and `website-administration.md`.
- Remaining live teaching and portal checks are listed in the 4 November entry. Earlier read-only browser observations remain recorded below.
- Year-end reporting/correction/promotion, account recovery, encrypted document/photo/Digital ID, HR/leave/payroll, expenses, detailed reporting/export and inventory transfer rehearsals. The admissions-to-enrollment and student/guardian activation evidence is in the 1 November entry.
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


## 1 November 2026: approved content and photo editor verified on staging

The owner's content approval is recorded, including the condition that school administration can update it. The homepage and all 34 menu pages now have editable draft/published snapshots. School Administrator/Principal management uses the existing public-content permission; public menus contain no staff-login entry. Missing official names, detailed policies, dates and schedules have not been invented.

- CI runs 41266219992 and 41300220578 passed. The editor's complete suite reports 356 tests passed, zero failed/skipped; type checking and build also passed. Real SQL/HTTP checks cover tenant/role denial, CSRF, concurrent-version rejection, private image/PDF access, publication/withdrawal, restored drafts and protected history. These are distinct from live browser evidence.
- Staging migration 112 completed with COMMIT against `redeemer_school_staging` only. Verified 35/35 initial public snapshots, forced row security on all three tables, no runtime DELETE and no superuser/RLS-bypass privilege. The pre-existing backup succeeded at 02:41:51 UTC. An additional fresh backup completed at 11:04:51 UTC (2.67 MB) before migration 113 corrected imported punctuation, preserving original snapshots and adding correction history. Migration 113 also committed successfully; the original 112 file was retained unchanged.
- Exact deployed application: `ee7c017b78050b781cbbea2efc4d61baccc4f654`, manual Coolify deployment `qd2qagzs5ben5dnlqirdc2f8`, successful 11:05:50 UTC deployment (new container started 11:06:16 UTC). Prior editor deployment `eghhitgub1vqusmmzdtdrrfi` also succeeded.
- Live School Administrator browser journey: select About Us; upload existing approved illustrative courtyard WebP with accurate accessibility description/caption and publication consent; save private version 3; confirm public version 2 still has no photo; review saved preview and explicitly confirm; publish version 4; verify public image, caption and original approved wording. Upload completed with the ordinary Windows picker; no browser-extension permission change was needed.
- Live checks confirmed the approved Principal message, Mission/Values and handbook contents outline. The homepage editor exposes school identity, address, phone numbers and content blocks. Detailed handbook policies still need school-specific completion when supplied; the published outline accurately directs families to the office.
- Evidence: `outputs/website-about-us-photo-published.jpg`, `outputs/website-staff-photo-upload-controls.jpg`, `outputs/website-admin-editable-contacts.jpg`, `outputs/website-editor-fresh-backup.jpg`, `outputs/website-editor-staging-migration.jpg`, `outputs/website-editor-staging-isolation.jpg` (workspace outputs directory, outside repository).

Production remains paused. PR 57 stays draft and unmerged. Finance/Communications keep their MTN-dependent Partial status. Remaining staff/portal journeys, recovery rehearsals and the stronger private staff-entry requirement retain their existing release gates; this content-editor completion is not whole-product acceptance.


## 1 November: admissions handoff rehearsal

The complete public application -> Registrar review -> Finance-controlled exam fee -> leadership-approved questions -> verified guardian/candidate submission -> separate mark approval/private result -> explicit admission decision -> one-time enrollment -> student/guardian invitation activation passed with real authentication and SQL in a disposable database. This found and fixed Principal question-approval permission and duplicate enrolled-guardian creation during portal invitations. CI 41301803362 passed all 362 tests with no failures/skips; staging f611605 deployed successfully in ip9pj1qr3epjvkzhxvgrzws3 without a migration.

Live fictional application RIA-2026-983966D6 reached Registrar, was reviewed, accepted by a separate administrator and enrolled by Registrar as TEST-INTAKE-20261101. Student records and retained history were verified. Owner-approved student/guardian invitations returned success. The owner then activated both; live student and guardian sign-ins, correct single-learner linkage, guardian result/finance denial and student staff-route redirection passed. See the activation entry in admissions-enrollment-verification.md. See admissions-enrollment-verification.md for exact evidence and limits. Current menu/workspace status is consolidated in website-erp-current-status.md; built public pages and completed ERP workflow acceptance remain distinct.

## 4 November 2026 — written assignment and publication

Chrome staging verified the isolated fictional learner's transfer history, initial submission, teacher return and feedback, learner revision, teacher score of 8/10, submission for review, and separate Principal approval and publication. The rehearsal exposed a missing learner resubmission form, which was fixed, deployed and retested. See [the teaching rehearsal](teaching-staging-rehearsal.md) for the revision and evidence.

The authenticated SQL/HTTP suite verifies student visibility after publication and guardian denial when results permission is disabled. The browser display checks for the already published staging grade remain open and can be combined with the next student and guardian sessions. Attachments, deadlines, attendance and year-end workflows remain separate.

## 5 November 2026 — guide lesson navigation and HR recruitment

Later on 5 November, the owner approved staff leave -> HR review -> separate leadership decision, and Finance manual payroll -> separate leadership approval -> Finance payment evidence. Both journeys passed on staging after backup, deployment and migration 115. GitHub run 42094264965 passed 380 tests without failures or skips. Private paid payslips, overlap/duplicate prevention and self-approval denial passed authenticated SQL tests. The external service readiness page was verified without provider traffic; live MTN acceptance remains open. See [leave/payroll evidence](leave-payroll-verification.md) for actors, fictional records, screenshots and limits.

The owner approved HR handling recruitment and interviews, leadership authorizing hiring, and HR completing onboarding. The connected recruitment workspace implements those stages with independent approval, history, revision checks, position limits and one-time employee creation. Revision 8d18608 passed all 374 GitHub tests without failures or skips. Deployment was confirmed Finished and migration 114 committed on staging after the fresh backup. The live fictional workflow passed through separate vacancy approval, intake, shortlisting, interview timing rejection/completion, HR recommendation, Principal authorization, offer/acceptance and onboarding into employee TEST-HR-20261105. Staff directory and retained history were verified, then test intake was closed. No invitation was sent. Direct guide selection and consecutive Previous lesson clicks also passed with automatic tour playback active. See [the HR report](hr-recruitment-verification.md) for evidence and limits; leave/payroll and external personnel artifacts remain separate work. Production remains paused.

Guide controls now distinguish Previous lesson and Next lesson from Previous step and Next step. Direct lesson selection starts narration. The final navigation browser check passed as recorded in the HR report.

## 7 November 2026 — MTN safeguards and payroll policy preparation

The owner confirmed that MTN live approval has not been received and requested a payroll rules template for school approval. The editable template is complete; automated calculation rules remain unapproved and inactive. No tax or social-security rates were invented.

Revision `9b95c80` passed all 388 GitHub tests without failures or skips. After a successful fresh backup, the staging deployment finished and migrations 116/117 committed with an explicit staging-database guard. Durable SMS dispatch claims prevent automatic retries of uncertain attempts; Collections requires recorded production fee terms and retains them on each new intent. Mock-provider and real-SQL tests cover interrupted saves, consent changes, repeated claims and fee changes. Browser checks confirmed the new disclosure, MoMo sandbox state and disabled/incomplete MTN SMS. No real charge or SMS was initiated. See [the MTN acceptance record](mtn-live-acceptance.md) for exact deployment, backup and evidence details. Production remains paused; provider acceptance and whole-product acceptance remain separate outstanding gates.
