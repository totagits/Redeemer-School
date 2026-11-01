# Updating the public school website

The owner approved the reviewed content, existing facts and photograph selection on 31 October 2026 on condition that school administration can update it. Production remains paused. This workflow supplies that control without placing a staff-login link on the public website.

## Staff steps

1. Use the separately distributed staff entry and sign in as School Administrator or Principal with the existing public-content permission.
2. Open **School website content**. **Website pages, school information & documents** manages the homepage and every school information page. News/events remain in their existing editor below it.
3. Select a page. Change the title, introduction and sections. The homepage also contains school name, motto, establishment year, office address/phones and its main content blocks. Contact panels use those office details consistently.
4. To add a photo or PDF, confirm school publication authorization and choose a file. Photos need descriptive alt text and a source at least 1200 × 675 pixels after landscape cropping; originals of 1600 × 900 or larger are preferable. The browser prepares a WebP. Public PDFs may be up to 5 MB. Never use this public editor for learner records or confidential documents.
5. Uploaded assets can be attached to another page later. Edit their caption, description or document-link label for the selected page. Removing an attachment from a draft does not erase its history or immediately change the public page.
6. Enter a reason and **Save private page draft**. Changes remain private. Select **Review page preview**, check the saved content and confirm approval for public publication. Enter the publication reason, then **Publish reviewed page**.
7. Use **Withdraw page from public view** to remove a page's published text/media while retaining history. Keep the homepage available and publish an updated version instead. School application/support functions retain their separate workflows.
8. In **Page change history**, choose **Use this version as a new draft** to recover older wording. Review, save and publish it deliberately; restoration never silently replaces the public page. Reload saved draft/discard edits is available for unsaved changes. If another administrator saves first, reload the current version before retrying.

## What is editable

- Homepage title, introduction, main text blocks, additional sections, public branding/contact details, photo selection and PDF links.
- Every public school-information/menu page, including principal message, mission/values, leadership, faculty, hours, admissions guidance, handbook, supplies/uniform, services, careers and gallery.
- Photo descriptions/captions, gallery and homepage photographs, and public PDF policy documents. Existing photos remain available as fallback until replacement page photos are published; illustrative images keep accurate labels.
- News/events and their images continue through the existing public news editor. Operational admission/fee guidance and family records remain controlled by their respective ERP workflows.

The menu structure, school account code, private staff entry, ERP accounts/roles, invoices, examination records and private family data are not changed by this editor. No email/SMS is sent when a page is saved or published.

## Preservation and access checks

Migration 112 introduces school-scoped pages, assets and append-only page-history tables with forced row security. Runtime can select/insert history/assets and cannot erase them. Draft and published content are independent snapshots. Publishing requires a version check, CSRF and explicit public-review confirmation; a per-page database lock serializes writers. Public assets are available only while a published page references them, and public reads use no-store caching. PDFs download as attachments with nosniff and restrictive content-security headers.

The initial RIA snapshots record the owner's approval. Unspecified staff names, schedules, rates or detailed policies are not invented. School staff can enter them when available. There is no automatic copy of private ERP profiles or test data into the website.

The real-SQL authenticated HTTP suite covers seeded approved content, school/role scope, drafts, stale versions, CSRF, uploaded photo/PDF privacy, publication, withdrawal, restored versions, public contact updates, retained history and runtime deletion denial. Staging backup, migration, deployment and live editor verification are recorded below once complete.
