# Whole-site completion and release checklist

Updated: 2026-11-01. Scope: the public website, its main menus and submenus, staff ERP, student/guardian portals, and the workflows connecting them.

## Release decision

**PRODUCTION PAUSED by the school owner.** Completing or accepting a single module is not release authorization. Every launch workspace, public page and connected workflow must be complete, tested and accepted before a controlled release is proposed. Production deployment still requires explicit owner approval. Do not merge draft work or change production settings as part of this audit.

This is the current cross-product checklist. Earlier implementation reviews and rollout instructions are historical snapshots, not proof that today's completed workflows are missing. Reuse the existing implementation and reconcile evidence before building anything again.

## Private administrative access rule

The owner reaffirmed on 2026-10-31 that the public website must not advertise an ERP/staff login. Public menus, submenus, footers, forms and family login must not link to or render administrative sign-in. Student/guardian access is separate. Authorized administrative users use their separately distributed HTTPS staff entry and individual staff credentials; the server must enforce roles and permissions for all protected workspaces and requests.

Regression tests render every public school page, the homepage, public header and family sign-in and reject administrative login links/controls. Unused staff sign-in callbacks were removed from public components. Public page titles/descriptions now identify the school rather than advertising ERP functions.

An unpublished URL is not an access-control mechanism. The existing staff password form is still reachable if its path is known; current workspace access is protected by authentication and permissions. Do not describe it as a network-private entry. Before production, resolve the stronger private-entry/MFA/access-gateway requirement with the owner rather than assuming that hiding a link meets it. No staff role or network permission has been expanded by this change.

## Status rules

- **Built; verify**: implementation exists, but its current full workflow evidence needs reconciliation or a fresh staging check. This does not mean rebuild it.
- **Partial — external integration**: retain Finance and Communications labels. Track working local workflows separately from MTN-dependent acceptance.
- **Content pending**: route/page exists, but approved school facts or assets still need supplying or publication. Do not invent them.
- **Staging accepted**: named tests and owner acceptance exist for that scope; this is not whole-product approval.
- **Blocked / failed**: record the precise missing dependency or failing step and its impact.
- A successful page load, an Available badge or a passing unit test alone does not prove an end-to-end workflow.

## Public menus and submenus

Seven menu families, 37 submenu items and 36 unique destinations are present in the source. Student and Guardian links intentionally share /portal, where account roles control the experience. Home, the admissions form, account setup/reset and the three examination routes are additional review surfaces.

| Main menu | Submenu | Destination | Current evidence / next check |
|---|---|---|---|
| School Info | About Us | `/school/about-us` | Built; verify route, content and workflow |
| School Info | Mission & Values | `/school/mission-values` | Built; verify route, content and workflow |
| School Info | Faculty & Staff | `/school/faculty-staff` | Content pending; verify route and obtain approved school content |
| School Info | School Leadership | `/school/leadership` | Content pending; verify route and obtain approved school content |
| School Info | Principal's Message | `/school/principal-message` | Content pending; verify route and obtain approved school content |
| School Info | Records Requests | `/school/records-requests` | Built; verify route, content and workflow |
| School Info | School & Office Hours | `/school/school-hours` | Content pending; verify route and obtain approved school content |
| School Info | School Calendar | `/school/school-calendar` | Content pending; verify route and obtain approved school content |
| School Info | Careers | `/school/careers` | Content pending; verify route and obtain approved school content |
| School Info | Photo Albums | `/school/photo-albums` | Content pending; verify route and obtain approved school content |
| Enroll | Enrollment Process | `/school/enrollment-process` | Built; verify route, content and workflow |
| Enroll | Admission Requirements | `/school/admission-requirements` | Built; verify route, content and workflow |
| Enroll | Admissions & Fees | `/school/admissions-fees` | Built; verify route, content and workflow |
| Enroll | School Visit & Inquiries | `/school/school-visits` | Built; verify route, content and workflow |
| Academics | Academic Programs | `/school/academic-programs` | Built; verify route, content and workflow |
| Academics | Curriculum & Learning | `/school/curriculum` | Built; verify route, content and workflow |
| Academics | Assessment & Progress | `/school/assessment-progress` | Built; verify route, content and workflow |
| Academics | Learning Resources | `/school/learning-resources` | Built; verify route, content and workflow |
| Student Life | School Events | `/school/school-events` | Built; verify route, content and workflow |
| Student Life | Activities & Enrichment | `/school/activities` | Content pending; verify route and obtain approved school content |
| Student Life | Sports & Wellness | `/school/sports` | Built; verify route, content and workflow |
| Student Life | School Supplies | `/school/school-supplies` | Content pending; verify route and obtain approved school content |
| Student Life | School Uniform | `/school/school-uniform` | Built; verify route, content and workflow |
| Student Life | Student Achievements | `/school/achievements` | Built; verify route, content and workflow |
| Parents | Parent Resources | `/school/parent-resources` | Built; verify route, content and workflow |
| Parents | Parent Handbook | `/school/parent-handbook` | Content pending; verify route and obtain approved school content |
| Parents | Parent FAQs | `/school/parent-faq` | Built; verify route, content and workflow |
| Parents | Attendance & Absences | `/school/attendance-absence` | Built; verify route, content and workflow |
| Parents | Meals & School Services | `/school/school-services` | Content pending; verify route and obtain approved school content |
| Parents | Family Involvement | `/school/family-involvement` | Built; verify route, content and workflow |
| Contact | Contact Us | `/school/contact-us` | Built; verify route, content and workflow |
| Contact | Directions & Location | `/school/directions` | Built; verify route, content and workflow |
| Contact | Request Information | `/school/request-information` | Built; verify route, content and workflow |
| Quick Links | Apply Online | `/apply` | Built; verify role/permission and connected workflow |
| Quick Links | Student Portal | `/portal` | Built; verify role/permission and connected workflow |
| Quick Links | Guardian Portal | `/portal` | Built; verify role/permission and connected workflow |
| Quick Links | News & Events | `/school/news-events` | Built; verify route, content and workflow |

