# Student portal workflows: staging setup

Migration `014_student_workflows.sql` adds assignment submissions, student/teacher conversations, portal alerts, and browser push subscriptions. Run the database migration against the **staging** database before testing these workspaces. No seed records are created; use fictional accounts and school records.

## Browser push alerts

Push messages use Web Push and the browser's push service. Generate one VAPID key pair once, keep the private key secret, and reuse that pair for this site:

```sh
npm run keys:vapid
```

Add the output to the staging app's Coolify environment variables:

- `VAPID_PUBLIC_KEY` — public key from the command output.
- `VAPID_PRIVATE_KEY` — private key from the command output; never commit or share it.
- `VAPID_SUBJECT` — a support contact such as `mailto:info@totaggroup.com`.

Redeploy the staging app after adding the variables. A signed-in student or teacher can then open **Alerts** or the teaching workspace and click **Enable alerts** on each device/browser that should receive push notifications. The browser must grant notification permission. Push is unavailable until all three server variables are set.

## SMS delivery adapter

SMS sends only to guardian phone numbers with the school's recorded communication consent. A published announcement queues eligible phone numbers; an authorized user chooses **Send consented SMS** to dispatch them. Failed items remain in the delivery log for retry.

The server expects a provider adapter endpoint using this contract:

- HTTPS `POST` to `SMS_GATEWAY_URL`.
- `Authorization: Bearer <SMS_GATEWAY_TOKEN>`.
- JSON body: `{"to":"+231...","sender":"RIA","message":"..."}`.
- A successful response uses HTTP 2xx and may return `{"messageId":"provider-id"}`.

Add these as Coolify secrets only after the SMS vendor supplies an API endpoint, token, and sender ID:

- `SMS_GATEWAY_URL`
- `SMS_GATEWAY_TOKEN`
- `SMS_GATEWAY_SENDER`

If the vendor's API uses a different authentication method or request/response shape, its provider-specific adapter must be added before sending. MTN MoMo Collections credentials are for payments and do not provide SMS delivery.

## Workflow behavior

- Students see assignments for their active class and can submit written work or one PDF/JPG/PNG/TXT attachment up to 5 MB. Attachments are stored in the school database and served only to that student and the assigned teacher.
- A teacher sees submissions only for that teacher's assigned classes, can return work for revision, or save feedback and an optional score. Scores remain private until the school's existing grade publication workflow publishes them.
- Students can start a conversation with teachers assigned to their current class. The assigned teacher can reply in the teaching workspace. Messages are school-scoped and account-linked.
- Portal notices appear in the in-app alert list. Eligible users with push enabled receive browser push notifications for published announcements, new messages, assignment submissions, and teacher feedback.
- Automated SMS is not sent just because an announcement is published. The authorized user must explicitly dispatch queued SMS. This makes the recipient count and delivery status reviewable.
