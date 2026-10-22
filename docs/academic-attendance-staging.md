# Academic setup and roll-call staging workflow

This is the first persistent school workflow. It uses the authenticated runtime database connection and the school ID bound to the signed-in session. Runtime SQL is subject to the existing forced school row-level security policies.

## Administrator setup path

1. Create an academic year (the year begins as `PLANNED`).
2. Add the school's subject codes and names.
3. Add class groups under the correct year.
4. Create teacher accounts. The initial password is generated randomly, shown once, and stored only as a password hash. Share it privately; teachers must change it at first sign-in.
5. Assign each teacher to a subject and class for an academic year.
6. Add student IDs and names to the class roster.
7. Open Teacher class roll call, choose an assignment/date, enter the lesson topic/time, mark every student, and save.

Teachers see only their own assignments and students enrolled in those classes. An attendance correction requires a reason and creates an `attendance_correction_history` record plus an audit event. All students currently enrolled in the selected class must be included when submitting roll call.

## API routes

All routes below require a valid session cookie. Mutations require the `X-CSRF-Token` issued by `/api/auth/login` or `/api/auth/session`.

- `GET /api/operations/setup`
- `POST /api/operations/academic-years`
- `POST /api/operations/subjects`
- `POST /api/operations/classes`
- `POST /api/operations/teachers`
- `POST /api/operations/teacher-assignments`
- `POST /api/operations/students`
- `GET /api/operations/attendance/roster?assignmentId=…&date=YYYY-MM-DD&time=HH:MM`
- `POST /api/operations/attendance/roll-call`

The attendance workflow uses the school's configured time zone when choosing/reopening a lesson session for a date. Roll-call writes are transactional and serialized per assignment/date/time to avoid duplicate sessions. Repeated saves for the same class period update that session; changes to an existing status require a correction reason.

## Current boundaries

This slice does not yet provide teacher invitations by email, teacher employment contracts, grade entry, assessments, teaching material uploads, timetable setup, guardian details, class transfers, or an official Ministry of Education EMIS export. Use synthetic staging records until the corresponding workflows and operational policies are in place. Do not use the prototype Finance, HR, Inventory, reporting, or admissions screens for official school operations.