Content review includes official staff/leadership names and photos, principal message, school hours, approved handbook, uniform/supply lists, programs, activities, school services, vacancies and publication permissions. A responsible empty state must not be mistaken for finished content. Verify news/calendar publishing and unpublishing, event registration if exposed, admission guidance, FAQs, support routes, photos and documents.

## ERP and portal workspaces

| Workspace | Source evidence | Required end-to-end acceptance |
|---|---|---|
| Overview / role dashboards | Built; verify | Correct role menu, counts, quick links, no unauthorized data |
| School setup | Built; verify | School/campus, year/term/class/subject setup; dependent dropdowns; invalid/duplicate handling |
| Curriculum & timetable | Built; verify | Subjects, periods, rooms, teacher assignments, conflicts, staff/family views |
| People & accounts | Built; verify | Staff/guardian/student linking, invitations, activation, duplicate checks and scoped access |
| Teaching & learning | Built; verify | Class roll call, attendance corrections, materials, assignments, submission, marking and released grades |
| Year-end report cards | Built; verify | Grade completeness, review, publication, correction, promotion/honors school decisions and portal reports |
| Website requests | Staging verified; owner review | Enquiry, visit preference and records assistance to restricted staff queue; assignment, follow-up, resolution and preserved history verified; no automatic messaging, booking or document release |
| Admissions | Built; verify | Public application to Registrar, review, documents, school decision and enrollment without duplicate learner creation |
| Entrance examinations | Staging accepted | Guardian proof, eligibility, sitting, autosave/reload, manual/timeout submission, marking, separate approval, private release, corrections/history; see exam handoff |
| Student records | Built; verify | Enrollment, guardian relationships, documents/photos, changes/history, Digital ID approval and verification |
| Finance | **Partial — MTN MoMo** | Recheck existing fee/invoice/payment/receipt/allocation/reversal/statement/reconciliation flows; provider success/failure/timeout/duplicate callbacks must be proven before MTN completion |
| Expense approvals | Built; verify | Request, independent review, rejection/approval, posting and reporting; no self-approval |
| Staff & HR | Built; verify | Staff/contracts, attendance, leave, work review and payroll workflow without unapproved pay |
| Inventory & procurement | Built; verify | Requisition, approval, ordering, receiving, stock movements, balances and reports |
| Communications | **Partial — MTN SMS** | Notices, audience permissions, family messages and notifications; separately verify SMS configuration, consent, recipient selection, delivery/failure and provider behavior |
| School website content | Approved content and page/photo editor staging-verified | Draft, review/publish, public rendering and unpublish; public posts stay separate from private communications |
| Reports & EMIS | Built; verify | Filters, reconciliation to underlying records, access, exports and approved templates; export is not Ministry submission |
| User access | Built; verify | Role grants, invitations, suspension/recovery, session invalidation and audit; no public role selection |
| Guardian portal | Built; verify | Linked learners, timetable, released grades, attendance, materials, tuition/receipts, notices/messages and photo workflow |
| Student portal | Built; verify | Own classes/results/materials/assignments/fees/ID/messages/alerts; exclude other learners |
| Teacher portal | Built; verify | Assigned classes, attendance, materials, assignments and gradebook; exclude unassigned classes |

