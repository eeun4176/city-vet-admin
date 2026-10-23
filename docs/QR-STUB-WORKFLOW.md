# Staff QR stubs and attendance

Programs and Program day now share the [Program workspace](./PROGRAM-WORKSPACE.md).
Interest, program-scoped stub stock, and attendance are available inside each
program. The standalone Stubs entry remains available for batch management.

The system supports the existing paper workflow. Owners do not need an account,
phone, or computer. Recording interest does not allocate or issue a stub.

## Staff flow

1. Choose a scheduled program in **Program interest**. The host barangay is
   eligible by default; Admin can approve additional participating barangays.
2. The assigned Paravet requests a quantity of stubs. Admin can also request a
   batch for an active Paravet in an eligible barangay.
3. Admin approves a quantity, opens the private print preview, prints, then
   explicitly confirms printing. Cancelling the browser print dialog does not
   mark the batch as printed.
4. Admin records the handover when the Paravet collects the physical sheets.
5. After assessment, the Paravet gives the owner a paper stub. They may encode
   its owner and 1–3 pets immediately, or continue the manual paper process.
6. On program day, assigned staff scan the QR or find a previously encoded stub.
   Scanning only opens the record. Final attendance submission consumes it once.
   A handed-over stub distributed manually can have its issuance and attendance
   recorded in the same submission. Walk-ins use a separate entry form.

One owner can hold multiple stubs for different pets and can participate in
later programs. A stub is always tied to one program and one allocation barangay.
No QR contains owner or pet information.

## Printing

Owner slips measure 90 × 40 mm, with 12 per A4 sheet at 100% scale. Each contains
only the existing office logo, program title, date, location, and QR. The QR is
generated in the browser without a third-party image service. Reprinting retains
the same codes; a used or cancelled code does not become valid again.

## Records and access

Paravets have permanent access to the modules, scoped to their current assigned
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
