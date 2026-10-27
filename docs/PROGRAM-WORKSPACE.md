# Program workspace

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

The **Programs** and **Program day** entries now open the same workspace. Admin
and Super Admin can create and update programs. Paravets can open programs in
their assigned host or approved participating barangays and use the scoped
interest, stub, and attendance tools.

## Staff flow

1. Browse **Current**, **Upcoming**, or **Recent and previous** programs. Search
   and pagination happen on the server; summaries do not load owner/pet details
   or QR codes. Old programs keep their recorded status; dates do not silently
   change them to Completed.
2. Admin creates a future/current schedule with a title, date, venue, host
   barangay, planned start/finish, optional pet capacity, and process checkboxes.
   **All of the Above** selects all three processes. The existing database rule
   permits one non-cancelled, non-archived program per host barangay per day.
3. Admin may choose an approved demand request. The program is connected to its
   existing gathered interests and approved barangays in one transaction. An
   independent program gets a new interest list in the same transaction. No
   stubs are issued automatically.
4. Existing unconnected programs have a **Connect program workflow** action.
   This preserves the original program record and creates its shared list.
5. Open a program for **Overview**, **Interest**, **Stubs**, or **Attendance**.
   Existing paper/QR and walk-in workflows stay available inside that program;
   batch requests are filtered on the server to the selected program.

## Actual times and overtime

Only Admin and Super Admin can record start/finish times. Starting changes the
program to **In progress**; finishing changes it to **Completed**. The server
rejects future actual times, times before the program's scheduled date, and a
finish before its start. Staff may backfill actual times from paper logs.
Corrections require a reason; old/new values and the staff actor are retained.
Concurrent saves with a stale version fail instead of overwriting newer values.

Planned duration is the difference between planned start/finish. Actual duration
is actual finish minus actual start; while running, elapsed time updates locally
without repeated network calls. Overtime is the positive difference between
actual finish (or the current time while running) and the planned finish. This
shows the effect of starting late as well as running long. Philippine time is
used throughout.

No time limit automatically finishes a program. Finishing does not close its
interest/attendance collection list. Staff may still encode paper attendance for
a Completed program while the list is open; closing and late-entry rules from
the QR workflow remain authoritative.

## Capacity and consistency

Pet slots used come only from submitted canonical attendance snapshots. Voided
entries do not count. Capacity is a planning guide: reaching/exceeding it shows a
warning and does not reject actual attendance. Interest, stub quantity, owner
visits, and pet attendance are displayed separately.

Active Paravets assigned to the host and approved participating barangays appear
automatically. Participation eligibility remains managed through the Interest
tab. A Paravet can only encode residents of their own assigned barangay.

Schedule details are protected after stub tickets have been generated,
attendance exists, or actual start has been recorded, to keep the schedule
consistent with physical slips and event history. Capacity can still be
adjusted. Host barangay/process changes are also blocked when interest entries
or stub requests already exist. Cancellation/postponement requires a reason.
Generic record editing, import, archive, and undo cannot bypass timing history
for a program managed by the workspace.

## Local setup

Apply migration **013_program_workspace.sql** after 012. It adds runtime and
program activity tables without changing/deleting historical records. Super
Admin backups include both tables. No live database is migrated by local builds
or tests.

Build locally first with `npm run build`, then run `npm run typecheck` and
`npm test`. Tests use a new disposable database. `npm run preview:programs`
starts the built app against another disposable database with synthetic staff,
current/upcoming/recent programs, and QR stub stock. This helper does not read
`.env.local` or open the existing `.local-test-db` directory. Stopping it discards
the preview records.

## Validation for this phase

- Local production build and frontend/backend type checks passed.
- The complete suite passed: **95 tests across 13 files**, including workflow
  role boundaries, time validation/corrections, concurrent starts, demand
  scheduling, capacity overflow, duplicate-day rollback, stub filtering, and
  protection against generic edits/archives.
- Browser review uses the built application with synthetic disposable data.
- The existing large main JavaScript bundle advisory remains; broader
  performance and Insights redesign work is a later phase.
