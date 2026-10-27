# Census import, registry search, and QR images

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Local development phase, 2026-10-18. The first three stages of the approved
build order are implemented: QR image reading, census-to-registry integration,
and traditional Excel/CSV import. As confirmed on 2026-10-19, paper-photo OCR/API
plans are cancelled. No paper-recognition endpoint or service was implemented.
Attaching a photo remains the existing stored manual-encoding workflow, with
existing attachments and history preserved. Browser-only QR image reading stays
available.

The subsequent [census review and approval phase](./CENSUS-REVIEW-AND-APPROVAL.md)
adds explicit comparisons/reasons, current approval summaries, decision history,
and resulting registry links. Its validation and local trial instructions are
recorded in that guide.
The supplied completed photo has not been copied into project data or sent to
an external recognition service.

## Try the process

Start the disposable preview with `npm run preview:registry` after a local build.
It serves <http://127.0.0.1:5178> and never reads `.env.local` or opens the existing
local database. Restarting resets the synthetic accounts and records.

The current synthetic Paravet key and password are in `tmp/registry-preview.json`.
The synthetic Super Admin uses `localstubadmin` / `StubDemo!2026`. Those credentials
work only in this disposable preview. The Paravet key changes on each restart.

### Census import and approval

1. Sign in as the synthetic Paravet and open **Census → Import**.
2. Download the Excel form, fill the blank owner/pet cells, and save as `.xlsx`.
   For a quick CSV trial, use `output/practice-census.csv`.
3. Choose the file. For numeric Excel ages with no written unit, explicitly
   select Years or Months in the import screen. Alternatively, write `2 years`
   or `6 months` in the workbook's existing Age cells.
4. Correct any sheet/row issues, then inspect the editable owners and pets.
   Blank vaccination and sterilization fields remain **Not recorded**.
5. Review the submission and submit it. It remains pending.
6. Sign out, sign in as the synthetic Admin, and open **Census → Pending**.
   Review each owner decision, then approve the census.
7. Search the approved owner/pets in **Registry**, global search, or
   **Stubs → Encode attendance → Find a registered owner and pets**.

The preview also has an already approved **Practice Census Owner** with one pet
to try registry/participant search immediately. Census approval does not issue a
stub, reserve a program slot, or record attendance.

### QR image trial

Open **Stubs → Encode attendance → Redeem a stub → Choose QR image**. Use
`output/practice-stub-qr.png`, which the preview generates for an unused synthetic
stub. Review the decoded stub before recording attendance. It remains reusable
until attendance is submitted; afterward normal redemption protection applies.

## Excel form contract

`public/templates/door-to-door-census.xlsx` is an editable reproduction of the
supplied paper layout, rather than a flat import table:

- City/office/form headings, barangay and census date.
- Three repeated owner/address/contact sections.
- Five numbered pet rows per section.
- Grouped Type of Pet, Breed, Sex, Classification, and Vaccination Status headers.
- Original Age column, Remarks, Prepared By, signature line, and Paravet footer.
- Monochrome borders, merged headers, no added age-unit column or instruction tab.
- Landscape A4 print metadata and one-page print area `A1:T38`. The photographed
  paper size was not specified; the page layout, not its camera distortion or
  paper texture, is reproduced.

Owner values go in the blank row beneath each owner header. Pet names go beside
the printed row numbers. Selected boxes accept X, checkmarks, slash marks, or Yes.
Explicit No is supported; blank means unknown. Separate owner sections remain
separate even if their names match. Staff can correct sections before submission;
there is no name-based automatic owner merge.

Use copies of the form sheet for additional pages, with the same barangay and
census date. Current import limits are 20 sheets, 200 owner sections, 1,000 pets,
30 pets per owner entry, and an 8 MB input file. XLSX and CSV are supported; old
binary `.xls`, macros, and formulas are not accepted as census values.

The CSV template uses one pet per row, an explicit `owner_group_id`, and separate
age/unit columns. Conflicting identity details within one group are errors. The
older CSV header format is still accepted; blank flags now stay unknown there too.

## Registry identity and history

Migration 017 adds stable source-to-workspace aliases and database publication
triggers. Existing census registry owners/pets become visible in the same staff
workspace and search queries. Existing staff identities are not combined by name.
Duplicate candidates stay separate for manual review.

Staff edits write through to the structured census registry in the same
transaction, so there are no separately editable copies in the UI. A census pet
can be transferred to an explicitly selected staff owner; the owner receives a
stable structured alias without creating another visible staff owner. Census
submission contents and past attendance remain historical snapshots.

Approval reversal checks both structured registry values and the complete
workspace values, including extra fields. Later conflicting edits block undo or
redo. Safe withdrawal archives the corresponding workspace aliases; they cannot
be manually restored to bypass approval. Redo uses the same IDs. Archive/restore
keeps independently archived pets separate from the owner's archive cohort.

Older approval snapshots without workspace details are treated conservatively
when workspace activity exists. Ambiguous same-name/species pet matches are
blocked before an owner merge/replace decision can select the wrong pet.

Migration 018 permits unknown flags in census and registry pet storage. Existing
false values remain unchanged; no historical meaning is invented. Merging unknown
incoming flags preserves existing known values. Positive summary counts include
only recorded Yes values. Blank is not a recorded No.

Super Admin JSON backups include source aliases, structured census/registry rows,
review snapshots, status history, and workspace history. The photo-attachment
workflow retains its existing separate image storage/retention behavior.

## Access and privacy

Paravets import into their assigned barangay and submit for review. Admin/Super
Admin review and approve. Registry correction rights remain Admin/Super Admin.
Participant lookup checks the program's eligible barangays and the staff role;
Paravets can select residents of their own assigned barangay only. All roles use
the existing program/stub permissions and attendance validation.

QR images are decoded in a browser worker, with no image upload/storage request.
They are released on removal, replacement, or dialog close. The worker is stopped
on completion/cancellation/timeout. Multiple codes require selection; image reading
never redeems a stub automatically. Limits: JPG/PNG/WebP, 12 MB, 32 megapixels;
large images are resized for decoding. Staff can rotate/retry or paste a code.

## Verification and cancelled paper-recognition scope

Build and type checks passed locally; **149 tests across 22 files passed** in
the final disposable run. The suite covers the
downloaded workbook, grouping, units, conflicting marks, formula rejection,
QR images/multiple codes, approval publication, role scopes, explicit owner links,
unknown flag preservation, stable undo/redo IDs, archive cohorts, and conflicts
after edits to workspace-only fields. Browser checks cover QR image selection,
stub review, approved-census participant selection, XLSX loading, and CSV review.

Paper-photo OCR/API development is cancelled, including the private recognition
service, recognition pilot, and camera/file-to-text draft workflow. No recognition
code, dependency, endpoint, or service needed removal. Staff can continue entering
paper census data manually or importing completed Excel/CSV files. Manual photo
attachments remain available for staff encoding under the existing access and
retention rules; existing attachments and history are preserved. QR camera
scanning and browser-only QR image reading remain available.

The cancellation changes project documentation only; application code and data
are unchanged. The verification results above belong to the implemented import
phase; build and tests were not rerun for this documentation update.

No push, deployment, Supabase migration, or existing local database change was
performed. The main bundle advisory remains; Excel parsing is loaded only when
an XLSX is selected, and QR image decoding loads in its worker on demand.
