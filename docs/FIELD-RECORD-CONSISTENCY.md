# Field record consistency

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Local phase, 2026-10-19. Migration 021 is included in disposable setup only.
No production migration or push is part of this work.

## Sources and roles

| Screen | Main source | New entries | History |
| --- | --- | --- | --- |
| Respondents | Accepted owner entries in approved census submissions | Census submission and approval | Older manual/imported respondent rows remain a separate, read-only tab |
| Participants | Submitted program attendance, one row per participating pet | Program day stub redemption or walk-in attendance | Older manual/imported participants remain a separate, read-only tab |
| Services → Program services | Completed procedures projected atomically from attendance | Program day | Include voided entries to inspect corrections |
| Services → Standalone visits | Reviewed visits outside a program, including all recorded outcomes | Explicit registry owner/pet selection, procedure selection, review, confirmation | Submitted and voided visit snapshots, actor, time, and reasons |
| Services → Manual / imported history | Previous manual records and historical CSV/workbook imports | Existing historical import route | No automatic identity linking or attendance conversion |

Admin and Super Admin can access these field-record views and record standalone
visits under their existing capabilities. Paravets continue to encode program
attendance in their permitted area through Program day; this phase adds no
standalone-service permission for them. Census and registry scope rules remain
authoritative. Both operations and registry feature settings gate the new API;
approved Respondents additionally requires Census access. Super Admin retains
the existing feature-switch exemption.

Respondents counts are response entries, not distinct people: the same owner can
appear in multiple approved surveys. Rejected owner entries and submissions
that are pending, rejected, withdrawn, or undone are absent from the main view.
Their original census/history remains available through its existing workflow.
Unknowns remain “Not recorded”; No and zero remain recorded values. Owner links
use the confirmed census registry alias, including “keep” decisions.

Participant counts mean pets attended. Service rows mean completed procedures,
so one pet with two completed procedures produces two program service rows.
Standalone visit rows mean visits; a visit can include several pets. Only its
completed procedures enter the existing service record totals. Deferred and
ineligible outcomes are retained in the visit snapshot, without a completed
service projection. Program outcome reports continue to use canonical attendance
and exclude standalone and older imported services.

Dashboard Respondents/Participants counts now follow these main sources. Old
generic totals remain available as respondents-history/participants-history
metadata. Other registry/report exports retain their existing historical scope;
use Program outcomes for confirmed program totals and the source tabs/Report
Basket for source-specific evidence.

## Standalone save and correction

1. Select an active live registry owner explicitly; names never select or merge
   identities automatically. Select active pets linked by owner ID. Correct
   missing/ambiguous owner links in the registry first.
2. Select all applicable procedures per pet. “All of the Above” selects the three
   checkboxes. Record Completed, Deferred, or Not eligible for each procedure.
3. Enter the actual service date, location, provider, and optional notes. Past
   dates are allowed; impossible and future dates are rejected by the server.
4. Review the owner, selected pets, procedures, outcomes, and visit information.
   The review token is bound to the current actor, form, registry records, and
   overlapping standalone visits, and expires after ten minutes. Reviewing does
   not save, show a save-success toast, or invalidate summary caches.
5. Same owner ID + pet ID + date + overlapping procedure in an active standalone
   visit raises a possible-repeat warning. Open the matching visit and supply a
   reason to record a separate actual visit. This is not a universal duplicate
   detector for old name-only imports or attendance snapshots. No name-based
   merge, suppression, or cross-program participation limit is introduced.
6. Confirm and save. A registry advisory lock serializes reviewed saves with
   registry corrections. The visit and completed-procedure projections commit
   in one transaction. A stable request UUID makes concurrent/retried identical
   saves create only one visit; changing the payload/actor cannot reuse it.
7. Correct an erroneous visit by voiding with a required reason and recording a
   new reviewed visit. The original snapshot, creation actor/time, duplicate
   explanation, and void actor/time/reason remain visible. Voiding archives the
   completed-service projections in the same transaction. No general edit,
   import, archive, restore, or undo route may overwrite managed projections.

Owners may return with pets across different visits and programs. Standalone
visits allow 1–30 explicitly selected pets; the physical stub’s 1–3 pet limit
continues to apply only to stub attendance.

## Integration and local trial

- Source links open the originating census, the correct program record (not an
  assumed campaign ID), or the linked owner workspace.
- Report Basket revalidates approved Respondents and active standalone visits
  against current server data and permissions. Voided/withdrawn entries become
  unavailable; UI report buttons are disabled on voided/archived rows.
- Sidebar receipts acknowledge only the matching field-record kind. Census
  approval/reversal and standalone service changes generate scoped update dots.
- Lists are paginated at 25 rows with search, explicit loading/error states,
  visible 30-second refresh, a Refresh button, and update time. Background
  refresh keeps the current table visible. Details open in a loading modal.
- Historical CSV service imports are labelled and kept in history. Respondent
  and participant generic creation/import are blocked. Generic service creation
  is blocked; new care uses attendance or the reviewed standalone form.
- Protected Super Admin backups include standalone snapshots and correction
  metadata. Snapshot sanitization excludes image/photo/credential data.

Start `npm run preview:registry` after `npm run build`. This uses a fresh in-memory
database, migrations 000–021, synthetic accounts, an approved practice census,
stub/walk-in attendance, and historical rows. It never reads `.env.local` or
opens `.local-test-db`. Port 5178 is the local UI; restarting resets practice data.

Try Respondents → Approved census / Manual history; Participants → Program
attendance / Manual history; Services → Record standalone service. Leo Reyes
has linked pet Muning; the approved Practice Census Owner has Practice Mochi.
Select processes, vary outcomes, review, save, inspect details, then test a repeat
visit explanation or voiding. Existing QR camera/image reading is unchanged.

Automated coverage includes census approval/undo and Basket revalidation,
history separation, forbidden generic writes, invalid/future dates, explicit
owner links, stale/changed reviews, concurrent retries, repeat explanations,
atomic rollback, completed-only service projections, preserved snapshots,
void history, backup, role/feature access, and section-specific read receipts.
