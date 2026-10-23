# Analytics methodology and change log

This public methodology page documents the definitions linked from analytics and printable reports.

## Current version

**Version:** `operational-analytics-v1`  
**Review status:** Initial implementation; independent review is still required before consequential policy or resource-allocation use.

Analytics describe records in `ekapon.dashboard_records`; they do not estimate the full animal population. The API applies the selected source (`live` or `sample`), excludes archived records from metrics, and restricts Paravet results to the account's assigned barangay. Sample records are never mixed with live records. Record search returns a small, paginated set of display-safe fields and must retain the same source, year, and role scope.

## Scope and time windows

- Summary cards and totals are all-time counts of active records in the selected source and accessible barangay scope. The selected year does not constrain these totals.
- Monthly trends use the selected calendar year and the preceding year. Activity date is chosen in this order: `date`, `visit_date`, `census_date`, `registration_date`, `created_at`, `createdAt`. Rows without a date matching the API's ISO date-prefix check are omitted from monthly trends.
- A monthly dash means there were no validly dated analytics rows for that month; a numeric zero means dated rows were present but none matched that measure. Month-over-month changes are withheld if either month is unobserved or the prior count is zero.
- The year-over-year comparison sums the current and previous years through the latest month with any recorded activity in the selected year. Both sides use the same number of months.
- `archivedRecordsExcluded`, valid-date counts, and missing/invalid-date counts describe records across the full source and accessible barangay scope; they are not limited to the selected year. The date check validates the expected prefix shape, not every possible calendar-date error.
- The report shows the active record count by dataset and counts of records missing barangay, pet species, vaccine flags, or service type. These are quality cues, not proof that the underlying real-world attribute is absent (for example, no vaccine flag does not prove no vaccination).

## Definitions and calculations

- **Record totals:** count active records by dataset (`owners`, `pets`, `households`, `animals`, `programs`, `services`, `stubs`).
- **Dog / cat / other species:** count pet records whose lowercase species is `dog`, `cat`, or neither.
- **Documented vaccine flag:** a pet has any first-, second-, or third-year vaccine flag, booster, or non-empty other-vaccine value recognized as `true`, `yes`, or `1` (text fields are non-empty for the other-vaccine value).
- **Vaccine-flag record rate:** `documented vaccine-flagged pet records ÷ active pet records × 100`, rounded to a whole percent. This is documentation completeness among stored pet records, not population coverage or vaccine effectiveness. The rate is null when there are no pet records.
- **Lapsed records:** pet records whose `laps` value is `true`, `yes`, or `1`.
- **Completed service counts:** service text contains the relevant case-insensitive term (`anti-rab`, `kapon`, or `microchip`) and `outcome` (falling back to `status`) is `completed` or `attended`.
- **Percent change:** `(current − previous) ÷ previous × 100`, rounded to a whole percent. It is null when the previous count is zero; no percentage baseline is invented.
- **Planning baseline:** rounded arithmetic mean of the latest three calendar months through the comparison cutoff, including zero-count months. It is displayed only if at least three calendar months are available and is not a predictive interval or forecast of causal program effects.
- **Recommendations:** rule-based follow-up prompts based on lapsed records, missing vaccine flags, and the planning baseline. They are operational suggestions, not measured outcomes, risk grades, or causal findings.

## Record search

The analytics record search uses server-side filtering and pagination. It is limited to active rows, the current live/sample source, and the signed-in role's permitted scope; Paravets can search only the readable registry/field datasets within their assigned barangay and cannot search sample data. By default results are restricted to the selected year; “All dates, including undated” is available to inspect records outside that trend window. Search results contain only summary fields and open through the existing record list, which applies its normal access checks.

## Uncertainty, quality, and interpretation

Current measures are descriptive counts of stored operational records, not inferential estimates; confidence intervals are therefore not calculated. Reliability depends on record completeness and consistent entry. Missing/invalid dates are surfaced because they affect trends. A zero count can mean no recorded activity, rather than proof that no activity occurred. Correlation and year-over-year movement do not establish causation. No grades, weights, or risk thresholds are asserted by this methodology.

Live and sample sources are kept separate and can be compared only as distinct datasets; differences may reflect data completeness or synthetic sample design. The current analysis does not establish bias or parity across groups. Any such assessment needs defined groups, suitable denominators, missingness review, and independent statistical review before interpretation.

## Change log

| Version | Change | Review |
|---|---|---|
| `operational-analytics-v1` | Documented existing source isolation, active-record scope, date precedence, monthly comparison, vaccine-flag rate, completion terms, percentage-change handling, and three-month planning baseline. Added evidence metadata and scoped record search; monthly views now distinguish unobserved months from measured zeroes. | Independent review pending. |

Changes to source fields, filters, formula definitions, units, thresholds, or aggregation must increment the methodology version and be recorded here before results from different versions are compared. Consequential metrics and any proposed score or threshold require review by someone independent of the implementation.
