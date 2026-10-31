# Whole-site completion and release checklist

Updated: 2026-10-31. Scope: the public website, its main menus and submenus, staff ERP, student/guardian portals, and the workflows connecting them.

## Release decision

**PRODUCTION PAUSED by the school owner.** Completing or accepting a single module is not release authorization. Every launch workspace, public page and connected workflow must be complete, tested and accepted before a controlled release is proposed. Production deployment still requires explicit owner approval. Do not merge draft work or change production settings as part of this audit.

This is the current cross-product checklist. Earlier implementation reviews and rollout instructions are historical snapshots, not proof that today's completed workflows are missing. Reuse the existing implementation and reconcile evidence before building anything again.

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
| Admissions | Built; verify | Public application to Registrar, review, documents, school decision and enrollment without duplicate learner creation |
| Entrance examinations | Staging accepted | Guardian proof, eligibility, sitting, autosave/reload, manual/timeout submission, marking, separate approval, private release, corrections/history; see exam handoff |
| Student records | Built; verify | Enrollment, guardian relationships, documents/photos, changes/history, Digital ID approval and verification |
| Finance | **Partial — MTN MoMo** | Recheck existing fee/invoice/payment/receipt/allocation/reversal/statement/reconciliation flows; provider success/failure/timeout/duplicate callbacks must be proven before MTN completion |
| Expense approvals | Built; verify | Request, independent review, rejection/approval, posting and reporting; no self-approval |
| Staff & HR | Built; verify | Staff/contracts, attendance, leave, work review and payroll workflow without unapproved pay |
| Inventory & procurement | Built; verify | Requisition, approval, ordering, receiving, stock movements, balances and reports |
| Communications | **Partial — MTN SMS** | Notices, audience permissions, family messages and notifications; separately verify SMS configuration, consent, recipient selection, delivery/failure and provider behavior |
| School website content | Built; verify | Draft, review/publish, public rendering and unpublish; public posts stay separate from private communications |
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
