# HR recruitment and guide navigation verification

Updated 5 November 2026. Production remains paused.

## Approved responsibilities

HR manages vacancy drafts, applicant intake, shortlisting, interviews, recommendations, offer evidence and onboarding. A Principal or School Administrator approves the vacancy and authorizes hiring. Vacancy creators cannot approve their own vacancy. Hiring recommenders cannot approve their own recommendation.

## Implemented journey

1. HR saves a vacancy with its department, description, requirements, position count and closing date.
2. Another authorized leader approves it. HR opens intake and separately publishes approved application instructions through the website editor.
3. HR records the applicant against the open vacancy, then shortlists the applicant.
4. HR schedules a future interview and records feedback after the interview has taken place.
5. HR recommends hiring. A separate authorized leader authorizes the hiring decision or records a decline.
6. HR records the approved offer reference and the candidate's acceptance.
7. HR verifies identity, references, signed contract, safeguarding and orientation, then enters the employee number and start date.
8. Onboarding creates one staff record. An authorized account administrator can link that record through the existing invitation process. The recruitment action itself sends no invitation.

Applicant information is private to authorized HR and leadership routes. Every stage is recorded in recruitment history and the school audit. Revision checks reject stale updates. A vacancy lock and position check prevent overfilling during onboarding. Repeated onboarding returns the original employee ID. Existing employee-number/email matches require review instead of creating duplicate staff records.

Applicant documents and signed offer/contract artifacts currently remain in the school's approved external personnel process. The workspace stores their summary or reference and completion evidence. Automatic Careers publication, applicant email delivery, statutory payroll and broader leave workflows remain separate work.

## Guide navigation correction

Previous lesson selects the immediately preceding lesson with one click and starts narration. Next lesson moves forward by one lesson. Selecting a lesson directly starts it. Separate Previous step and Next step controls remain available for inspecting a demonstration. The full tour continues automatically after the selected lesson.

## Validation

Revision 8d18608920411911616896773b4e0312523b3e5a passed GitHub run 42032901453 with 374 tests passed, no failures or skips, plus type checking and frontend build.

The isolated HR test uses actual authentication, SQL, forced row security, CSRF and fictional records in a disposable database. It covers permission and foreign-school denial, stale revisions, duplicate applications, stage skipping, future interview rules, independent approvals, offer acceptance, required onboarding checks, employee creation retries, capacity checks, and linking the resulting employee through the normal teacher invitation entry. Invitation delivery is stubbed in that test.

## Staging state and exact remaining work

A fresh backup of redeemer_school_staging completed successfully at 13:04:38 UTC on 5 November, size 2.99 MB. The backup archive is pg-dump-redeemer_school_staging-1793883877-mr8vp0f3r15ysnjdiqnccibh.dmp.

The application source pin was saved as 8d18608920411911616896773b4e0312523b3e5a and Redeploy was clicked. Automatic browser approval review then reached its usage limit before the completion check. Deployment completion is unverified. Migration 114_hr_recruitment.sql has NOT been executed on staging.

Resume with the existing staging deployment, verify its completion, and apply only reviewed migration 114 inside a transaction against redeemer_school_staging with a matching ledger entry. Retain earlier migration history. Verify the new tables' forced row security and runtime grants. Then rehearse a fictional HR request through separate leadership approval and employee creation, and verify one-click previous-lesson playback from a middle lesson. These live checks remain required before calling the HR workflow staging-verified.
