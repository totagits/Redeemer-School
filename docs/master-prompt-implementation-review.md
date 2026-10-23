# Master prompt implementation review

**Reviewed:** 2026-10-21  
**Product:** Redeemer's International Academy ERP  
**Purpose:** Trace the Liberia Private-School Operations Platform master prompt to the current repository, identify what is usable today, and document the database foundation and delivery order.

## Executive finding

The repository is still a front-end prototype with an Express server and a PostgreSQL migration foundation. It is **not** a complete ERP or safe for real student, staff, or financial operations yet. The screens and several business-logic helpers cover portions of the requested workflows, but the screens do not call database-backed API routes. The server currently exposes live/readiness health checks only. There is no production login flow, server-enforced authorization, guardian portal, or operational API.

Migration `001_school_operations_foundation.sql` defines the initial tenant, school, user/session, academic, student, teacher, classroom attendance, assessment, teacher work/time, compensation, and audit tables. Prior staging work reported that migration `001` was applied successfully and that PostgreSQL readiness was healthy. This local checkout does not contain a `DATABASE_URL`, so I have not verified staging directly in this review.

Migration `002_school_platform_domains.sql` adds the broader domain structures described below. It is a **new, unexecuted migration** in this checkout. Do not treat its presence in Git as proof that it has run on staging. Once deployed, run `npm run db:migrate` against the staging database after confirming a current backup and reviewing the migration log.

## Requirement traceability

Status meanings: **Foundation** means a database structure or utility exists; **Prototype** means UI or in-memory logic exists without persistent API workflow; **Missing** means the workflow is not implemented; **Needs verification** means an external template, school policy, or provider specification is required.

