# Sidebar updates and pending work

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Local phase, 2026-10-19. Migration 020 is prepared and exercised only in disposable
local databases. No push, deployment, live migration, or existing local database
change was performed.

## Visible behavior

- An amber number indicates current work or unread inbox messages. Display is
  capped at **99+**; its accessible description retains the full count.
- A green dot indicates changes made by other staff that the signed-in account
  has not seen in that section. The account's own edits do not create its dots.
- A parent category shows one dot when a permitted child has updates or pending
  work. Counts are never added across overlapping child sections.
- Opening a section clears its dot only after its main data request succeeds.
  Pending numbers remain until the underlying work is resolved. Merely expanding
  a parent, loading filter options/history, or encountering an error does not
  acknowledge updates. Stale reused summary responses do not acknowledge newer
  changes; a fresh read is needed.
- Counts refresh every 60 seconds while the page is visible, after successful
  writes, and on return when an update is due. Page content keeps its existing
  refresh rules, including active-program 30-second refresh.
- Desktop, collapsed rail/flyout, and mobile drawer use the same badge data.
  Hover descriptions and screen-reader labels explain the counts and dots.
  The collapsed menu click/focus interaction was corrected so clicking opens it.
- Failed refreshes retain the last known account-scoped badges and show
  **Updates unavailable · Retry**. Zero values do not add badges.

## What numbers count

| Section | Meaning | Roles |
|---|---|---|
| Census → Review → Pending | Pending census submissions, including sheets needing manual encoding | Admin / Super Admin |
| Program interest | Submitted program requests awaiting review, or approved requests awaiting scheduling | Admin / Super Admin |
| Stubs | Requested, approved, or printed batches for a non-archived scheduled program today or later in Planned/Open/In progress status | Admin / Super Admin |
| Data Quality | Explicitly saved record pairs marked Needs review, with both active non-sample records present | Admin / Super Admin |
| Access and requests | Pending permission requests | Super Admin |
| Issue reports | Open and in-progress issues | Super Admin |
| Inbox | This account's unread, unarchived messages | All staff |

Paravets receive scoped update dots and their unread inbox number. Their own
requests awaiting another person's decision are not labelled as work they must
resolve. Data Quality's number is the saved review queue, not every possible
duplicate or missing-field cue computed by the Data Quality screen. Older or
inactive stub batches remain in history without inflating the active queue.

## Which changes produce dots

Registry owner/pet/respondent/participant records; census submissions and their
owners/pets; program schedules, interest, eligible barangays, runtime, stub batches
and tickets, and attendance; services; staff/account directory and barangay
changes; report source data; saved Data Quality reviews; and permission/access or
issue review changes feed their applicable sections. Census approval continues
to publish the registry through its existing bridge.

Entry-only screens (Submit/Import census, Report an issue, import/export tools),
Dashboard, Audit history, and the local Report Basket do not get speculative
server update dots. Inbox already carries unread message counts. Issue review
outcomes for reporting staff remain in their existing inbox notifications.
No past update history is fabricated when this phase is first installed; current
pending-work counts are available immediately, and dots track subsequent changes.

## Privacy, consistency, and transfer size

- `navigation_changes` keeps compact counters keyed by section, actor, scope,
  recipient, and optional program campaign. It stores no owner names, pet data,
  phone numbers, photos, credentials, or changed-record payloads.
- Database triggers update the counters in the source transaction. Rollbacks
  roll them back. Changes without an attributed staff account are not invented
  as staff updates. Existing data and audit history remain unchanged.
- Badge reads check the current role, feature switches, grants, assignment, and
  current program participation eligibility. Paravet registry/interest/attendance
  scopes remain in their own barangay; their stub allocation changes remain
  scoped to their recipient account. Their census dots cover their own submissions.
- Successfully loaded pages return a signed, ten-minute receipt describing the
  counter fingerprint observed before the page data was read. Only successful
  relevant responses emit it. Acknowledgement checks the account, section, and
  current access scope. The stored receipt is account-specific and survives
  sign-out or use on another device.
- A change committed after that read changes the fingerprint and remains unseen.
  Acknowledgements do not blindly mark everything seen at their arrival time.
  Older acknowledgements cannot replace a more recently observed visit.
- Badge refreshes transfer counts and booleans only; no record lists are fetched.
  The shell no longer downloads up to 200 inbox message bodies just to update its
  bell. Notification text is still loaded when opening the inbox itself.
- Metadata acknowledgements do not show Saved toasts, invalidate normal page
  reads, or flush server dashboard/report summary reuse. Account/access changes
  clear client state; last-known badges are never reused across account scopes.
- Protected Super Admin backups include the compact counters and seen markers.

Routes: `GET /api/v1/navigation-badges`, `POST /api/v1/navigation-badges`
with `{node, token}` for successful reads. Source data permissions remain enforced
by their existing routes; badges grant no new capabilities.

## Validation and local trial

Local build and type checks passed. **167 tests across 25 files passed**, including
11 new badge/display checks covering role/barangay/feature limits, own changes,
per-account acknowledgement, unchanged pending counts, stale/wrong/forged receipts,
failed/unrelated reads, late changes, current program eligibility, task queues,
compact output, protected backups, parent dots, and preserving summary reuse.
The tests also exercise the prior QR, census, registry, reporting, and program flows.

Built-browser checks covered mobile and desktop layouts, the collapsed flyout,
opening a section to remove its dot, and retaining Pending **1** until review.
The temporary desktop viewport override was reset. The captured browser error
log was empty. Physical devices and Vercel/Supabase performance were not benchmarked
in this phase; the existing main/Excel bundle advisories remain.

Use the running disposable preview at <http://127.0.0.1:5178>. If stopped, run
`npm run build`, then `npm run preview:registry`. It never reads `.env.local` or
opens `.local-test-db`. Synthetic credentials are:

- Super Admin: `localstubadmin` / `StubDemo!2026`.
- Separate Admin for cross-account trials: `localbadgeeditor` / `StubDemo!2026`.
- Current Paravet key: `tmp/registry-preview.json`, same synthetic password.

The preview seeds a pending census and a requested stub batch, plus record changes
attributed to another synthetic staff member. Open the menu, then Pets to see its
dot clear. Open Pending to see its number remain **1** after the dot clears.
Review/reject the practice census to resolve that work item and see the number
decrease. Preview restarts reset the sample data and markers.

Screenshots: `output/sidebar-badges-desktop.png`,
`output/sidebar-badges-collapsed.png`, and `output/sidebar-badges-mobile.png`.
