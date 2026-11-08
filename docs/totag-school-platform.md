# TOTAG managed school platform

Decision recorded 8 November 2026. Redeemer and the first schools use separate application deployments and databases, maintained from one codebase. Shared SaaS is an approved development direction, not permission to move Redeemer into a shared database or release production.

## Operating responsibilities

TOTAG configures hosting, school identity and branding, school-approved academic structures, integrations, backups, updates and technical support. School authorities supply and approve facts, photographs, programs, academic policies, financial rules and authorized users. They use straightforward school workspaces for daily work. Schools retain ownership of their records.

No shared default administrator password, school database copy or global provider credential may be used to onboard another institution. A new school begins with empty operational records. Redeemer's existing records, encryption keys, staging fixtures and financial data must not become template seed data.

## Implemented foundation

The operator-only school configuration registry is implemented in `server/platform`. It is deliberately separate from school migrations and has no HTTP route in the school application.

- One configuration record per school code and environment, with independent revision history for development, staging and production.
- School name, motto, office contact, timezone, supported currency, branding asset path and colours.
- Requested public, staff and portal domain names. Staff domain information stays in the operator registry and is not published to public menus.
- Department and program definitions, including Electrical, Metalwork, Agriculture and Carpentry examples. This is a configuration catalog; it does not yet implement practical competency assessment, workshop scheduling, program enrollment or certification.
- Dedicated deployment and database resource references. They are opaque names, never connection URLs or secrets. References cannot be reassigned through a routine configuration update.
- Conflict checks and database uniqueness prevent two registry entries sharing a dedicated database, application reference or requested domain.
- Optimistic revision checks, a serialized write transaction and database-triggered append-only history. The authenticated database login and role are retained alongside the operator's descriptive reference and reason. The descriptive operator reference is not a replacement for database authentication.
- The restricted registry role cannot delete institutions, rewrite history or access school data. Unrelated school runtime roles have no access to the private registry schema. Database administrators remain privileged and require separate organizational controls.
- Offline configuration review works without a database. The registry migration runner verifies the exact target and refuses a database containing the school `schools` table. Applied registry migration checksums are retained.

Registering configuration does **not** create a database, deploy an application, provision a user, verify domain ownership, change DNS, enable a provider, publish branding or authorize production release. The examples use reserved fictional domains and contact details; they are not approved configurations for a real institution.

No live registry database, operator login or additional school deployment has been created. No shared runtime is enabled. The school server defaults to `SCHOOL_HOSTING_MODE=DEDICATED_DATABASE` and refuses an unsupported/shared mode before running startup migration helpers. Redeemer production and staging settings are unchanged by this foundation.

## Operator use

TOTAG personnel run these commands from the repository. School authorities do not need to run them.

First review the fictional example offline:

```powershell
npm run platform -- plan --manifest examples/institutions/fictional-tvet-school.json
```

For a real school, prepare a reviewed JSON configuration using the same shape, approved logo file path and school configuration approval reference. The registry stores the path, not the logo file; asset upload, validation and activation belong to the next integration stage. File extension validation alone does not establish that an image is valid or approved.

Before using database commands, TOTAG must provision a separate registry database and keep its connection secret outside school application containers. `TOTAG_REGISTRY_DATABASE_URL` is the only accepted connection setting; commands never fall back to `DATABASE_URL` or `RUNTIME_DATABASE_URL`. Do not enter credentials into the configuration file or command arguments.

Run registry migrations with its database owner connection and exact target name:

```powershell
npm run platform -- migrate --expect-database totag_school_registry
```

The migration creates a non-login `totag_registry_operator` privilege role. A database administrator must separately provision named, restricted operator logins and grant this role through the approved access process. No password or named login is created by this code. Use each operator's restricted connection for all subsequent registry commands; superuser or RLS-bypass connections are refused by the CLI for these commands.

```powershell
npm run platform -- register --manifest path/to/reviewed-school.json --expect-database totag_school_registry --expect-revision 0 --operator "TOTAG change reference" --reason "School-approved initial configuration"
npm run platform -- list --expect-database totag_school_registry
npm run platform -- show --code TEST-TVET --environment STAGING --expect-database totag_school_registry
npm run platform -- history --code TEST-TVET --environment STAGING --expect-database totag_school_registry
```

