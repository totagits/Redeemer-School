# MTN live acceptance preparation

Updated 7 November 2026. Production remains paused. Live collections and SMS must remain disabled pending the approvals and controlled tests below.

## Verified current position

- The signed-in MoMo developer account shows an active School Fees Collection subscription and an active Collection Widget subscription. Active subscriptions do not, by themselves, establish production merchant approval.
- The owner confirmed on 7 November that no separate live-approval letter or email has been received.
- The Go Live page loads its heading, but its embedded onboarding content is blank in the observed browser session. The account Profile remains accessible. No onboarding form, agreement or application was submitted.
- Last verified staging service state: MoMo SANDBOX configured; MTN SMS incomplete or disabled; email configured. No live-send or live-collections flag was enabled. No real money or SMS test was initiated.

## Provider approval record

Obtain Collections approval and SMS approval separately. Keep credentials in the server's secret store, never in this record or chat.

| Required confirmation | Collections | SMS |
|---|---|---|
| MTN or Lonestar approval reference and date | Pending | Pending |
| Authorized school or merchant entity and account match | Pending | Pending |
| Approved product and Liberia operating environment | Pending | Pending |
| Production credential provisioning confirmed without copying values | Pending | Pending |
| Approved fee schedule and charging basis | Pending | Pending |
| Merchant collection and settlement arrangement | Pending | Not applicable |
| Approved SMS sender and recipient/network coverage | Not applicable | Pending |
| Provider support and reconciliation reference | Pending | Pending |

Request the exact Liberia onboarding documents and steps from MTN. Do not assume that sandbox subscriptions replace the merchant agreement or that SMS approval follows Collections approval. The authorized school representative must handle agreements and any identity, business, banking or ownership evidence required by MTN through its approved channel.

MTN's published Liberia Widget details describe transaction fees and state that fees can be revised or negotiated. Verify the school's actual Collections agreement before accepting any fee assumption. The prepared application update requires an explicitly configured production fee rate and agreement reference; it no longer treats a 2.5 percent assumption as an approved production rate. Sandbox calculations retain their test default. No SMS charge or message-length policy is approved by this document.

## Provider enquiry draft

Subject: Redeemer International Academy Liberia production onboarding requirements

We are preparing Redeemer's International Academy's school fee Collections integration for Liberia. Our developer account shows active Collections and Collection Widget subscriptions, but we have not received separate production merchant approval.

Please confirm the current Liberia onboarding steps, required documents and approved submission channel, merchant activation status, production product and environment, credential provisioning process, transaction fees and settlement arrangements. Please provide a case reference and the account-specific requirements.

We also need to establish the separate process for MTN SMS V2, including an approved school sender, supported destination networks, charges and delivery-status evidence. Please identify the appropriate team if this requires a separate request.

Developer account contact: [school to complete through the approved provider channel].

This is a draft only. It has not been sent. Do not include API keys, passwords, banking evidence or identity documents in an ordinary enquiry.

## Controlled test authorization

Complete after provider approval. Approval of this preparation document does not authorize a charge, live send, permanent public exposure or production release.

| Test detail | Owner authorization |
|---|---|
| Isolated acceptance environment and operator | Pending |
| Collections product and verified merchant receiving account | Pending |
| Owner-controlled payer number and authorized account holder | Pending |
| Exact test currency and maximum total debit including fees | Pending |
| Number of permitted attempts and stop condition | Pending |
| Approved SMS recipient and consent | Pending |
| Exact SMS text, sender and maximum total charge | Pending |
| Finance witness and evidence location | Pending |
| Merchant settlement or balance evidence and reconciliation owner | Pending |

The payer must personally complete any phone prompt, PIN or consequential payment approval. Do not collect their PIN. Do not initiate a second collection if the first outcome is unknown. SMS must not be sent to unapproved recipients. Real test records must be isolated from student records and explicitly identified for Finance reconciliation.

## Acceptance checks

1. Confirm the provider approvals, agreement, credential environment, sender and agreed fees. Verify the school's controlled test authorization.
2. Check configuration and authentication without displaying secrets. Authentication success alone is not settlement or delivery evidence.
3. For Collections, use the authorized test transaction and retain its application reference, provider reference and payer approval. Confirm the provider status and financial transaction reference. Reconcile gross, fee and net against the merchant's provider evidence.
4. Check that reconciliation creates one payment/receipt/allocation only. Repeating a status check must not create another receipt. Record an independent Finance review.
5. Verify failure, timeout, unknown-outcome and duplicate handling through non-chargeable mocks or provider-supported test facilities. Do not deliberately create repeat real debits to test duplicates.
6. For SMS, send only the specifically approved text to the approved recipient within the agreed charge limit. Retain the provider ID, charging result and actual recipient/provider delivery evidence. A send acceptance is not proof of delivery.
7. Verify that failed or uncertain sends cannot be automatically retried into duplicate charges. Record the manual investigation and recovery procedure.
8. Retain evidence, review findings and explicit scope of acceptance. Keep production paused for the separate whole-site release decision.