Finance and Communications are already built workspaces. Their Partial badges are retained for outstanding provider integration, not permission to replace working modules. MTN MoMo Collections and MTN SMS are separate adapters/configuration. Local adapter tests and a sandbox payment do not prove a live provider settlement or SMS delivery. Do not enable chargeable live tests or send to unapproved recipients during an audit.

## Connected workflow acceptance

For each flow record: actor/role, fictional record reference, starting condition, action, expected/actual result, receiving workspace, notification recipient, denial/error cases, evidence and owner acceptance.

1. Public admissions/options -> application receipt -> Registrar review -> exam/decision -> enrollment -> student/guardian account linkage.
2. Class/teacher/timetable setup -> class attendance and materials -> assignments/grades -> separate publication -> authorized family view.
3. Fee schedule -> invoice -> independently verified payment/provider confirmation -> allocation/receipt -> ledger/statement -> authorized family view.
4. School/public editorial draft -> leadership publication -> correct menu/calendar/news surface -> unpublish removes it; private notices remain private.
5. Guardian/student message -> correct staff audience -> authorized reply -> notification/read state; consent and delivery failures handled.
6. Stock request -> independent approval -> order/receiving -> stock ledger -> reports.
7. Staff leave/work/payroll or expense request -> required review -> authorized posting/reporting.
8. Record/photo/document -> authorization/review -> controlled download or ID issue -> privacy and correction/history.

## Cross-system release gates

- Desktop and mobile navigation: all seven menu families, every submenu/CTA, keyboard/Escape, focus, back/reload/direct links, empty/error states and signed-in public browsing.
- Accessibility: labels, keyboard, focus, readable contrast and usable small-screen layout; code checks alone are insufficient.
- Security/privacy: roles, tenant/record scope, CSRF/session expiry, sensitive downloads, public/private separation, audit and no secrets in client output.
- Providers: MTN MoMo, MTN SMS and email each have independently recorded readiness and end-to-end evidence.
- Content: school approves factual text, assets and publication permissions; illustrative staging imagery is not approved school photography.
- Operations: staging migration history reconciled, backup restore rehearsed, monitoring/rollback checked and production migration plan reviewed.
- Full fictional school-operation rehearsal across website and ERP, followed by owner acceptance of all launch workspaces.
- Explicit final production release approval. Until then: paused.

## Audit findings opened in this pass

- PUBLIC-001: **fixed and staging-verified** in 9347f4f: signed-in public browsing works; operations remain selected only at /staff or /portal.
- PUBLIC-002: **fixed and staging-verified** in 9347f4f: desktop/mobile/related links share /apply and /portal destinations.
- CONTENT-001: several rendered pages are approved-content placeholders. Obtain/publish school content rather than calling those pages complete.
- EVIDENCE-001: old review documents predate the built backend and portals. Use this checklist and current code/staging evidence; retain earlier reviews as history.

Next audit order: public navigation/routes/content -> public submissions/editorial to staff workflows -> school setup/academics -> staff and family journeys -> Finance/Communications integration completion -> remaining operations/reports -> cross-system rehearsal and recovery -> owner release review.

## First verification pass completed

See [the dated evidence report](whole-site-audit-2026-10-31.md): 37 public destinations,
seven mobile menu groups, desktop keyboard navigation, 15 administrator workspace
load checks, separate MTN readiness states, and one fictional public admission through
staff intake and review history. All 330 automated checks passed for the deployed code.
This is scoped evidence, not complete acceptance of every listed workflow. Public
content, all other process/role tests, MTN completion and release recovery gates remain.

The owner chose online forms plus staff follow-up for information enquiries, school visits and records requests. The implementation uses a private administrative Website requests queue; it adds no staff-login link to public pages. See [website-request workflow](website-request-workflow.md). Migration 111 and all three public review/confirm/receipt journeys are staging-verified. The administrative queue received each reference; assignment, waiting, resolution, filtering and preserved history passed. The scoped evidence and remaining production gates are recorded there; owner acceptance is still required.

Public publishing follow-up: existing staging-only news/event posts were published, verified on public news/calendar/homepage, then unpublished and verified removed. Drafts remained private. See the dated audit report for exact scope; content approvals and remaining role/media checks are still open.