Use the revision returned by `show` for later changes. A stale revision is rejected instead of overwriting another operator's work. Requested domain reservations cannot be removed or transferred through this command; domain ownership review and offboarding must be implemented before providing those operations. Every environment requires distinct domain, database and deployment references.

## Delivery stages and acceptance gates

| Stage | Required result | Current status |
|---|---|---|
| 1. TOTAG configuration registry | Separate registry, validated configuration, audit and conflict handling | Implemented and tested locally; no live registry provisioned |
| 2. Dedicated-school onboarding | Reviewed configuration applied consistently to website, portal, documents, logo/assets, email and deployment settings; empty-school setup with named administrator | Dedicated branding/palette builds and runtime binding implemented; fictional browser preview verified. Automated provisioning and live acceptance remain outstanding. See [branding evidence](institution-branding-verification.md). |
| 3. Departments and TVET | Connected department/program management, instructor assignment, learner pathways, practical assessment, workshop resources and approved qualifications | Registry catalog implemented; operational workflows outstanding |
| 4. TOTAG management console | Individually authenticated operators, MFA, scoped support grants, approval and audit; no implicit school-record access | Outstanding |
| 5. Shared SaaS runtime | Verified domain-to-school routing, host-bound sessions and links, cross-school isolation across every API/file/job/cache, school-specific keys and providers | Outstanding; shared deployment model rejected by current registry validation |
| 6. Subscription and lifecycle | Plans, billing, suspension policy, data export, retention, offboarding and per-school backup/restore | Outstanding; no automatic billing or deletion |
| 7. Full acceptance | Two fictional schools with different branding/programs; negative access tests; restore/upgrade rehearsal; operator and school acceptance | Configuration separation tested; full school runtime acceptance outstanding |

Stages may be developed together where dependencies permit, but no label or successful registry test substitutes for operational school isolation. Existing public/private navigation rules and Redeemer's unfinished workflow/recovery gates still apply. No production migration, release or transfer to shared hosting is authorized by this document.

## Shared SaaS design constraints

The central registry will be a control plane, not a database proxy with a universal school administrator. A future management service must use separately authenticated operator identities, explicit per-school authorization and time-limited, audited support access. Secrets belong in a secret manager; registry references must not contain their values.

Public tenant routing must use verified, activated domain mappings from a trusted configuration source, reject unknown hosts, and bind sign-in, invitations, reset links and examination access to the selected institution. A request-supplied school code or forwarded host must never grant access to another school's data. Domain verification and activation are not implemented yet.

Tenant-aware database transactions, composite foreign keys and existing RLS are foundations. Shared runtime acceptance must additionally prove file/object storage separation, scheduled-job scope, caches, exports, result links, provider configuration, encrypted document keys, account recovery and audit access. Process-wide providers and deployment-level client configuration must become tenant-aware before shared hosting. The dedicated build now replaces the main Redeemer identity constants from a reviewed school package; it does not choose identity dynamically within a shared frontend.

Dedicated school databases need individual restore/upgrade procedures. Shared hosting additionally needs tested single-school export/restore and controlled deletion without exposing or disrupting other schools. No cross-school migration should be automatic or implied by a subscription change.

## Verification scope

`server/platformRegistry.test.js` exercises two fictional schools in a disposable SQL database: identity/branding/program separation, independent staging/production configurations, duplicate domain/resource denial, stale revisions, rollback, history privileges, runtime-role denial, validation and refusal to migrate a school database. The CLI offline plan also runs without contacting a configured database URL.

These tests prove configuration-registry behavior only. They do not prove multi-school ERP, financial or file isolation, actual DNS ownership, real deployment provisioning, visual branding or shared provider acceptance. No live service was contacted for these tests.

`server/sharedSchoolIsolation.test.js` additionally applies all existing school migrations to a disposable database, checks forced row security on every school-owned table and verifies the runtime role has no ownership or bypass privilege. Two fictional schools reuse the same local learner number and account email; each can see only its own seeded records. Cross-school learner reads/updates, invalid guardian links and inserts under another school's identifier are denied. Transaction-local school scope disappears on commit and rollback, including when the same connection is reused. This is database-foundation evidence, not proof of host/session/provider/file isolation for shared SaaS.

Local verification on 8 November: 408 tests discovered, 407 passed, zero failed and one existing platform-specific skip. Type checking and frontend build passed. The offline CLI plan succeeded for the four-department fictional TVET example without database access. No live deployment or migration was performed for this foundation.