## Technical preparation before live SMS

The audit found that the previous announcement dispatch route selected QUEUED and FAILED rows and sent messages before its database transaction committed. A timeout after provider acceptance or an interrupted save could therefore permit a duplicate charge on retry.

The prepared fix persists a SENDING claim and correlation reference before any provider request. It claims only never-attempted QUEUED rows with row locks, serializes announcement queue preparation, and rechecks guardian consent, current phone and audience eligibility. Provider acceptance becomes SENT, which is not delivery confirmation. Any exception becomes UNKNOWN conservatively. A result-save failure leaves the committed SENDING claim in place. Neither UNKNOWN, SENDING nor FAILED is automatically resent. A manual provider investigation is required; this update provides no automatic requeue or provider delivery-receipt callback.

Migration 116 adds the claim fields and states without changing school RLS. Isolated real-SQL tests cover repeat claims, accepted sends, timeouts after acceptance, interrupted result saves, rolled-back claims and withdrawn consent. Provider calls are mocked; no live test or charge was used to investigate or verify the fix. Staging deployment and migration evidence follows below.

Production Collections now also requires MTN_MOMO_FEE_RATE_BPS and MTN_MOMO_FEE_AGREEMENT_REF, in addition to the existing live switch and correct production credentials/environment. Missing or invalid fee configuration keeps production collections disabled. Migration 117 records the agreement and rate on each new payment intent. Reconciliation uses that retained rate, not a later configuration value. Successful legacy intents without recorded fee terms require Finance review; no historical agreement is invented. Targeted API tests cover rate changes and missing legacy terms.

Payroll rules and payroll payments are separate from school fee Collections; the Collections adapter is not an employee-payroll disbursement integration.

Local verification completed: 388 tests discovered, 387 passed, no failures and one existing platform-specific skip. Type checking and frontend build passed. These results establish non-chargeable technical preparation, not live provider acceptance. Production approval, agreed fees, authorized test details, actual Collections reconciliation and SMS delivery evidence remain pending.

## Completed staging verification

- Revision `9b95c80f65a4023ce25867de9271d3b21f1581c5` passed [GitHub run 42450263315](https://github.com/totagits/Redeemer-School/actions/runs/42450263315): 388 tests passed, no failures or skips, with type checking and build successful.
- A fresh staging database backup succeeded at 2026-11-08 05:19:51 UTC (7 November, 23:19:51 America/Chicago), size 3.02 MB. Archive: `pg-dump-redeemer_school_staging-1794115189-wsfmtvy6gxapncxwa2t89raj.dmp`.
- Coolify staging deployment `lwyivduhhfj0b8wjhduslz3f` finished successfully for that revision. The application returned to its normal sign-in page after restart.
- Migrations 116 and 117 committed together under a migration lock after explicitly checking the database name was `redeemer_school_staging`. Both migration ledger entries and the new dispatch and fee-agreement columns were verified.
- The signed-in Finance browser showed the updated fee disclosure and external-service state: MoMo SANDBOX configured, MTN SMS incomplete or disabled. No credentials or live-enable settings were changed.
- Screenshots retained in the workspace outputs folder: `mtn-safeguards-staging-backup.jpg`, `mtn-safeguards-migration-verified.jpg`, `mtn-safeguards-service-state.jpg` and `mtn-safeguards-fee-disclosure.jpg`.

These checks complete staging deployment of the safeguards. They do not establish MTN production approval, actual settlement or SMS delivery. Production remains paused. The [payroll rules template](payroll-rules-for-school-approval.md) awaits school completion and approval; automated payroll rules have not been activated.

## Sources

- MTN MoMo Go Live: https://momodeveloper.mtn.com/golive
- MTN Liberia Widget operating and fee information: https://momodeveloper.mtn.com/Liberia_Widget_productDetails
- MTN SMS V2 official product and API information: https://developers.mtn.com/products/mtn-sms-interface

Source pages checked 7 November 2026. The school's actual approvals and agreement take precedence for account-specific activation and fees.
