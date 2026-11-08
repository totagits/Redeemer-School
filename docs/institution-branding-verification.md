# Institution branding and dedicated deployment binding

8 November 2026. Implemented on the review branch; not deployed to Redeemer. Production remains paused.

## Identity and colour palette

TOTAG can build a dedicated school application from the maintained codebase using its reviewed institution JSON and logo file. Without that configuration, Redeemer remains the default.

The configuration supplies school name/code, motto, optional establishment year, contact details, logo, environment and palette. Primary and optional secondary colours support white text; the accent supports dark text and selected navigation. Builds reject those colour pairs below 4.5:1 contrast. Semantic success/error colours remain separate.

Identity is connected to public navigation/homepage, neutral information-page defaults, public API school selectors, application/request forms, staff/family sign-in, candidate examination pages, guide labels, operational navigation, invoice/receipt logos and contact defaults, report-card logos, Digital ID logos and account/examination email. Database-derived official names and historical academic snapshots remain database-controlled. The QR protocol prefix is retained for compatibility.

Configured builds produce their own title/metadata, favicon, installed-portal manifest, logo and service-worker cache namespace. Redeemer's public asset directory is not copied into another school's build. New schools do not inherit Redeemer's photographs, approved page copy or policies. Uploaded school photographs and PDFs retain their existing authorized publication workflow.

Only explicitly selected public fields enter the browser configuration. Staff domains, internal database/application resource names, approval references and the department catalog are excluded. No credentials belong in the institution JSON.

## Dedicated-school safeguards

The build fingerprints the validated configuration and logo. A configured server requires matching files and frontend fingerprint. It refuses a missing database, unsafe runtime role, absent school code or public URL outside the reviewed hostname list.

Requests use the actual Host header, not a forwarded hostname. Conflicting school selectors are rejected before routing and after JSON parsing. Another school's staff/family or candidate session is rejected. Wrong-school invitation/password-reset redemption rolls back before committing a password change or consuming its link. Health probes remain reachable without school data.

This binds a dedicated package to its institution. It does not verify domain ownership, create databases, provision accounts, enable providers or finish shared SaaS.

## TOTAG setup

1. Complete the institution JSON and school approval reference through the registry workflow. Optional `school.founded` is a four-digit year. Optional `branding.secondaryColor` defaults to the primary colour.
2. Place the approved PNG, WebP or JPEG logo in a dedicated directory using the basename of `branding.logoPath`. Builds check size/type signatures and reject remote URLs, SVG/HTML and path traversal. Signature checks do not replace image-quality and publication-rights review.
3. Set `SCHOOL_INSTITUTION_MANIFEST` and `SCHOOL_INSTITUTION_ASSETS_DIR` for the standard build. These are server/build settings, not browser secrets.
4. Supply the same files/settings to that school's dedicated server, with its restricted runtime database and reviewed HTTPS public URL. The school must already exist through the controlled empty-school bootstrap. Never clone Redeemer's operational records.
5. Review the website/portal, documents, content, provider sender and recovery links with the school before release. Configuration validity is not release approval.

Institution-wide identity changes require a reviewed configuration update and rebuild. Public homepage profile edits remain website-level changes; this phase does not synchronize them into the TOTAG registry or operational database. The future console must coordinate institution-wide changes.

## Verification and limits

- A fictional school built with teal `#164E63`, dark teal `#083344`, gold `#FDE68A`, a generated TEST-only logo and reserved fictional contacts/domains.
- Rendered public menu pages, homepage and both sign-in audiences were checked for absence of Redeemer names, contacts, logo paths and photographs. No public staff-login links were introduced. Public selectors use `TEST-TVET`.
- Build tests cover public-field filtering, metadata escaping, logo type rejection, generated install/cache assets, missing/changed configuration, unsafe database roles, unknown schools, hostname mismatch, forwarded-host spoofing and conflicting selectors.
- Local HTTP tests cover wrong-school staff/candidate cookies, account-setup/reset rollback and matching-school setup. Mock-provider tests cover school email identity and HTML escaping. No real invitation, message or charge was sent.
- Edge verified the compiled fictional homepage and portal sign-in. At 390 × 844, the long school name and homepage fit the phone layout; the viewport was restored. Screenshots in workspace outputs: `institution-home-palette.jpg`, `institution-portal-palette.jpg`, `institution-mobile-palette.jpg`.
- The browser preview is static: database-backed updates are unavailable by design. It verifies branding/layout, not a deployed fictional-school workflow. Document-print appearance has no new live browser acceptance in this phase.
- Redeemer's default build and type checking pass. No live environment, DNS, school database, account or migration changed.

Final local regression: 420 tests discovered, 419 passed, zero failures and one existing platform-specific skip. Both the default Redeemer build and the separate fictional-school build completed successfully.

The TOTAG console, automated empty-school provisioning, operational TVET workflows, subscriptions and shared SaaS routing remain outstanding. See [the delivery plan](totag-school-platform.md).
