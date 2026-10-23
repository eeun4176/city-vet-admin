# Search and navigation consistency

Local phase, 2026-10-19. The user approved current records by default, optional
history, and Paravet search covering workflows already within their access.
No new role permission, production migration, or push is required by this phase.

## Sources

Global search and Dashboard → Recent updates share one source-aware reader.
Results are short metadata summaries with a source label, status, unique source
key, and a stable preview URL. Program attendance is one visit with its pets,
not repeated procedure mirrors. Standalone visits are read directly, so visits
with only Deferred/Not eligible outcomes remain findable. Approved census
respondents are read from accepted census entries, separately from their registry
identity and original submission. No identities are merged to deduplicate results.

| Source | Default records | Available through Include history |
| --- | --- | --- |
| Owners / Pets | Active registry identities | Archived identities |
| Census submissions | Pending and approved | Rejected and withdrawn |
| Census respondents | Accepted owner entries in approved submissions | Superseded/non-approved entries remain accessible through their permitted census submission, not as current approved respondents |
| Programs | Non-archived programs, including completed programs | Archived programs |
| Interest lists / people | Open lists and interested people | Rejected/closed lists, withdrawn people, lists under archived programs |
| Attendance | Submitted actual visits | Voided visits or attendance under archived programs |
| QR stubs / batches | Issued, redeemed, available inventory and active batches | Cancelled tickets, rejected batches, records under archived programs |
| Standalone visits | Submitted visits, including no completed procedure | Voided visits |
| Staff accounts / Paravet directory | Permitted active directory/account records | Permitted archived records |
| Older respondents, participants, services, stubs, households, animals | Excluded from default search | Clearly labelled manual/imported history; read-only preview |

“History” describes record lifecycle/source, not simply a past calendar date.
Valid past service/attendance and completed program records remain searchable.
Unissued individual stubs are omitted from Recent updates to avoid filling the
list with a newly printed batch; the batch itself represents that update. They
remain searchable. Synthetic sample-tagged registry/generic records are excluded;
the disposable preview's fictional practice records are ordinary test fixtures.

## Access and privacy

Every search, Recent updates request, and preview checks the current authenticated
account and current feature switches. Source eligibility uses the existing
capabilities. Super Admin retains its existing feature-switch exemption.

- Paravets see their assigned barangay's owners and pets, their own census
  submissions, and programs where their barangay is the host or is currently
  invited. Interest people and attendance additionally require the person's
  residence/attendance barangay to match the Paravet's assignment.
- Paravet stub batches require their own recipient allocation and barangay;
  ticket visibility follows the existing QR lookup's owner/batch area rule plus
  current program eligibility. A ticket preview only offers a batch link when
  that Paravet may open the batch.
- Paravets do not gain standalone service, staff-account, approved Respondents,
  or historical field-record administration access.
- Admin account results include Paravets only. Super Admin can find other staff.
  Retired User accounts are excluded. Account sign-in keys are not returned in
  result summaries or previews; Admin cannot search by a key hidden by its account
  management view.
- Registry, operations, census, accounts, and field-team switches apply to the
  relevant source. A previously copied preview URL cannot bypass changed access.
- Search text is an explicit field list. QR redemption tokens, image payloads,
  passwords, credentials, and arbitrary private JSON fields are not searched.
  Canonical ticket previews explicitly select non-token fields. Registry/legacy
  preview fields use the existing public-record sanitizer. No image data is
  loaded just to search or count records.

Results are not permission grants. A record may disappear or produce an
unavailable message after reassignment, feature changes, census reversal, or
other staff actions. Previews always re-read current access.

## Destinations and UI

`/records/view?source=…&id=…` reads the exact source ID independently of list
pagination. It shows source details, known owner/pet information, recorded
procedure outcomes, and the latest available source history. Missing information
stays Not recorded; recorded No and zero remain distinct. Census pet previews
retain the census owner name to keep multi-owner sheets clear. Large census and
registry preview groups show explicit limits and offer their full workspace.

Previews link to permitted existing workspaces using actual record/program IDs,
not assumed campaign IDs. Interest lists and stub batches accept explicit URL
IDs and load their specific dialog independently of the list's first page.
Archived programs and legacy datasets without an active editor remain readable
in the preview without an invalid edit link. Opening history never restores it.
The sidebar retains the source section while the preview is open; a census
preview does not falsely select Pending or Approved before its status is read.
Preview reads do not mark an entire category's update dot as seen.

Search provides a visible spinner, cancellation of superseded queries, an error
and retry state, literal wildcard escaping, exact/prefix name ranking, and a
refine-search hint when capped. Tab reaches the history filter and result links;
Down enters results, Up/Down moves between results, and Escape closes the popup.
Controls and links work at desktop and phone widths. Include history starts off
for each account session. Recent updates has its own history toggle and Refresh
button, refreshes every 60 seconds while visible, and uses the same source rules.

Page-load errors, including an old tab requesting a file replaced by a newer
build, show an explicit Reload page / Dashboard recovery screen. There is no
automatic reload that silently discards a draft.

## Performance and verification

A read-only transaction resolves current source access and executes a bounded
metadata query. Search returns at most 30 records and a hasMore flag; Recent
updates returns 10. Only the selected preview loads its source details. Program
runtime edits contribute to the program's latest update time. This phase adds no
search index or persistent search copy that could drift from the source tables.
Production-scale latency still needs measurement against real record volumes;
the local tests do not establish Vercel/Supabase production response times.

Local build/type checks and **188 tests across 28 files** passed. Added integration
coverage includes canonical source discovery, no-completion visits, history,
assignment/invitation/recipient boundaries, disabled features, stale URLs, QR and
private-field exclusions, exact destinations, limits/ranking/wildcards, Recent
updates, archived-program previews, and sidebar/recovery display behavior.

The preview runs at `http://127.0.0.1:5178` through `npm run preview:registry` using
an in-memory disposable database. It never reads `.env.local` or opens the existing
`.local-test-db`. Try searching **Practice**, then toggle Include history; search
**deferred-only** to find the visit with no completed procedure; open a record
preview and its source link. The local synthetic login remains
`localstubadmin` / `StubDemo!2026` if a fresh sign-in is needed.
