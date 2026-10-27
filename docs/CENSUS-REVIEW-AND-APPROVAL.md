# Census review and approval

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Local implementation, 2026-10-19. Paper OCR/API work remains cancelled. Browser
QR scanning, saved QR image reading, manual census photo attachments, and prior
history remain available.

## Review flow

1. A Paravet imports Excel/CSV or encodes a census and submits it for review.
2. Admin/Super Admin opens **Census → Pending** and chooses a submission.
   Printable forms are collapsed so owner decisions stay easy to find.
3. Each owner entry displays its address/contact and expandable pet details.
   Missing values show **Not recorded**; explicit false shows **No**; zero months
   remains zero. Summary counts include recorded values only. Door-to-door
   output preserves unknown/No flags instead of treating blanks as No.
4. Choose an action. Existing matching rules supply same-name candidates within
   the census barangay; suggestions are not identity confirmation. No candidate
   is selected automatically. Previously selected active owners remain available
   for re-comparison if their name changes.
5. Merge, replace, and keep require an explicit selected owner, a side-by-side
   comparison of the census and registry owner with all linked pets (including
   archived pets), a reason of 3–1,000 characters, and confirmation of the choice.
6. Save the decisions, then open **Approve**. The summary checks current saved
   decisions, lists each action/reason, and separates owner action counts from
   submitted pet totals. Submitted totals include excluded/kept entries and are
   not labelled as new pets. Confirm to apply approval atomically.
7. Approved owner entries expose **View registry owner and pets** where the
   resulting active record remains accessible. Excluded entries have no link.
   Kept entries link to the selected existing owner. Older approved entries
   without an exact saved result ID are not assigned a result by name guessing.

### Meaning of each action

| Action | Effect |
|---|---|
| Create a separate owner and pets | Creates the submitted owner and pets; existing identities stay separate. |
| Combine with a confirmed owner | Keeps current owner values; fills missing pet details and combines recorded Yes flags. Unknown incoming flags preserve known flags. Adds pets without an active same-name/species match. |
| Update a confirmed owner from this census | Updates address and supplied contact; updates active same-name/species pets using the existing census rules, including unknown vaccination/sterilization flags. Adds unmatched pets; other linked pets remain. |
| Keep existing records unchanged | Does not apply this owner entry or pets; retains the selected registry owner unchanged. |
| Exclude this owner entry | Does not publish this owner entry or pets; the submission entry stays in history. |

The existing census merge/update pet matching uses name and species within the
explicitly selected owner. Staff must verify these identities in the comparison.
Multiple active same-name/species pets, repeated incoming pet identities, and
multiple owner entries targeting the same owner block approval. This phase does
not implement a general identity merge tool or automatically choose an owner.

## Consistency and history

- Comparison tokens are signed, bound to the staff account, incoming entry,
  selected owner, action, linked pets, and workspace fields, and expire in ten
  minutes. Changed comparisons cannot be saved. A saved comparison must still
  match current records at approval; expired approval summaries must be reopened.
- Approval summaries have signed, account-bound ten-minute tokens covering the
  saved census decisions and current matched records. Both review and status
  approval endpoints check them. Rejected/withdrawn submissions must first be
  reopened as pending before a new approval review.
- Registry/census writes share the existing transaction lock. Invalid decision
  batches roll back together. Unsaved decision choices survive background reloads.
- Migration **019_census_review_consistency.sql** adds match reasons/fingerprints,
  exact applied-owner IDs, and decision activity. It does not invent reasons for
  past decisions. Older pending matches require a fresh comparison. Existing
  approval undo/redo snapshots and history remain intact.
- Activity captures actor, before/after decisions, reason, and time. Correcting
  a pending sheet resets current decisions but retains prior decision activity.
  Admin detail shows the latest 100; older entries remain in protected backups.
  Existing unapproved-submission deletion rules are unchanged.
- Paravets cannot call comparison/approval endpoints or see staff match/history
  payloads. They retain their own submission access and barangay registry scope.
  Registry links still rely on current registry authorization on opening.
- Summary checks load matched owners, pets, and workspace fields in batches;
  they do not issue a separate database query for each owner on the sheet.

## Local validation and user trial

Local production build and type checks passed. **156 tests across 23 files**
passed with a fresh disposable database, including required matches/reasons,
actor/action-bound reviews, rollback, stale comparisons/summaries, role and
barangay restrictions, unknown/No/zero values, approval outcomes/search links,
protected backup inclusion, repeated targets, and preserved decision history.
The actual downloadable workbook and grouped CSV were parsed and taken through
submission, reviewed approval, scoped registry lookup, and search in an integration
test. Existing census, workbook, QR, attendance, registry, and undo/redo tests passed.
The pre-existing main/Excel bundle-size advisory remains.

An initial in-app browser access problem was resolved after the user reopened
the preview. Built-browser checks covered the empty match selection, required
comparison/reason/confirmation, pet details and unknown/No/zero values, saving
decisions, approval summary, successful approval, and opening the resulting
registry owner with linked pets. Escape closes the registry dialog. Browser
console inspection showed no captured errors. The narrow viewport stacks the
comparison cards; wider layouts place them side by side. Physical printing and
a broader device/accessibility review were not performed.

Screenshots: `output/census-approval-summary.png` and
`output/census-review-ready.png`. After checking the flow, the disposable preview
was restarted with fresh pending practice records for the user's trial.

Try the process:

1. Use `npm run build`, then `npm run preview:registry` if the preview is stopped.
   It uses in-memory sample data, never `.env.local` or `.local-test-db`.
2. Open <http://127.0.0.1:5178/census/review/pending> and sign in with the
   synthetic Super Admin `localstubadmin` / `StubDemo!2026`.
3. Open **Practice census review — match and new owner**. Choose Combine for
   **Practice Census Owner**; confirm the owner dropdown starts empty, select
   its candidate, and compare Practice Mochi before giving a reason.
4. Choose Create for **Practice New Owner**. Its pet shows zero months,
   unknown vaccination values, and an explicit No separately.
5. Save decisions, inspect the approval summary, then approve. Follow the registry
   links and verify the updated/created owners and pets.
6. Restarting the preview resets practice records. The current Paravet key and
   practice submission ID are in `tmp/registry-preview.json`.

No push, deployment, Supabase migration, or existing local database change was
performed. Migration 019 has only been exercised in disposable local databases.
