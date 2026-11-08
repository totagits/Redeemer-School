# TOTAG school requests and management console

Prepared 8 November 2026. Implemented and tested locally; **not published**.
Redeemer staging remains pinned to `95f7859822297addaab135e4af4f5ec226827278` for school-authority review. Production remains paused.

## Customer and administrator workflow

1. The corporate IT Services and SaaS pages offer **Request a school solution**, separately from the existing FIMS/HRMIS subscription products.
2. The customer supplies school/contact details, requested workspaces, TVET notes and optional primary colour, with contact consent. The form excludes uploads, passwords, employee and learner records.
3. The corporate server validates the versioned request and signs a server-to-server delivery. The separate console registry persists it before returning a customer reference. Retrying the same request does not duplicate it; changing its contents under the same identifier is rejected.
4. A pre-approved TOTAG portfolio manager opens **School requests**. Scoped school configurators cannot read this portfolio-wide contact queue.
5. The manager records a reason to start review, await information or decline. After review, **Prepare school configuration** starts a new configuration with the requested name and colour preferences. Private customer contact details do not become public school contact details.
6. TOTAG enters approved public details, logo, accessible palette, domains, departments/program catalog, dedicated hosting references and school approval reference. Check the configuration, confirm review and save.
7. Saving the new configuration and linking its source request happen in one transaction. A stale source request rolls back the school configuration, domain reservations and histories. The request becomes **Configuration prepared**.
8. Infrastructure provisioning, domain ownership, school workflow acceptance and launch follow separately. No payment, subscription, school account or infrastructure is automatically created.

## Console identity and separation

The console is a separate service and database connection, with no school database fallback. Its production server refuses a mismatched database, a school database, or a superuser/RLS-bypass/role-creation/database-creation login. Migrations do not run automatically on startup.

Workforce sign-in uses OIDC authorization code with PKCE, browser-bound single-use state, nonce, signed RS256 ID tokens, expected issuer/audience, recent authentication and verified MFA. MFA requires the issuer's `amr` containing `mfa`, or an explicitly reviewed MFA `acr` allowlist. Provider-specific integration has **not** been tested with a live identity provider.

Approval is based on exact issuer and immutable subject provisioned by the database owner. Email, browser fields, JWT role claims and school portal roles cannot provision an operator. `GLOBAL_CONFIGURATOR` can register schools and manage intake; `SCOPED` operators require individual institution `READ` or `CONFIGURE` assignments. There is no HTTP operator creation or scope-grant endpoint and no school-record/support access.

Session tokens are stored hashed, expire after one hour, and use secure HttpOnly SameSite cookies. Each request reloads current operator activation/scope. Mutations require exact Origin and session CSRF token; the server checks the actual configured Host and ignores forwarded host claims. Sign-out invalidates the token. Logo assets, configuration downloads and history use the same school scope checks.

## Local fictional demonstration

```powershell
npm ci
npm run platform:console:build
npm run platform:console:demo
```

Open `http://127.0.0.1:4105`. This loopback-only demo uses disposable in-memory PGlite, fictional identities and schools, no `.env` loading and no provider or live school database. Its sign-in button is unavailable in the production service. Demo MFA is explicitly marked unexercised. Stopping the process discards its data.

The corporate repository has a matching isolated `server/schoolRequestDemo.ts` preview. Build its frontend with `VITE_API_BASE_URL=http://127.0.0.1:4106`, then run `node --import tsx server/schoolRequestDemo.ts`. This script imports only the bridge and static server; it does not initialize the corporate app, Stripe, mail or database seeds. Its fixed fictional intake secret is loopback-only and must never configure live services.

## Live preparation still required

Use a separately backed-up registry database. Run `npm run platform -- migrate --expect-database <exact-name>` with its owner connection; migrations 001–003 are separate from school migrations. Provision a named restricted runtime login with membership in `totag_registry_operator`. Its connection belongs only in the console service.

The database owner must separately approve and insert exact workforce `issuer`, `subject`, display name and access level in `totag_platform.operators`. Add per-institution rows to `operator_scopes` for scoped accounts. Confirm the identity with the workforce administrator first; do not infer a subject from email. Revocation sets `active=false` and takes effect on the next request. No real operator or privilege grant has been made by this implementation.

Console server settings:

| Setting | Purpose |
|---|---|
| `TOTAG_REGISTRY_DATABASE_URL` | Restricted separate registry connection; secret |
| `TOTAG_REGISTRY_DATABASE_NAME` | Exact expected database name |
| `TOTAG_CONSOLE_PUBLIC_URL` | Clean HTTPS root address of this console |
| `TOTAG_OIDC_ISSUER` | Approved HTTPS workforce issuer |
| `TOTAG_OIDC_CLIENT_ID` / `TOTAG_OIDC_CLIENT_SECRET` | Confidential client; secret stays server-side |
| `TOTAG_OIDC_MFA_ACRS` | Optional, explicitly verified MFA assurance values |
| `TOTAG_SCHOOL_INTAKE_SECRET` | Strong shared bridge secret of at least 43 characters |
| `TOTAG_CONSOLE_PORT` | Optional service port; default 4100 |

Register the exact `/auth/callback` redirect. Current discovery requires authorization, token and JWKS endpoints on the issuer's HTTPS origin. The provider must support RS256 and `client_secret_post`; incompatible providers need an explicitly reviewed adapter. Configure the reverse proxy to preserve the console's real Host, enforce HTTPS and protect secrets. The console has no public CORS data access.

The corporate backend needs `TOTAG_SCHOOL_CONSOLE_URL` and the same intake secret. Its bridge accepts only exact approved corporate Origins, signs the exact outgoing bytes with timestamp/HMAC SHA256, forbids redirect-following, and returns a receipt only on a confirmed save. The console rejects stale, tampered and unsigned deliveries. Public requests are limited in-process to five per network address per fifteen minutes. Before a multi-instance public launch, add durable shared rate limiting, trusted-proxy addressing, operational monitoring, contact-data retention policy and abuse controls. No email delivery or automated notifications are implemented for requests.

Build with `npm run platform:console:build`, start using `npm run platform:console:start`, or use `Dockerfile.totag-console`. Back up and restore the registry, including approved logos, separately from every school. Rehearse restore and live SSO/revocation, domain/proxy handling, network failure/retry and deployment rollback before publication. Existing corporate security/type-check debt is a separate release gate documented in its integration report.

## Verification evidence

Local school/console suite: 435 tests discovered, 434 passed, zero failed, one PostgreSQL-18 contention check skipped because its separate server was not connected. One added intake/access subtest subsequently passed with the other seven console API tests. School type checking, school build and separate console build passed. Production dependency audit reported zero findings.

Tests verify signed token validation, state/PKCE binding and replay denial, pre-approved identities, MFA rejection, scope/CSRF/Host restrictions, no self-grants, logo scope/export, stale revisions, audit privileges, intake validation/signatures/idempotency, private queue authorization, and atomic configuration linkage/rollback.

Edge browser rehearsal used only fictional local data: submitted **TEST Browser Technical Academy**, received `SCH-2026-0162292846C0`, opened the private queue, recorded review, prepared school identity/palette and one Electrical Technology TVET program, validated and saved version 1, then confirmed **Configuration prepared** with three retained request events. The colour preview passed all four 4.5:1 checks. Screenshots are in the workspace outputs folder. Live SSO, actual provisioning, live backup recovery and shared multi-school runtime remain unverified.
