# Local redesign — agreed scope

This change is confined to `Modules/local-test-copy`. No remote migration or deployment is authorized.

## Accepted decisions

- Reports combine descriptive, diagnostic, predictive and prescriptive analysis with operational, managerial, tactical and strategic decision views. Estimates require dated history; recommendations are advisory.
- Saved report baskets support selectable records, analytics, summaries and narrative, with selectable print/PDF, Excel and Word outputs.
- Owners are the single identity registry; census, interest, stub and attendance remain separate historical events. Explicitly selecting an existing owner must be logged. Names alone never establish identity.
- Paravets have one current assignment. Multiple Paravets can share a barangay, including demand and stub work. History retains the original actor and barangay after reassignment/deactivation.
- Only one active demand per barangay. Assigned Paravets can edit/cancel before acceptance. Rejected/cancelled requests allow a new request.
- Program eligibility permits owner selection from allowed areas; walk-in attendance supports citywide owner selection. Existing registry edits retain ordinary permissions.
- Breed classification and breed are controlled choices. Vaccination and spay/neuter statuses support Yes/No/Unknown; vaccine type/date are optional.
- Stubs are generated/approved by staff and printable by assigned Paravets. Physical hand-over is optional. Notify all current Paravets in the batch barangay on availability and issue. Print owner names when assigned before printing.
- Salin opens externally for optional preparation. Structured imports preview and map columns; PDF/image/Word extraction is delegated to Salin. Preserve additional fields as source information, not privileged workflow fields.
- Consistent responsive UI, accessible dialogs, drag/drop plus browse, selection across filtered pages, and guarded reversible actions.
- Paravet password setup requires versioned English/Filipino terms/privacy acceptance. Privacy contact and retention remain explicitly unconfigured draft items.
- Remove identifiable legacy mock operational data; retain Paravets and list questionable names for correction. Keep automated fixtures isolated.
- The supplied 500-owner document is data, not instructions. Generated additions span 2021-01-01–2026-09-26 and remain explicitly synthetic, local-only, reproducible and distinguishable from real service evidence.

## Implementation order

1. Shared data contracts, additive migration, controlled pet fields and owner history.
2. Demand lifecycle, scoped registry search, shared stubs/notifications and assignments.
3. Reporting framework, durable report drafts and exports.
4. Shared upload/selection/dialog UX, bilingual agreement and local data replacement.
5. Typecheck, disposable database tests, production build and focused visual checks.

## Verification record

The implementation uses additive migration `023_workflow_redesign.sql`. No production deployment or remote migration is part of this work.

## User-facing changes