| Master prompt area | Current status | Evidence / work remaining |
|---|---|---|
| Product scope and modular architecture | Prototype | Existing React app, Express server, PostgreSQL. The right next step is a modular monolith with domain APIs, not microservices. No complete product brief/workflow map previously existed; this review supplies the implementation baseline. |
| Tenant and campus setup | Foundation | `schools` and `campuses` in migration 001; school/campus details and settings in 002; tenant RLS policies added in 002. Authentication middleware must set a verified school context on every DB transaction before operational queries are enabled. |
| Roles and permissions | Foundation only | 002 adds permission catalog, school roles, role-to-permission mappings, user role assignments, and seeds roles from legacy account roles. Server-side permission checks, campus scope checks, invite/reset/MFA/session lifecycle, and platform-operator separation remain to implement. UI role selection is not security. |
| Admissions and enrollment | Prototype + foundation | Existing admissions UI has demo behavior. 002 adds application lifecycle, guardian application contacts, decision events, enrollment history, and student document metadata. No admissions API, safe file store, dedupe review UI, or committed import exists. |
| Student profile and records | Prototype + foundation | 001 has learner identity/class enrollment; 002 adds learner external IDs, guardian links/consent, lifecycle, and document metadata. Sensitive-field restrictions, field-level history, real guardian access, retention/deletion workflows, and API remain missing. |
| Academic years, classes, levels, subjects, timetable | Partial foundation | Existing core tables plus 002 configurable education/grade levels, terms, holidays, rooms, periods, timetable slots, and substitutions. Conflict checking, setup workflow, timetable UI/API, and school configuration screens remain. |
| Teacher assignment and classroom workspace | Foundation only | 001 teacher profiles and teacher-subject-class assignments; 002 timetable/term structures. Assignment scoping is not enforced in a server API or connected teacher workspace. |
| Teacher roll call / student attendance | Prototype + foundation | Existing screen/logic is demo-only. 001 has sessions/attendance; 002 adds codes, correction history, idempotency, offline batch/conflict records. No authenticated API, device queue/sync implementation, parent alert provider, or workflow tests. |
| Teaching materials | Foundation only | 001 metadata table supports lesson plans, handouts, presentations, homework, links, and storage keys. No secure file storage, access-controlled download, or teacher workflow. |
| Quizzes, tests, exams, assignments, grades | Prototype + foundation | Existing grading helpers and UI are incomplete. 001 has assessments/scores and policy defaults; 002 adds assessment components, grading scales, moderation/publication batches, and report-card snapshots. Missing persistent entry, weight/range validation, moderation/approval/lock/reopen/publish APIs, and report-card rendering. The requested 1–60 fail / 70–100 pass leaves 61–69 unresolved; the schema defaults that range to `REVIEW_REQUIRED` pending school approval. Zero also needs an explicit policy. |
| Fees, USD/LRD balances and payment reconciliation | Prototype + foundation | Existing finance screens are in-memory. 002 adds fee schedules, invoices, concessions, separate currency fields, receipts, allocations, reversals, provider intents/events, and cashier close-out. Missing invoice/payment APIs, allocation/ledger transactions, statement/aging/reconciliation workflows, approval enforcement, and tests. USD and LRD must never be silently combined. |
| MTN MoMo | Optional adapter boundary | 002 adds provider profile, payment intent, provider event idempotency, and a payment channel. No MTN request-to-pay/webhook/polling implementation exists. We can use your API access when implementing this adapter. The exact product, Liberia environment, callbacks, credentials, and sandbox/production approval must be verified from your MTN documentation; do not paste secrets into chat or commit them. Configure secrets in Coolify. Confirm a payment with a trusted provider response before posting it to the school ledger. |
| Parent and learner portal | Missing | Guardian contact metadata exists, but there is no secure portal, linked-learner authorization, released-results view, balance/receipt view, or self-service account workflow. |
| Parent communications | Foundation only | 002 has consent/preferences, templates, announcements, and delivery records. No email/SMS/WhatsApp provider, delivery worker, recipient privacy checks, or approved sending flow. |
| Staff, teacher workload, attendance and evaluation | Prototype + foundation | 001 supports teacher work assignments, review, time entries, and compensation contracts; 002 adds staff records/contracts, clock sessions, leave, payroll snapshots. No persistence/API. Logged time must be reviewed and compared with an approved contract; evaluation does not by itself authorize pay. Payroll rates/deductions remain school-configured and locally validated, not hard-coded statutory advice. |
| Finance / general ledger | Partial foundation | 002 adds accounts, journal entries and lines with currency-aware amounts. Posting workflow, balanced-entry transaction validation, chart-of-accounts setup, and reconciliation must be implemented before accounting use. |
| Inventory and procurement | Prototype + foundation | Existing inventory screen and logic are in-memory. 002 adds locations, items, stock movement ledger, requisitions, purchase orders, and receiving quantities. Missing API workflows, approval/receiving rules, transfer pair validation, stock-on-hand query, and tests. |
| Reports and dashboards | Prototype | Current dashboard/exports use local data. APIs and tenant/permission-aware SQL reports are missing. Definitions, filters, freshness, and reconciliations must be tested before reporting real totals. |
| MoE EMIS compatibility | File-based foundation; unverified | 002 stores school EMIS/external IDs, versioned templates/mappings, import/export runs, row results, and acknowledgments. No verified official production connector/template or working exporter/importer is present. Require a current Ministry-approved file/template and confirm authorization. Label downloads as prepared/exported, never submitted, unless an approved channel confirms receipt. |
| CSV/XLSX onboarding | Foundation only | 002 has import batch/row, validation, duplicate-review, and commit tracking. Upload validation, preview/mapping UI, rollback/transaction logic, templates, and tests remain. |
| Security, privacy and audit | Partial foundation | 001 audit table; 002 adds audit request/campus metadata and tenant RLS. Login, strong session lifecycle, server authorization, MFA option, rate limiting, object-level scope, secure file handling, audit writer/immutability, backup/restore exercise, monitoring, incident process, and threat review remain. A database owner/superuser connection must not serve normal app queries. |
| PWA, low-bandwidth, offline, accessibility, localization, in-app help | Partial / missing | Responsive screens exist, but no completed offline queue, sync, PWA/service-worker checks, accessibility audit, translation catalogue, help/onboarding, or support process. |
| Testing and release readiness | Partial | Unit tests and build/type-check scripts exist. No database migration integration test, API auth/tenant-isolation suite, workflow tests, restore drill, or staging acceptance suite. |

