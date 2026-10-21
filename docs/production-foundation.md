# Production foundation: staged implementation

## Scope of this first milestone

This milestone adds the PostgreSQL schema and migration runner for school tenancy, campus structure, accounts and sessions, academic years, students and classes, teacher subject assignments, lesson materials, attendance, assessments and grade moderation, teacher task evaluation, staff time entries, compensation contracts, and an audit trail. It also adds an Express production server with live and database-readiness health endpoints.

It does **not** convert the current React screens from sample/in-memory data to database-backed operations, complete the sign-in flow, establish file storage, or make the product ready for real school records. Those require subsequent, separately tested milestones.

## Teacher workflow requirements

- Give each teacher an account and staff profile, then assign subjects, class groups, campus, and academic year.
- Teachers take a roll call for each scheduled class session. Student attendance and staff clock-in/out are separate records.
- Teachers create lesson plans and teaching materials, then create quizzes, tests, exams, assignments, and projects for their assigned classes.
- Scores are entered against published assessment definitions, moderated, and then published to students or guardians.
- Keep the school's grading thresholds configurable. The requested 1–60 fail and 70–100 pass bands leave 61–69 undefined; the initial schema marks that gap as `REVIEW_REQUIRED` rather than silently assigning a result. The school must approve how to handle that range before publishing a final grade policy. A score of zero also needs an explicit school rule.
- Teachers can receive work assignments with a rubric, submit evidence, and receive a review with feedback. Time records provide an auditable record of clock-in/out and time spent on assigned tasks; supervisors can correct entries with a reason.
- A logged hour is not automatically a payable hour. Compensation must follow an approved contract basis: monthly salary, approved hourly time, or per-assignment rate. Pay rates, currencies, attendance adjustments, deductions, and statutory payroll rules must be configured and validated by the school before payroll calculation. Evaluation and pay approval remain separate steps.

## Data isolation and deployment

Every operational row is keyed by `school_id`; relationships use composite foreign keys so a row cannot reference another school's student, teacher, class, or user. Application API queries must still apply the authenticated user's school scope on every request. Schema constraints complement server-side authorization and do not replace it.

The migration runner applies ordered SQL files transactionally and records applied versions. Back up the database before migrations in production. Configure a separate PostgreSQL database and `DATABASE_URL` per development, staging, and production environment. Do not copy real student records into development or staging without authorization and a data-protection plan.

## Rollout order after this milestone

1. Provision an isolated staging PostgreSQL database and run the migration against it.
2. Implement server-side login, session lifecycle, school-scoped authorization, and audit middleware.
3. Integrate one vertical workflow end to end (teacher assignments, class roll call, assessments, moderation, publication) and test tenant isolation.
4. Migrate admissions, finance, HR, and inventory one workflow at a time; remove demo defaults before accepting real records.
5. Add secure document storage, backups/restore checks, offline attendance sync, EMIS mappings based on Ministry-approved templates, and production monitoring.
