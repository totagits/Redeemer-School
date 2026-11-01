# Whole-site audit: first staging verification pass

Date: 2026-10-31. Tested/deployed code: `9347f4f1dffa1c5a221ef8fe32b3b84c09822a74`.
Staging deployment `qq2zmi0vs9phmkf3it1hptne` succeeded at 19:30:09 UTC.
[CI run 41234436498](https://github.com/totagits/Redeemer-School/actions/runs/41234436498) passed all 330 tests, including PostgreSQL 18 contention checks. Type checking and build passed. The new rendered navigation tests cover the 37 desktop submenu destinations and the related-page application/portal links.

Production remains paused. No production settings, migrations or data were changed.
No merge was performed. Staging remains manual deployment and pinned to the tested code.
This audit builds on the accepted entrance examination work, rather than rebuilding it.

## Findings fixed and verified

- PUBLIC-001 fixed: a signed-in School Administrator can open the homepage, school pages and public admissions form. Only /staff and /portal select the authenticated workspace. The family/staff role redirect stays in place; no authorization or data permission was expanded.
- PUBLIC-002 fixed: desktop, mobile and related-page navigation share canonical destinations: Apply Online -> /apply; Student Portal / Guardian Portal -> /portal. The News & Events sidebar now uses the correct links.
- Desktop keyboard check: School Info opened with Enter and closed with Escape.
- All seven mobile menu families expanded with Enter at a measured 400 x 656 viewport. All 37 submenu links were exposed with their canonical destinations. Apply Online was followed to the real admissions form. Homepage and form had no horizontal document overflow at that width. This is responsive browser emulation, not a physical-device or full accessibility certification. Normal desktop sizing was restored afterward.

## Public destinations

All 37 submenu entries were opened and their headings checked in staging. No Page not found result or visible service-unavailable message was observed in this pass. The check used an existing School Administrator session. Student/Guardian Portal links correctly returned that account to its staff overview; this is not a replacement for separate Student/Guardian role testing or anonymous privacy tests.

Nine pages displayed explicit awaiting-content wording under the audit's narrow text check. This is a minimum list, not approval of the remaining page content. Several other pages use generic office-contact guidance or illustrative images. School-approved facts, media and policy documents remain a release gate.

| Main menu | Entry | Destination | Observed heading | Explicit content placeholder |
|---|---|---|---|---|
| School Info | About Us | `/school/about-us` | About Redeemer’s International Academy | Not detected; content approval still required |
| School Info | Mission & Values | `/school/mission-values` | Our Mission & Values | Not detected; content approval still required |
| School Info | Faculty & Staff | `/school/faculty-staff` | Faculty & Staff | Yes |
| School Info | School Leadership | `/school/leadership` | School Leadership | Yes |
| School Info | Principal's Message | `/school/principal-message` | A Message from the Principal | Yes |
| School Info | Records Requests | `/school/records-requests` | Student Records Requests | Not detected; content approval still required |
| School Info | School & Office Hours | `/school/school-hours` | School & Office Hours | Yes |
| School Info | School Calendar | `/school/school-calendar` | School Calendar | Yes |
| School Info | Careers | `/school/careers` | Careers at Redeemer | Yes |
| School Info | Photo Albums | `/school/photo-albums` | School Photo Albums | Yes |
| Enroll | Enrollment Process | `/school/enrollment-process` | Enrollment Process | Not detected; content approval still required |
| Enroll | Admission Requirements | `/school/admission-requirements` | Admission Requirements | Not detected; content approval still required |
| Enroll | Admissions & Fees | `/school/admissions-fees` | Admissions & Fees | Not detected; content approval still required |
| Enroll | School Visit & Inquiries | `/school/school-visits` | School Visits & Inquiries | Not detected; content approval still required |
| Academics | Academic Programs | `/school/academic-programs` | Academic Programs | Not detected; content approval still required |
| Academics | Curriculum & Learning | `/school/curriculum` | Curriculum & Learning | Not detected; content approval still required |
| Academics | Assessment & Progress | `/school/assessment-progress` | Assessment & Progress | Not detected; content approval still required |
| Academics | Learning Resources | `/school/learning-resources` | Learning Resources | Not detected; content approval still required |
| Student Life | School Events | `/school/school-events` | School Events | Not detected; content approval still required |
| Student Life | Activities & Enrichment | `/school/activities` | Activities & Enrichment | Yes |
| Student Life | Sports & Wellness | `/school/sports` | Sports & Wellness | Not detected; content approval still required |
| Student Life | School Supplies | `/school/school-supplies` | School Supplies | Not detected; content approval still required |
| Student Life | School Uniform | `/school/school-uniform` | School Uniform | Not detected; content approval still required |
| Student Life | Student Achievements | `/school/achievements` | Student Achievements | Not detected; content approval still required |
| Parents | Parent Resources | `/school/parent-resources` | Resources for Parents & Guardians | Not detected; content approval still required |
| Parents | Parent Handbook | `/school/parent-handbook` | Parent Handbook | Yes |
| Parents | Parent FAQs | `/school/parent-faq` | Parent Questions & Answers | Not detected; content approval still required |
| Parents | Attendance & Absences | `/school/attendance-absence` | Attendance & Absences | Not detected; content approval still required |
| Parents | Meals & School Services | `/school/school-services` | Meals & School Services | Not detected; content approval still required |
| Parents | Family Involvement | `/school/family-involvement` | Family Involvement | Not detected; content approval still required |
| Contact | Contact Us | `/school/contact-us` | Contact the School | Not detected; content approval still required |
| Contact | Directions & Location | `/school/directions` | Directions & Location | Not detected; content approval still required |
| Contact | Request Information | `/school/request-information` | Request Information | Not detected; content approval still required |
| Quick Links | Apply Online | `/apply` | Start an application · Redeemer's International Academy | Not detected; content approval still required |
| Quick Links | Student Portal | `/portal` | Overview | Not detected; content approval still required |
| Quick Links | Guardian Portal | `/portal` | Overview | Not detected; content approval still required |
| Quick Links | News & Events | `/school/news-events` | News & School Events | Not detected; content approval still required |

## Existing ERP workspace load checks

The 15 listed School Administrator workspaces opened without a visible error alert or generic unfinished-workflow notice. This confirms the existing screens are present, not that each process is complete or accepted. No business records were changed during the workspace-load pass. Teacher, Registrar, Finance, Principal, Guardian, Student and denial-path journeys still need their own current evidence reconciliation and tests.

| Workspace | Load check | End-to-end status |
|---|---|---|
| School setup | Opened; no visible error alert | Workflow verification remains on master checklist |
| Curriculum & timetable | Opened; no visible error alert | Workflow verification remains on master checklist |
| People & accounts | Opened; no visible error alert | Workflow verification remains on master checklist |
| Teaching & learning | Opened; no visible error alert | Workflow verification remains on master checklist |
| Year-end report cards | Opened; no visible error alert | Workflow verification remains on master checklist |
| Admissions | Opened; no visible error alert | Workflow verification remains on master checklist |
| Student records | Opened; no visible error alert | Workflow verification remains on master checklist |
| Finance Partial | Opened; no visible error alert | Partial: MTN MoMo integration |
| Expense approvals | Opened; no visible error alert | Workflow verification remains on master checklist |
| Staff & HR | Opened; no visible error alert | Workflow verification remains on master checklist |
| Inventory & procurement | Opened; no visible error alert | Workflow verification remains on master checklist |
| Communications Partial | Opened; no visible error alert | Partial: MTN SMS integration |
| School website content | Opened; no visible error alert | Workflow verification remains on master checklist |
| Reports & EMIS | Opened; no visible error alert | Workflow verification remains on master checklist |
| User access | Opened; no visible error alert | Workflow verification remains on master checklist |

Provider readiness was separately inspected after the forms loaded:
- Finance: **MTN MoMo Sandbox**. The existing sandbox controls explain EUR isolation from LRD/USD school ledgers. No credential test, payment request or posting was triggered in this pass. Keep Partial until provider workflows and release requirements pass.
- Communications: **MTN SMS V2 — Not ready**. Sending is disabled; the page says provider setup is required. Historical queued deliveries exist; none was dispatched or modified. Keep Partial. Do not enable live sending without checking intended recipients/consent and the existing queue.

## Public admissions -> staff intake: passed scoped workflow

Fictional test record **RIA-2026-68771FB3**, applicant **TEST Public Audit 20261031**, guardian **TEST Audit Guardian**, explicitly marked STAGING TEST ONLY. The contact uses the reserved undeliverable example.invalid domain; no real person was contacted.

1. Opened the real /apply form, entered fictional names/relationship/contact and test-only notes, then used Review application.
2. The review screen displayed the correct details and said nothing had been submitted yet.
3. Confirm and submit returned Application received and the unique reference above.
4. The same reference/applicant/guardian appeared in staff Admissions as RECEIVED, with the public intake event retained.
5. Staff changed only this fictional record to UNDER_REVIEW. History then showed two events: APPLICATION RECEIVED by Public admissions form (14:47:50 America/Chicago) and STATUS UNDER REVIEW by the signed-in administrator (14:48:28 America/Chicago).
6. No admission decision, enrollment, payment, document upload, verification send or outbound notification was performed. Those later steps are separate workflow gates; the accepted entrance-exam tests remain documented elsewhere.

## Outstanding work surfaced

- School-approved public content and assets, rather than placeholders or illustrative photographs.
- Resolved by the owner: add online forms and staff follow-up for enquiries, visits and records. These are now built and staging-verified; see the website-request workflow evidence.
- Anonymous browsing, cross-role portal journeys and all other connected processes remain to verify systematically. Publishing/unpublishing has now been rechecked as described below.
- Finance MoMo and Communications SMS remain distinct Partial integration gates.
- Backup restore rehearsal, historical migration reconciliation, cross-workspace school-operation rehearsal and final owner release approval remain mandatory.

The detailed continuing scope is [the whole-site release checklist](whole-site-release-checklist.md). This pass does not mark the whole website/ERP complete.


## Follow-up pass: request forms and publishing

The owner approved three online request forms and staff follow-up. See [the detailed workflow and evidence](website-request-workflow.md). Migration 111 was applied only to staging after a fresh verified backup. The corrected staging revision `c451d20619485b46f6b7e60d01c063c0c2b7ce11` passed all 337 CI tests plus type checking and build. Public receipt, all three receiving queue records, enquiry assignment/waiting/resolution, status filtering, preserved original/history, records verification guidance and visit-date handling passed live UI checks.

Public news/event publishing was rechecked on this revision with the existing clearly marked staging-only posts, without replacing their text, photos or dates:

1. The staff library held an unpublished news post, an unpublished calendar event with a saved featured image, and a separate draft calendar event. The public news page showed no published updates.
2. Published only `STAGING TEST – Redeemer Website Publishing`. The news page displayed its exact summary; expanding Read full update displayed the complete fictional test body.
3. Published only the existing illustrated `STAGING TEST – Redeemer School Calendar` event. The calendar displayed it with its saved date/time (30 October 2026, 10:00 am Liberia), summary and featured image. The separate calendar draft remained DRAFT in the staff library.
4. The homepage displayed both the published news and published event. Its public navigation continued to offer family access without a staff-login link.
5. Unpublished both test posts. The staff library retained them as UNPUBLISHED. Reloaded homepage, calendar and news page showed their empty published-content states, with no test posts. The separate draft was unchanged.
6. No private class notices, guardian messages, records, financial information or learner details were copied into the public news workflow. No new content or images were uploaded in this pass. Publication used the existing School Administrator account; this is not evidence of independent editorial approval or of all other role restrictions.

Evidence images in the task outputs: `public-news-published-verified.jpg`, `public-news-unpublished-verified.jpg`, and `website-request-follow-up-history.jpg`. These checks do not approve existing test imagery as production school media or turn content placeholders into approved school content. School-provided content and owner acceptance remain required. Production remains paused; PR #57 stays draft and unmerged.
