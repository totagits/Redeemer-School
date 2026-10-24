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

Redeploy the staging app after adding the variables. A signed-in student, teacher, or guardian can then open **Alerts** and click **Enable alerts** on each device/browser that should receive push notifications. The browser must grant notification permission. Push is unavailable until all three server variables are set.

## SMS delivery with Orange Liberia

SMS sends only to guardian phone numbers with the school's recorded communication consent. A published announcement queues eligible phone numbers; an authorized user chooses **Send consented SMS** to dispatch them. Failed items remain in the delivery log for retry.

Orange's Liberia SMS API can deliver to numbers on any local operator, so the school can use one Orange API integration for guardians on both Orange and MTN networks. This is SMS delivery through Orange, not an MTN MoMo payment connection. The app requests and caches Orange OAuth tokens on the server and refreshes an expired token automatically.

1. Register at [Orange Developer](https://developer.orange.com/apis/sms-liberia), create an application, subscribe it to SMS Liberia, and copy the Client ID and Client Secret from **My Apps**.
2. Purchase an SMS bundle and check the **Configure** page for the assigned sender number/name. If Orange requires an approved sender name for Liberia, ask Orange Liberia to approve it before sending.
3. In Coolify, add these server-side variables to the **staging app**:

- `ORANGE_SMS_CLIENT_ID` — Orange application Client ID.
- `ORANGE_SMS_CLIENT_SECRET` — Orange application Client Secret; keep it secret.
- `ORANGE_SMS_SENDER_NAME` — optional sender name only if Orange has approved it for the account. Leave blank to use the account's default sender.
- `ORANGE_SMS_SENDER_NUMBER` — optional only if Orange gives a different Liberia sender number; otherwise the code uses `tel:+2310000`.

Save and redeploy staging. The SMS delivery action should become available once both Orange credentials are present. Initially test with one consenting staff/guardian number on Orange and one on MTN. The server normalizes Liberia local numbers beginning with `0` to `+231` and sends through Orange. Orange's documented SMS API accepts messages up to 160 characters per request; the school SMS workflow should keep text within that limit.

MTN MoMo Collections credentials are for payments and do not provide SMS delivery. The generic `SMS_GATEWAY_URL` / `SMS_GATEWAY_TOKEN` / `SMS_GATEWAY_SENDER` integration remains available for a separate SMS aggregator if needed, but Orange can already reach both local networks.

## Workflow behavior

- Students see assignments for their active class and can submit written work or one PDF/JPG/PNG/TXT attachment up to 5 MB. Attachments are stored in the school database and served only to that student and the assigned teacher.
- A teacher sees submissions only for that teacher's assigned classes, can return work for revision, or save feedback and an optional score. Scores remain private until the school's existing grade publication workflow publishes them.
- Students can start a conversation with teachers assigned to their current class. The assigned teacher can reply in the teaching workspace. Messages are school-scoped and account-linked.
- Portal notices appear in the in-app alert list. Eligible users with push enabled receive browser push notifications for published announcements, new messages, assignment submissions, and teacher feedback.
- Automated SMS is not sent just because an announcement is published. The authorized user must explicitly dispatch queued SMS. This makes the recipient count and delivery status reviewable.
