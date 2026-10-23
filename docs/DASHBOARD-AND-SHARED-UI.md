# Dashboard and shared UI consistency

Implemented locally on 2026-10-19. No database migration is required by this phase.

## Layout

- **Needs your attention** comes first. Zero-count tasks are omitted; an empty
  successful read displays an explicit empty state. A failed read shows an error
  and retry action, never an apparent zero count.
- **Current & upcoming programs** shows at most five permitted programs, with
  active programs first and other programs ordered by schedule. Links open the
  exact program workspace. A further result produces a View all programs link.
- **Quick access** contains at most six role-specific, currently permitted links.
  All sections expands the complete permitted list without fetching dataset counts.
- **Recent updates** retains the shared canonical source reader, optional history,
  exact record previews, and current access checks from the previous phase.
- The full calendar is lazy loaded at `/calendar`; its events endpoint now also
  enforces the operations feature switch. It is no longer fetched on Dashboard.

No registry totals are used as task counts. Opening Dashboard does not acknowledge
an entire category's update dot or resolve any pending item.

## Roles and counts

Admin and Super Admin tasks use the **same pending-count helper as the sidebar**:
census pending review; demand requests awaiting review or scheduling; stub batches
awaiting review, printing, or handover; and flagged record pairs needing review.
Access requests and open/in-progress issue reports appear for Super Admin only,
according to existing capabilities. These queues overlap by workflow, so Dashboard
does not sum them into a misleading grand total.

Paravet actions are separately defined from Admin's queues:

- Their own rejected census submissions, for reading the review reason and making
  corrections or resubmitting when appropriate.
- Gathering demand lists in their assigned barangay, using each list's existing
  configurable target. No automatic request or stub allocation is introduced.
- Printed batches assigned to that Paravet, for coordinating physical collection.
  Only Admin/Super Admin records handover.
- Handed-over assigned batches containing available stubs, for assessment/issuance.
  These numbers count **batches**, not people, pets, or unused tickets.

**Awaiting Admin** separately lists their own pending census submissions, their
barangay's requested/approved demand requests without schedules, and their assigned
Requested/Approved stub batches. These are waiting items, not approval controls.
Stub tasks require current program eligibility and current/upcoming or in-progress
programs. Archived/cancelled/ineligible program batches do not become issuance tasks.

Program visibility follows current host/invited barangay access, existing capabilities,
and role feature switches. Samples and archived programs are excluded from the
compact list. Completed, cancelled, postponed, and past inactive programs remain in
their existing workspace/history. In-progress programs remain visible until staff
changes their status; this page never closes them automatically.

## Loading, interaction, and data use

The overview endpoint authenticates staff, resolves current access, and reads compact
counts and explicit program fields in a read-only repeatable-read transaction. It
does not load owner/pet lists, images, QR tokens, or credentials. It has no persistent
summary copy or permission cache and responds with `Cache-Control: no-store`.

Dashboard overview and Recent updates refresh every 60 seconds while visible,
following the existing agreed summary refresh policy. Each has Last updated,
Refresh, visible spinner text, and independent error handling. Existing write/scope
invalidation and request cancellation remain active. Background refresh preserves
the displayed successful data and disclosure state; failures display retry feedback.

Shared UI adds reusable EmptyState and LoadError components. Calendar displays a
loading state before events arrive and a retry state on failure. Shared confirmation
dialogs show a working spinner and prevent repeat confirmation/dismissal while busy.
Toasts have a short entry transition, wrap within phone widths, and have a larger
close target. Existing reduced-motion rules disable animation when requested by the
device. No new blocking modal is opened just for a background refresh.

## Local verification and trial

- Production build and type checks passed. The existing large-bundle advisory remains.
- **198 tests across 30 files passed** using a fresh disposable in-memory database.
- New tests cover queue/sidebar consistency, own submission corrections/waiting,
  gathering interest lists, batch recipient/status rules, current invitations and
  assignment changes, disabled features, Super Admin access, compact fields, bounded
  programs, shortcuts, visible loading labels, empty states, and retry feedback.
- Browser checks covered staff and Paravet dashboards, exact program links, calendar
  navigation, full-section disclosure, the sign-out/resume dialogs, and Dashboard/
  Calendar at 375px width. Screenshots are in `output/dashboard-ready.png` and
  `output/dashboard-paravet-ready.png`.

Run `npm run preview:registry` after building, then open
`http://127.0.0.1:5178/dashboard`. The existing synthetic accounts remain
`localstubadmin` / `StubDemo!2026` and the Paravet key written to
`tmp/registry-preview.json` with the same practice password. The preview never reads
`.env.local` or opens `.local-test-db`. Tests and previews are disposable; no real
records were changed, pushed, deployed, or migrated in Supabase.

This phase reduces unnecessary initial reads but does not establish Vercel/Supabase
production latency or bandwidth improvements. A representative hosted performance
measurement and user acceptance testing remain follow-up work.