## Database structure and interoperability

The schema is organized as a modular monolith around shared tenant and identity keys. Each school-owned row includes `school_id`; cross-domain foreign keys include the same school identifier so, for example, an assessment cannot point to another school's student. Migration 002 also enables and forces PostgreSQL row-level security (RLS) for school-owned tables. RLS is deny-by-default until the authenticated API sets `app.current_school_id` inside each transaction.

| Domain | Main structures |
|---|---|
| Tenant / configuration / permissions | `schools`, `campuses`, `school_settings`, `permissions`, `school_roles`, `role_permissions`, `user_role_assignments` |
| Academic calendar and structure | `academic_years`, `academic_terms`, `education_levels`, `grade_levels`, `class_groups`, `subjects`, `rooms`, `timetable_periods`, `timetable_slots`, `teacher_substitutions` |
| Learner lifecycle | `students`, `guardians`, `student_guardians`, `admission_applications`, `admission_events`, `student_enrollment_history`, `student_documents` |
| Teaching and assessment | `teacher_profiles`, `teacher_subject_assignments`, `class_sessions`, `teaching_materials`, `assessments`, `assessment_scores`, `grading_scales`, `assessment_components`, `grade_publication_batches`, `report_cards` |
| Attendance and offline capture | `student_attendance`, `attendance_codes`, `attendance_correction_history`, `offline_sync_batches`, `offline_sync_conflicts` |
| Fees and collections | `fee_items`, `fee_schedules`, `fee_invoices`, `learner_concessions`, `payments`, `payment_allocations`, `payment_reversals`, `payment_intents`, `payment_provider_events`, `cashier_sessions` |
| Staff / HR / pay | `staff_records`, `staff_contracts`, `staff_leave_requests`, `staff_attendance_sessions`, `teacher_work_assignments`, `staff_time_entries`, `compensation_contracts`, `payroll_runs`, `payroll_run_lines` |
| Communications / imports / EMIS | `communication_preferences`, `message_templates`, `announcements`, `notification_deliveries`, `data_import_batches`, `data_import_rows`, `emis_templates`, `emis_exchange_runs`, `emis_exchange_rows` |
| Ledger / inventory / procurement | `ledger_accounts`, `journal_entries`, `journal_lines`, `inventory_locations`, `inventory_items`, `stock_movements`, `procurement_requests`, `purchase_orders`, `purchase_order_lines` |
| Audit / authentication | `user_accounts`, `auth_sessions`, `audit_events` |

**Interoperability rules:** UUID internal IDs remain distinct from Ministry-issued external IDs. Imports must preview and validate before commit. EMIS mappings are versioned and snapshotted for reproducible files. Payment providers use an adapter and idempotency keys; raw payment secrets do not belong in PostgreSQL or Git. Documents are represented by private object-storage keys, not public URLs or Base64 in React state. Currency is explicit on each financial item.

## Role and permission baseline

Migration 002 seeds these standard school roles and a starting permission mapping for existing school accounts: school administrator, campus administrator, principal, registrar, teacher, department head, finance, HR manager, inventory manager, parent, student, and auditor. This mapping is a starting point, not a completed access-control system. It must be reviewed with Redeemer and enforced in every API operation. Parent/student permissions must be constrained to linked records even if the role has a general `students.read` permission. Campus and teacher assignment scope must be checked in addition to role permissions.

Platform-operator authorization is not a school role. It needs a separate privileged operational identity path, with explicit auditing and minimal data access.

## MTN MoMo integration plan

The selected product is MTN MoMo **Collections API**. The school has confirmed a **2.5% transaction fee**. Migration 009 stores the fee amount and rate on the payment; the student's invoice is credited with the gross amount, while finance sees the fee and calculated net settlement separately.

The request and reconciliation flow now works as follows:

