# Current website and ERP completion status

Updated 5 November 2026. Production is paused. This summary distinguishes implementation, staging verification and school acceptance.

## Public navigation and content

All seven public menu families and their submenu destinations exist. The homepage and 34 menu pages use the school-managed editor. Public staff-login links are absent. Desktop/mobile navigation was rehearsed in the whole-site audit; the approved editorial pages and photo publication workflow were verified on staging on 1 November.

| Menu family | Working content/workspace | Workflow status |
|---|---|---|
| School Info | About, Mission, Faculty, Leadership, Principal, records, hours, calendar, careers, albums; page/photo/PDF editor | Editorial publication verified; records-request follow-up verified. Unspecified official names/hours/calendar details remain for school administration to supply. |
| Enroll | Process, requirements, fees, visits; public application and admissions workspace | Visit requests verified. Full isolated admissions/exam/enrollment/account-activation chain passed; live intake, review, enrollment, owner activation and correct student/guardian portal linkage verified. See admissions-enrollment-verification.md. |
| Academics | Programs, curriculum, assessment, resources; teacher/academic workspaces | Live written assignment passed through learner submission, revision, teacher scoring, separate Principal approval and publication. Final portal grade displays, attachments, attendance, timetable and year-end work have separate checks. |
| Student Life | Events, activities, sports, supplies, uniform, achievements; editorial publishing | Pages editable; news/event publication and withdrawal verified. No invented school schedules or service claims. |
| Parents | Resources, handbook, FAQs, attendance, services, involvement; family portals | Public content and handbook outline verified; portal read checks and isolated writes passed. Remaining live family workflows open. |
| Contact | Contact, location, request information; private follow-up queue | Three request types and staff assignment/waiting/resolution/history staging-verified. Visits require staff confirmation; records require identity checks. |
| Quick Links | Public news plus separate application/family entry points | News/calendar publishing verified; staff access remains separately distributed. |

## Staff and portal processes

Entrance examination workflow and staff layout have owner staging acceptance. Website content editing and request follow-up are staging-verified. Other staff/portal workspaces exist and have varying isolated-test/browser evidence, but the entire ERP is not marked complete.

The fictional Mathematics assignment is published at 8/10. The authenticated database tests confirm that the learner receives the published mark and a guardian without results permission receives no grades. Check the existing result in both staging portal views during the next relevant sign-ins. See [the teaching rehearsal](teaching-staging-rehearsal.md).

Still open:

- Academic and portal: assignment attachment/deadline cases, live timetable and roll call, year-end report cards and promotion, encrypted student documents/photo/Digital ID, recovery and device/session lifecycle. Test student and guardian invitation and activation are already verified.
- Staff and operations: HR recruitment through onboarding passed isolated authenticated SQL tests and the live staging rehearsal on 5 November. Migration 114 is applied. Leave request/review/independent decision/cancellation and manually entered payroll through independent approval and simulated payment recording also passed staging; migration 115 is applied. Automated statutory payroll, leave entitlements/accruals, paid-payroll corrections, expense review/posting, stock transfers/reporting, detailed Finance reconciliation/reversals, exports/EMIS and cross-campus scope remain open. See [HR verification](hr-recruitment-verification.md) and [leave/payroll evidence](leave-payroll-verification.md).
- Release readiness: stronger private staff entry, monitoring/rollback, migration ledger reconciliation and isolated backup restore rehearsal. School administration still needs to supply outstanding official facts and policies listed in the content review.
- Provider acceptance: Finance remains Partial for MTN MoMo and Communications remains Partial for MTN SMS.

See whole-site-release-checklist.md for the full workspace list and erp-portal-workflow-verification.md for dated evidence. Owner release approval follows completion and acceptance of launch workflows; no production deployment is authorized by this report.
