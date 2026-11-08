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

The staging deployment of 8d18608920411911616896773b4e0312523b3e5a was visually confirmed Finished on 5 November. Coolify deployment kcuagarow2fbvgvhpoxomic8 shows the matching commit and the application Running (no healthcheck).

Browser access recovered. Migration 114_hr_recruitment.sql committed successfully through the staging database maintenance terminal, inside a transaction protected by a migration lock and an explicit redeemer_school_staging identity guard. The ledger contains the matching version. All four tables have row security enabled and forced. Runtime permissions are SELECT/INSERT/UPDATE on vacancies, applications and interviews; recruitment events have SELECT/INSERT only. No runtime DELETE grant was added. The application container has only the restricted runtime URL; no migration owner URL was added.

Live guide checks: direct selection started the recruitment tour; one Previous lesson click moved from lesson 13 to Staff & HR (12), and another moved to Expense approvals (11), with the tour still active. The HR Manager has six role-filtered topics, including the new 20-step recruitment demonstration. Screenshots are retained in the workspace outputs folder.

Live fictional HR rehearsal: TEST-HIRE-20261105 was created by School Administrator Michael Gwoah, approved by Principal James Doe, then opened by HR Manager James Williams. HR recorded test-hire-20261105@example.invalid, shortlisted it and scheduled the fictional interview. Early completion was rejected with the expected timing message. After the scheduled time, HR completed the interview and recommended hiring. HR had no authorization action; Principal James Doe separately authorized the fictional hire. HR recorded a fictional offer reference and acceptance, completed the five simulated onboarding checks and created employee TEST-HR-20261105 at 13:08:51 America/Chicago on 5 November. The employee appears once in the Staff & HR directory, increasing the count from eight to nine. The completed applicant shows its employee number and retained actor/timestamp history. No account invitation was issued. HR closed this test vacancy to new applications after the rehearsal.

The requested recruitment-through-onboarding staging rehearsal and guide lesson-navigation checks are complete. Evidence: outputs/hr-staging-migration-verified.jpg, outputs/guide-previous-lesson-verified.jpg, outputs/hr-automatic-guide-verified.jpg, outputs/hr-onboarding-completed.jpg and outputs/hr-staff-record-verified.jpg. Account linking was covered by the isolated SQL/invitation test rather than sending a new live invitation. This does not close the separate leave, payroll or external personnel-document work.