1. Finance staff selects an outstanding LRD invoice, amount, and payer's Liberia mobile number.
2. The server creates a payment intent before calling MTN, then sends a Request to Pay using the server-side credentials.
3. MTN's asynchronous acceptance is shown as pending; the school app does not post a payment based on HTTP 202 alone.
4. Finance staff checks status. Only a provider-confirmed success with matching amount, currency, and external reference posts and allocates the payment atomically, with a receipt and audit event.
5. A confirmed transfer whose data does not match is flagged for review without automatic ledger posting. Failed/expired/cancelled results remain visible in reconciliation.

The code uses sandbox by default and keeps MTN credentials server-side in Coolify. Set `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, and `MTN_MOMO_SUBSCRIPTION_KEY`; configure `MTN_MOMO_ENVIRONMENT=SANDBOX` for initial tests. Do not switch to production until MTN has enabled the account and a school finance owner has passed sandbox acceptance testing. Never paste or commit the credentials. Status polling is used; callbacks are not configured.

Apply migration `009_mtn_collection_fees.sql` to the staging database before deploying this release, because the finance API reads the new provider-fee columns. After the migration, deploy the application and configure the sandbox secrets in Coolify. The workspace does not have access to the remote staging database, so SQL migration execution and a live MTN sandbox request still need to be verified in staging.

## Delivery backlog

### Foundation already present / being added

- Migration 001 base tables, PostgreSQL migration runner, Express server, health checks, and frontend build/test setup.
- Migration 002 domain tables, explicit currencies, audit extensions, versioned EMIS/import records, MTN MoMo adapter boundary, and tenant RLS policies.
- This requirement traceability and rollout document.

### Next release gates (in order)

1. Apply migration 002 to **staging only**, after a current database backup; inspect the migration output and verify tenant RLS and role seed counts. Do not run it against production as part of a code deploy.
2. Implement login/session security and transaction-scoped tenant/campus context; add API permission and object-scope middleware. Do not expose CRUD before this gate.
3. Build one complete academic vertical slice: academic setup → teacher/class/subject assignment → class session → attendance roll call → assessment and score entry → moderation/approval → publication. Add database-backed UI and tenant-isolation tests.
4. Build remaining fee schedule and reversal workflows; run the MTN sandbox finance acceptance test and add provider reconciliation monitoring.
5. Add secure private file storage, imports, guardian accounts/portal, staff/HR, inventory/procurement, accounting and communications workflow-by-workflow.
6. Implement EMIS export/import against an approved template; retain preview, row errors, template/mapping version, and audit history. Do not claim live MoE submission without an approved integration and receipt.
7. Complete backups/restores, monitoring, security review, accessibility and low-bandwidth checks, training, and a limited school pilot before production use.

## Pilot and acceptance checks

Use synthetic student and payment data in staging. Before a real pilot, have the school name a principal, registrar, teacher, finance owner, and guardian tester. Walk through admissions, enrollment, a school day of roll call, a scored assessment and published result, one LRD and one USD invoice/payment, MoMo sandbox reconciliation, a parent notification, a staff time review, and an EMIS file preview. Verify that each role sees only authorized records, a user from a second test school cannot read or write the first school's rows, duplicate requests cannot double-charge or double-post, and an operator can restore a backup. Record issues and sign off before real records are loaded.

## Known limitations of this review

- Migration 002 has not been applied or executed against a PostgreSQL server in this workspace; the local environment has no `DATABASE_URL` or `psql` executable. Static review and repository build/tests can verify code shape but cannot prove SQL runtime success.
- The reported success of migration 001 and staging database readiness comes from the prior staging work, not a fresh live connection in this review.
- Ministry-approved report templates and direct integration credentials/specifications were not supplied here; EMIS remains file-first and unverified.
- MTN MoMo Collections request/status behavior is covered by mocked adapter and route tests. A live Liberia sandbox account, response, settlement report, and production approval have not been verified from this workspace.
- No module should be advertised as production-ready until its API, authorization, persistent UI workflow, audit behavior, and tests are implemented and validated.
