# Parallel module development pack

These documents are the collaboration contract for contributors working on the React/Vite application in `Modules/local-test-copy`. They are written against that copy's source, tests, local database workflow, and current API dispatcher—not the legacy app at the repository root or the sibling `cityvet-phase0` / `cityvet-module-c` snapshots.

## Start here

1. Read the [Integration Guide](./Integration%20Guide.md) before changing code. It defines the shared baseline, merge rules, security requirements, and behavior that must remain compatible.
2. For current ID verification, access grants, permission requests, and issue-report APIs, read [API-03](../API-03-operations-workflows.md).
3. Choose exactly one module brief and use its **Ready-to-paste contributor prompt** as the work request.
4. Work from the same agreed base commit as the other contributors. Do not copy whole folders from another snapshot.
5. Integrate module changes through the shared-file process in the Integration Guide. A module is not complete until its UI, API, permissions, schema assumptions, and tests agree.

## Module briefs

| Brief | Assigned domain |
|---|---|
| [Module A](./Module%20A.md) | Shared platform contracts, authentication, roles, accounts, profile and preferences |
| [Module B](./Module%20B.md) | Registry, barangay references, pre-listings, operational data and import/export |
| [Module C](./Module%20C.md) | Census capture/import, attachments, owner-by-owner decisions, review and census reports |
| [Module D](./Module%20D.md) | Dashboard/insights, calendar, inbox/notifications, audit, data quality and cross-module integration |

## Authority and current limits

Current source, the migration sequence, and the tests are authoritative. These briefs describe the current baseline and define constraints for future work; they do not assert that every menu entry or future feature is already implemented. In particular, do not treat `docs/API-01-auth-and-accounts.md` or `docs/API-02-dashboard.md` as the current implementation contract without reconciling them against the code. They are older snapshots and point back here for the current module contract.

Vercel/Supabase repository preparation is documented in [system-admin-ready](../system-admin-ready). It does not authorize deployment, provisioning, production/staging database access, or remote migrations.
