# Local acceptance checklist

## Start here

Open **http://127.0.0.1:5179**. Accounts, the current Paravet key, the barangay,
date, batch references, and practice files are listed in
`output/acceptance/START-HERE.md`. All records are fictional. Use fictional details
when testing. This separate, in-memory database disappears when its preview stops;
it does not read `.env.local`, `.local-test-db`, or Supabase credentials.

Sign out before changing roles. Localhost ports share browser cookies, so finish
this session before returning to a different local preview. After a restart, use
the regenerated key and QR image. Test on the displayed program date; restart on
a later date to get a new program for that day.

Mark each step Pass / Issue / Not tested. Physical printing and real camera tests
need your equipment. A cancelled print dialog is not evidence of successful printing.

## A. Programs and stubs — test first

Use **[PRACTICE] Pet Care Program** under Program day → Current. It starts Open
with **0 owner visits / 0 pets / 0 completed services** and a deliberately small
capacity of **2 pets**. There are 12 already handed-over unused stubs and a separate
pending request for 6; their exact references are in START-HERE.

| Step / role | What to do | Expected result |
|---|---|---|
| A1 · Paravet | Sign in using the generated account key. Open the practice program and its Interest tab. Add a fictional interested owner and pet. | The assigned Paravet is in the roster. Interest increases, attendance stays zero, and no stub is issued. |
| A2 · Paravet | Open Stubs. Inspect the existing request for 6, then optionally request another small batch. | Requests show Requested. Paravet cannot approve, print, or confirm handover. |
| A3 · Admin | Sign out/in as Admin. Open the request for 6 and approve 6. | Exactly 6 tickets are created; status Approved. Issuance is not available yet. |
| A4 · Admin | Open Print owner stubs. Inspect the slip. Close the preview without confirming. | Only logo, program title, date, location, and QR are printed. Size is 90 × 40 mm, up to 12 per A4 sheet. Status remains Approved. |
| A5 · Admin | Reopen printing. Print at 100% on A4, or save a practice PDF. Confirm printing only after success, then confirm handover/received. | Status changes Approved → Printed → Handed over. Reprinting keeps the same codes. Saving PDF checks the flow but does not prove physical printing. |
| A6 · Admin | Open Overview → Record start and confirm the actual time, now or earlier on the program date. | Status becomes In progress; actual start appears. A future actual time is rejected. Paravet has no start/finish control. |
| A7 · Paravet | Open the **original 12-stub handed-over batch**, first available stock item → Issue after assessment. Enter **Practice Assessment Owner**, a fictional address, Milo (Dog/Male/24 months), Luna (Cat/Female/6 months). Select Milo: Microchipping + Anti-Rabies; Luna: Neuter/Spay. Review and save. | One owner and 2 pets are saved together. Stub becomes Issued; attendance remains zero. The QR image supplied in the practice folder belongs to this first stock item. |
| A8 · Paravet | Attendance → Redeem a stub → read `practice-stub-qr.png` from the practice folder. Close before submitting, then open it again. | Owner/pets load without changing the stub to Redeemed. No image is uploaded or stored. A real camera scan can be checked separately. |
| A9 · Paravet | Redeem again. Record Milo: Microchipping Completed, Anti-Rabies Deferred; Luna: Neuter/Spay Completed. Submit once. | **1 owner visit / 2 pets / 2 completed services**. Source Stub, and the deferred process stays visible. |
| A10 · Paravet | Read the same QR again. | Clear already-redeemed message; no second attendance record. |
| A11 · Paravet | Encode a walk-in for **Practice Walk-in Owner**, one Dog/Female/12 months, Anti-Rabies Completed. | **2 owner visits / 3 pets / 3 completed services**, with distinct Stub and Walk-in sources. Capacity warns at 3/2 but saves actual attendance. |
| A12 · Super Admin | Sign in, inspect the same program and Reports, then record actual finish after its start. | Both attendance sources and totals agree. Program becomes Completed. Paper encoding remains possible while collection is open; finishing does not silently close collection. |

If you add extra attendance, adjust the expected totals rather than deleting history
to force these values. Admin can void an erroneous record with a reason; its QR
must remain consumed.

## B. Census → approval → searchable registry

| Step / role | What to do | Expected result |
|---|---|---|
| B1 · Paravet | Open Import door-to-door census; choose `practice-census.csv`. | Editable review shows **2 owner sections / 3 pets**. One owner has two pets; the other has one. No submission is made just by choosing the file. |
| B2 · Paravet | Inspect unknown marks, explicit No, and Practice Import Baby's age. Set a unique label such as Practice CSV acceptance and 2 households visited. | Blank marks say Not recorded; No stays No; age **0 months** stays zero. |
| B3 · Paravet | Review census submission → Submit for Admin review. Open My submissions. | One Pending submission. Unapproved imported owners are not yet available as approved registry records. |
| B4 · Admin | Open Pending and your imported submission. Review all owners/pets; choose Create a separate owner and pets for these separate practice identities, then save decisions. | All owners require an explicit decision; no existing candidate is selected automatically. |
| B5 · Admin | Open approval summary, verify 2 owners and 3 pets to create, then approve. | Status Approved. Result links open the correct owner with their linked pets. |
| B6 · Paravet | Search Practice Import Owner in Owners, global search, and the program's registered-owner picker. | All three find the approved owner in the assigned barangay. Their two linked pets are selectable. Search alone does not record attendance. |
| B7 · Admin | Open the separate seeded pending sheet **Practice census review — match and new owner**. For Practice Census Owner, explicitly choose the existing owner and compare all linked pets. Choose the appropriate keep/merge/replace action and provide a reason. | Matching is never automatic. Comparison and reason are required for an existing-owner decision. Unknown/No/zero remain distinct. Confirm the summary before approving. |
| B8 · Paravet, optional Excel check | Fill a copy of the supplied blank XLSX: assigned barangay and today/past census date, fictional owner/address, pet name, species and sex marks, and an age such as `2 years`. Import, review, and submit it separately. | Original 3-owner/5-pet paper layout remains. Missing age units or conflicting marks are flagged; they are not guessed. Repeat B4–B6 for approval/search. |

## C. Shared checks

- Pending counts remain until work is resolved. Update dots clear only after the
  relevant category loads successfully; your own changes do not create update dots.
- Loading feedback appears while opening details, reading a file, or saving.
  No repeated save should create an additional attendance record.
- Refresh to inspect another staff member's update, or allow up to 30 seconds for
  visible active-program views and up to 60 seconds for summaries/badges.
- Test narrow screens and keyboard navigation. Note clipped text, hidden controls,
  lost form details, unclear errors, or unexpected permission differences.

## Report an issue

Copy: **Step · Role · Record/batch reference · Expected · Actual · Screenshot**.
Do not include real owner details, passwords, or personal documents.

## Repeat the practice

Run `npm run build`, then `npm run preview:acceptance`. Port 5179 is strict: an
occupied port fails instead of silently connecting to another database. Stop only
this practice process before restarting it. Each start generates fresh data/files.

For automated rehearsal, use `npm run preview:acceptance -- --rehearsal` on port
5180, then `npm run check:acceptance`. The checker refuses the user-practice manifest
and port. It mutates rehearsal data and is intended to run once per fresh rehearsal.
It covers real password login, roster/scope restrictions, approval/print/handover,
redemption/retry/reuse, capacity overflow, timing, CSV approval, and registry/global/
participant search. UI, physical printing, and camera behavior need separate checks.