## School content and ERP/portal follow-up

The owner confirmed that the missing school content has not yet been created. [The school content review pack](school-website-content-review.md) now provides draft About/Mission/Principal wording, a handbook outline, safe page introductions and a checklist for official names, hours, dates, fees, uniform/supplies, services and image permissions. These are drafts; no policy or photo consent was invented or treated as approved.

[ERP/portal workflow evidence](erp-portal-workflow-verification.md) now records an isolated real-SQL, authenticated HTTP rehearsal across setup, resources, assignment revision/review, independent grade approval/publication, attendance correction, student/guardian messaging, notification ownership, dual-currency family finance and independently approved procurement/receiving. Tests found and corrected assignment-review SQL, guardian-office privacy and procurement approval defects. Live role-browser, remaining modules, recovery and owner-acceptance gates remain explicit rather than inferred from test counts.

Live role follow-up: the existing guardian account loaded nine family workspaces and the student account loaded ten learner workspaces without submitting changes. The teacher sign-in exposed missing submission-review/message panels and an absent curriculum-reader view; these were corrected and checked on staging. See the ERP/portal evidence report for exact deployed revisions and remaining write/review acceptance.


## 1 November 2026: approved content and photo editor verified on staging

The owner's content approval is recorded, including the condition that school administration can update it. The homepage and all 34 menu pages now have editable draft/published snapshots. School Administrator/Principal management uses the existing public-content permission; public menus contain no staff-login entry. Missing official names, detailed policies, dates and schedules have not been invented.

- CI runs 41266219992 and 41300220578 passed. The editor's complete suite reports 356 tests passed, zero failed/skipped; type checking and build also passed. Real SQL/HTTP checks cover tenant/role denial, CSRF, concurrent-version rejection, private image/PDF access, publication/withdrawal, restored drafts and protected history. These are distinct from live browser evidence.
- Staging migration 112 completed with COMMIT against `redeemer_school_staging` only. Verified 35/35 initial public snapshots, forced row security on all three tables, no runtime DELETE and no superuser/RLS-bypass privilege. The pre-existing backup succeeded at 02:41:51 UTC. An additional fresh backup completed at 11:04:51 UTC (2.67 MB) before migration 113 corrected imported punctuation, preserving original snapshots and adding correction history. Migration 113 also committed successfully; the original 112 file was retained unchanged.
- Exact deployed application: `ee7c017b78050b781cbbea2efc4d61baccc4f654`, manual Coolify deployment `qd2qagzs5ben5dnlqirdc2f8`, successful 11:05:50 UTC deployment (new container started 11:06:16 UTC). Prior editor deployment `eghhitgub1vqusmmzdtdrrfi` also succeeded.
- Live School Administrator browser journey: select About Us; upload existing approved illustrative courtyard WebP with accurate accessibility description/caption and publication consent; save private version 3; confirm public version 2 still has no photo; review saved preview and explicitly confirm; publish version 4; verify public image, caption and original approved wording. Upload completed with the ordinary Windows picker; no browser-extension permission change was needed.
- Live checks confirmed the approved Principal message, Mission/Values and handbook contents outline. The homepage editor exposes school identity, address, phone numbers and content blocks. Detailed handbook policies still need school-specific completion when supplied; the published outline accurately directs families to the office.
- Evidence: `outputs/website-about-us-photo-published.jpg`, `outputs/website-staff-photo-upload-controls.jpg`, `outputs/website-admin-editable-contacts.jpg`, `outputs/website-editor-fresh-backup.jpg`, `outputs/website-editor-staging-migration.jpg`, `outputs/website-editor-staging-isolation.jpg` (workspace outputs directory, outside repository).

Production remains paused. PR 57 stays draft and unmerged. Finance/Communications keep their MTN-dependent Partial status. Remaining staff/portal journeys, recovery rehearsals and the stronger private staff-entry requirement retain their existing release gates; this content-editor completion is not whole-product acceptance.


## Current owner-facing status and admissions follow-up

See [current website/ERP status](website-erp-current-status.md) for all seven menu families and remaining workflows. The 1 November admissions pass added a fully isolated connected application/exam/enrollment/account-activation rehearsal, fixed two handoff defects and passed all 362 CI tests. A fictional live application completed public submission, Registrar review, administrator acceptance and Registrar enrollment with retained history. Approved student/guardian invitations returned success; live activation is pending. See [admissions evidence](admissions-enrollment-verification.md). Production remains paused; other academic/staff/provider/recovery gates remain open.
