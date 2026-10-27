# QR stubs and attendance

> **Updated 2026-10-27** for the blank-stub workflow with e-Vet Field. The printing and records sections below still apply.

Programs and Program day now share the [Program workspace](./PROGRAM-WORKSPACE.md).
Interest, program-scoped stub stock, and attendance are available inside each
program. The standalone Stubs entry remains available for batch management.

The system supports the existing paper workflow. Owners do not need an account,
phone, or computer. Recording interest does not allocate or issue a stub.

## Flow

1. **Demand.** Paravets build their barangay's shared program request in e-Vet
   Field: interested owners, each with at least one pet. The office approves,
   merges and schedules it as a program day in **Program interest**.
2. **Blank stubs.** In **Stubs → Generate stubs**, Admin creates a batch of
   numbered blank stubs for a barangay and program (a Paravet can ask with
   **Request stubs**). Each stub has its own QR code, which holds only a random
   code.
3. **Printing.** The batch can be printed (or saved as PDF) only once the barangay
   has requested owners, or has already encoded some. It is printed at the office
   or sent to the barangay to print in e-Vet Field. Recording the physical
   hand-over (**Confirm received**) is optional.
4. **Encoding.** After assessing an owner, the Paravet hands over a stub, then
   encodes it in e-Vet Field: the stub number, the owner, and up to three pets
   with their services. Admin can do the same here with **Issue after
   assessment**. Stubs are listed as **Not encoded** or **Encoded**.
5. **Program day.** Paravets download the day pack, then scan stub QR codes in
   e-Vet Field, even offline. A scan counts only on the program's date, and each
   stub only once. Each encoded stub shows as **present** once scanned, and as
   **absent** if it is still unscanned when the day is over. Walk-ins have their
   own form. Paper attendance can be encoded here in **Encode attendance**.
6. **Results.** Attendance feeds the Analytics KPIs (attendance rate, no-shows,
   walk-ins, completion).

One owner can hold several stubs for different pets and can take part in later
programs. A stub is always tied to one program and one barangay. No QR contains
owner or pet information.

## Printing

Owner slips measure 90 × 40 mm, with 12 per A4 sheet at 100% scale. Each contains
only the existing office logo, program title, date, location, and QR. The QR is
generated in the browser without a third-party image service. Reprinting retains
the same codes; a used or cancelled code does not become valid again.

## Records and access

Paravets work in e-Vet Field (they cannot sign in here), scoped to their current assigned
barangay and approved programs. Batch requests and issuance are limited to their
own allocation. Attendance can be encoded by another assigned Paravet in the same
barangay. Admin and Super Admin can manage approved allocations across barangays.

Actual attendance dates can be backdated but cannot be in the future or precede
the program date. Completed programs can accept delayed paper encoding while
their collection list remains open. Closed lists require Admin access and a
written late-entry reason. Cancelled, postponed, and archived programs do not
accept attendance.

Owner and pet snapshots are saved atomically. Issued identities cannot be
substituted during redemption. Possible repeated owner/pet/process entries in
the same program require explicit review and a reason; nothing is auto-merged.
Request IDs make retries safe, and each QR can be redeemed only once.

Incorrect attendance is voided by Admin with a reason. Its history remains, its
service/participant report copies are archived, and its QR stays consumed. Those
report copies cannot be edited, imported over, archived, or undone through the
ordinary record tools. Slots used count participating pets; completed services
count each completed process. Audit entries store record references and actions.
The attendance summary counts owner visits. Matching names are never assumed to
prove that two records belong to the same person.

## Local validation

Apply database migration 012 after 011. The Super Admin backup includes the new
batch, ticket, attendance, and activity tables. Historical generic stub records
are retained at **Stubs → Historical stub records**.

Build locally first with `npm run build`, then run `npm run typecheck` and
`npm test`. The test runner creates an in-memory disposable database and never
uses the existing local database or Supabase credentials. `npm run preview:stubs`
starts the built app against another disposable database containing synthetic
demo records. Stop the preview process to discard those records.