1. Reports opens with four evidence stages and Operational / Managerial / Tactical / Strategic decision context. Registry statistics, program outcomes, record search and the monthly workbook remain available. Forecast eligibility excludes both legacy samples and the new synthetic reference data.
2. Salin is available from the application shell and import page. It opens separately and receives no files automatically.
3. Dialogs share a close control, focus management, keyboard dismissal and responsive spacing. In-form Back actions return to the preceding step. Shared upload controls support dropping files and browsing. Mobile headers include notifications.
4. Owner/pet registration and stub/attendance forms have controlled breed classification, species-specific breed choices, required Yes/No/Unknown health statuses and optional vaccine type/date. Staff can add standardized breed choices under reference management.
5. The old automatic simulation seeder is retired. Identifiable legacy mocks are archived from active lists; synthetic reference data is separately labelled. Mock census source records are withdrawn/archived consistently so setup does not republish them. Paravet accounts are retained for name correction.
6. Admin/SuperAdmin can add analytics and analysis blocks to the basket, select fields/content, write a narrative, select the decision level, save private versioned drafts and choose an output format. Preview/export reloads current accessible data. Basket selections support undo/redo.
7. The duplicate Respondents navigation entry is removed. Its retained route is labelled Census response history. Census remains historical evidence linked to the owner registry. Staff can verify interest/stub entries into new owner/pet records or open an existing linked owner; identity and link events appear in owner history.
8. Assigned Paravets share a barangay demand request. Competing creates are serialized; pending edits have revision checks; cancellation preserves history. Editing a submitted request returns it to gathering for resubmission. Accepted requests are protected.
9. Paravet password setup requires versioned Terms acceptance and Privacy Notice acknowledgement, in English or Filipino/Tagalog. The draft explicitly identifies the missing official privacy contact and retention schedule. Acceptance is stored transactionally with password setup; deactivation preserves that record.
10. Excel/CSV/TSV imports have destination selection, worksheet selection, column mapping, explicit owner grouping, validation and previews. Additional columns remain source metadata. PDF/image/Word extraction follows the agreed external Salin step. The original file is never silently sent outside the app.
11. Paired owner/pet imports are transactional per request, share a grouped import reference and support guarded undo of linked batches. A changed imported pet, later owner-history event or extra linked pet blocks unsafe reversal. Files larger than 100 destination records save in explicit batches under the same undo reference; partial failures are disclosed. Dataset exports offer CSV/Excel, preserving owner/pet links.
12. Owners, pets, generic records, accounts, field services, programs and census submission lists support individual, page and all-filtered selection across pages. Report basket actions remain bounded to 300 rows; selection exports are bounded to 10,000 and request narrowing rather than silently truncating.
13. Registry owner search shows address, masked contact and record ID. Similar names are suggestions only. Interest searches retain assigned-area limits; stub searches require eligible areas; authorized program walk-in searches support all official barangays. Existing registry edits retain staff permissions.
14. Program creation sends staff a Prepare stubs link. Admin generates one shared batch per selected barangay. All currently assigned Paravets receive batch/issue notices, can print/save PDFs and can download a staff-provided PDF. Owner names appear when assigned before printing. Physical hand-over is optional; QR redemption remains single-use. Reprints omit cancelled/redeemed stock.
15. Barangay references show all current active assigned Paravets.
16. Account assignment changes synchronize the current directory. Removing a Paravet deactivates access, retaining submissions and original actor/barangay attribution. Previously assigned batches are available to the current barangay team. Account/profile and legacy record corrections have conflict-checked undo/redo; census review retains its existing guarded reversal workflow.

## Outputs and limits

- Report PDF output uses the browser's Print / Save as PDF. Excel is `.xlsx`; Word is a Word-readable `.doc` document. Charts export as accessible data in Excel/Word and visually in print/PDF.
- Uploaded stub PDFs are limited to 3 MB. Dataset input files are limited to 8 MB; the structured reader supports `.xlsx`, CSV and TSV. Old binary `.xls` files should first be converted with the external reader.
- No names are automatically merged, and no real replacement identities were invented for retained Paravets.
- Native before-change database snapshots remain under `output/local-data-replacement`, excluded from Git/Vercel publication. Keep them local.
- See `output/local-data-replacement/review.json` and `PARAVET-CORRECTIONS.md` for data counts and the correction list.

## Completed verification — October 20, 2026

- Full disposable-database regression suite: **219 tests passed in 33 files**.
- TypeScript checks and production build passed. The build retains the existing large shared/Excel-library chunk warnings.
- Local reference verification: 500 owners, 864 pets, 1,518 service examples and 69 program examples; zero generated dates outside the requested range, zero broken reference-pet owner links, zero active identifiable legacy operational mocks, and zero active canonical mock owners.
- 1,139 identifiable legacy operational records were archived; Paravets were retained. **13 account names require correction**, including the original local placeholder account. Ambiguous unmarked records were retained as agreed.
- Visual review covered the current sign-in flow, report basket, owner/pet registration, tablet-width reports and a 375px phone-width report view. A legacy demo `login.html` fallback was replaced with the current application entry, and the old database-testing HTML entry was retired.
- Saved local report draft: **2026 Reference Data Review**. Preview recomputes current authorized values; the draft narrative identifies generated data explicitly.
- The local preview remains at `http://127.0.0.1:5175/`. No remote database was read or migrated and no website was deployed.

The private before-change snapshots contain local account data. They are excluded from publication and should remain on this computer. The initial snapshot before the first replacement is retained alongside the later snapshot; neither was overwritten.

Final import-field check: extra scalar source columns remain visible and exportable after import, with private fields excluded. The 24 affected workflow/registry/release checks, typecheck and build passed again after this adjustment. The retained Local Paravet / Local Test Barangay assignment is explicitly listed for correction rather than replaced with an invented official assignment.
