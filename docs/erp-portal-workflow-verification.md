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

Local full suite after these changes: 348 total, 347 passed, zero failed, one Linux-only PostgreSQL wrapper skipped on Windows. Type checking and frontend build passed. The new real-SQL school-journey suite passed all 11 checks, including its parent test.

Staging deployment evidence for the corrections will be recorded after CI and deployment complete. No schema migration is required for these route corrections. Production remains unchanged; draft PR #57 remains unmerged.

## Explicitly still open

- School approval of the proposed website text, official facts, policies and asset permissions. The owner confirmed these materials were not previously created; see `school-website-content-review.md` for prepared drafts and a factual checklist.
- Live student/guardian/teacher browser journeys with designated fictional test accounts and school acceptance. Existing live learner names and published marks were inspected without modification.
- Full admissions-to-enrollment, year-end reporting/correction/promotion, account invitation/recovery, encrypted document/photo/Digital ID, HR/leave/payroll, expenses, detailed reporting/export and inventory transfer rehearsals. Existing unit/mocked tests and workspace loads are not relabeled as end-to-end acceptance.
- Provider acceptance: Finance remains Partial for MTN MoMo; Communications remains Partial for MTN SMS. No live provider send/charge was attempted.
- Historical migration-ledger reconciliation, backup restore rehearsal, recovery/monitoring, cross-campus scope and whole-school rehearsal, followed by explicit owner release approval.

The full checklist stays in `whole-site-release-checklist.md`. This pass adds measured evidence and fixes; it does not declare the entire ERP or website finished.
