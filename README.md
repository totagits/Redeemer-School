# Redeemer's International Academy ERP

An evolving private-school operations platform for Redeemer's International Academy. The current application includes a React prototype, an Express server, PostgreSQL migrations, and domain logic. Several screens still use demo/in-memory data; this repository is not yet a production ERP.

## Current status

- `npm run build`, `npm run lint`, and `npm test` validate the current frontend and logic helpers.
- `npm start` serves the built frontend and API health routes.
- `npm run db:migrate` applies ordered PostgreSQL migrations using `DATABASE_URL`.
- Migration `001_school_operations_foundation.sql` is the original database foundation.
- Migration `002_school_platform_domains.sql` adds domain tables for admissions, academic operations, guardians, fees/payments, staff/HR, communications, data imports, EMIS exchange, ledger, inventory, procurement, and tenant row-level security.
- Migration 002 must be tested on staging before use. The existing screens are not yet wired to these database tables. Do not enter real learner, staff, or finance records until authentication, authorization, APIs, audit, backup, and corresponding workflows are ready.

See [the implementation review](docs/master-prompt-implementation-review.md) and [production foundation notes](docs/production-foundation.md) for requirements traceability, data-model boundaries, MTN MoMo plan, and remaining work.

## Local development

Requirements: Node.js compatible with the Vite version in `package.json`, npm, and PostgreSQL for migration/API work.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a **development-only** PostgreSQL database. Do not reuse production credentials or commit `.env`.
3. Apply database migrations: `npm run db:migrate`
4. Start the frontend dev server: `npm run dev`
5. Run verification: `npm test`, `npm run lint`, `npm run build`

The Vite development server serves the UI on port 3000. The Express production server serves the generated `dist` directory and `/api/health/live` and `/api/health/ready` endpoints.

## Staging and production

- Keep separate PostgreSQL databases and credentials for development, staging, and production.
- Set `DATABASE_URL` as a protected environment secret in Coolify. Never put provider keys in source code, a database row, or this README.
- Before any migration, take a database backup and confirm that a restore is possible. Deploy code first, then run `npm run db:migrate` once against staging and review its result. Repeat for production only after staging verification and an approved release.
- Use an application DB account that is not a PostgreSQL superuser or table owner for regular runtime queries. Migration credentials and runtime credentials should be separate when the deployment setup supports it.
- Migration 002 enables forced row-level security. Until authenticated API transactions set `app.current_school_id` after verifying membership, school-scoped queries will be denied by RLS. The API has not implemented that boundary yet.
- Auto-deployment updates code; it does not prove that migrations ran or that workflows are production-ready.

## Integrations

MTN MoMo is planned as an optional server-side payment adapter. Before enabling it, confirm the exact account product, Liberia sandbox/production details, callback or status-polling method, and test outcome. Store its credentials only in Coolify secrets. Verify provider success before recording or allocating money in the school ledger.

MoE EMIS support is file-first until a Ministry-approved format and authorized interface are confirmed. Do not represent a generated export as a Ministry submission without a verified receipt from an approved exchange channel.
