# API v1 — identity, temporary access, and issue workflows

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

This document describes the ID-verification, temporary access, permission-request, and issue-report contracts in the selected local app. The SQL functions in `db/007_operations.sql` are authoritative for state transitions and actor checks; every mutation is executed through `tx(session.id, ...)` so the database records the authenticated actor.

All paths below are relative to `/api/v1`. Responses use the shared JSON error envelope and `X-Request-Id`. Non-GET requests require same-origin writes. Lists are bounded to 100 rows in the UI and use the common `page`/`pageSize` query rules. The endpoints are registered in `server/api-dispatch.ts`.

## Identity verification

| Method & path | Who | Contract |
|---|---|---|
| `POST /id-verification` | User | `{mime,data}` where `mime` is `image/jpeg`, `image/png`, or `image/webp`; `data` is base64. Actual image bytes are capped at 500 KB and checked against the declared format signature. Returns `201 {id}`. |
| `GET /id-verification` | User | Returns only that user's last 20 statuses and reviewer decision fields; never returns image bytes. |
| `GET /id-verification?status=pending\|verified\|rejected\|all&page=1&pageSize=25` | SuperAdmin, Admin, Paravet | Reviewer queue metadata, excluding image bytes. Paravets are filtered to their assigned barangay. |
| `GET /id-verification/{id}/photo` | SuperAdmin, Admin, Paravet | Returns `{mime,data}` for review through the restricted `ekapon.get_id_photo` function. Paravet barangay scope is checked in the database. Returns `404` when the verification does not exist and `410` when the photo has been purged or is otherwise no longer available; image bytes are never included in error responses. |
| `POST /id-verification/{id}/decision` | SuperAdmin, Admin, Paravet | `{outcome:"verified"|"rejected",reason?}`. Rejection requires a reason with at least 3 characters. Paravet decisions are limited to their assigned barangay; only pending rows can be decided. For a rejection, the reviewer UI combines the selected reason with their required written details in the existing `decision_reason` database column (maximum 300 characters). |

The review function marks the account verified only on approval, writes a verification log, sends a notification, and schedules photo purge 30 days after decision. A User with a verified ID cannot submit another image. A rejected User may submit a replacement.

The reviewer UI offers grouped rejection reasons for image/document quality, identity/information mismatches, ID validity/eligibility, verification/system errors, and security/fraud-prevention flags, plus “Other (specify below).” The reviewer selects one reason and enters case-specific details in the existing text box; both are saved together, for example: `Blurry, pixelated, or out-of-focus ID photo.: The name and ID number are not legible in the submitted image.` The mock images in `samples/sampleMockvalidID.jpg` and `samples/sampleMockvalidID2.jpg` are used in workflow tests as valid ID-image examples. The second file has WebP content despite its `.jpg` extension, so the User upload form detects the image format from its signature instead of relying on the filename's browser MIME guess.

## Paravet temporary-password renewal

| Method & path | Who | Contract |
|---|---|---|
| `POST /accounts/{key-or-id}/renew-temp-password` | SuperAdmin, Admin (including legacy Encoder accounts migrated to Admin) | Issues a new one-time temporary password only for a Paravet account. Returns `{account,temporaryPassword,expiresInMinutes:15,notice}`. This invalidates the previous password; the returned value is shown once and the Paravet must set a new password at sign-in. Archived, Disabled, and On hold accounts cannot be renewed. |

The action is available from the selected Paravet account's detail modal in Accounts. The API accepts the numeric account ID or Paravet account key, but the UI uses the selected row's ID (Admins do not receive account keys in list responses). User accounts continue to use the existing SuperAdmin-only `/accounts/{key}/reset-password` route and are not eligible for this new Paravet-specific endpoint.

## Temporary access grants

| Method & path | Who | Contract |
|---|---|---|
| `GET /access/grants?page=1&pageSize=25` | SuperAdmin | Returns one page of grants plus active Admin/Paravet targets and barangays for the grant form. Response includes `total`, `page`, and `pageSize`; page size defaults to 25 and is capped at 500. |
| `POST /access/grants` | SuperAdmin | `{granteeId,permission,barangayId?,reason,days}`. Permission must be one of `archive`, `restore`, `delete_submission`, `export_with_ids`, or `view_user_ids`; target must be active Admin/Paravet; duration is 1–30 days. Null/omitted `barangayId` means all barangays. Returns `201 {id}`. |
| `DELETE /access/grants/{id}` | SuperAdmin | `{reason}`; reason must be at least 3 characters. Only a non-revoked grant can be revoked. |

## Admin permission requests

| Method & path | Who | Contract |
|---|---|---|
| `POST /access/requests` | Admin | `{permission,barangayId?,reason}` using the same permission values; reason is 3–300 characters. Creates a pending request. |
| `GET /access/requests?status=pending\|approved\|rejected\|all&page=1&pageSize=25` | Admin, SuperAdmin | Admin sees only their requests. SuperAdmin sees the review queue/history. |
| `POST /access/requests/{id}/decision` | SuperAdmin | `{approve,reason,remarks,days?}`. Both reason (3–300 chars) and remarks (1–500 chars) are required; grant duration defaults to 7 and must be 1–30 days. Approval atomically creates the temporary grant and records its ID on the request. |

Only one pending request per Admin and permission is allowed by the database. The separate `requests.view` UI capability makes the request page visible to both Admin (submit) and SuperAdmin (decide); endpoint/database role checks remain authoritative.

## Issue reports

| Method & path | Who | Contract |
|---|---|---|
| `POST /issues` | Admin, Paravet | `{title,description,severity}`. Title is 3–120 chars, description 10–2,000 chars, severity `low`, `normal`, or `high` (default `normal`). Returns `201 {id}` and notifies SuperAdmin. |
| `GET /issues?status=open\|in_progress\|resolved\|dismissed\|all&page=1&pageSize=25` | Admin, Paravet, SuperAdmin | Admin/Paravet see only reports they filed. SuperAdmin sees all. |
| `PATCH /issues/{id}` | SuperAdmin | `{status,resolution?}`. Status is `open`, `in_progress`, `resolved`, or `dismissed`; resolving/dismissing requires resolution of at least 3 chars. The reporter is notified of the update. |

## Browser routes

- `/id-verification`: reviewer queue and private photo review; requires `id.review`.
- Settings for a `User`: submit and view their own ID-verification status.
- `/access`: create/revoke temporary grants; requires `grants.manage`.
- `/access/requests`: Admin request form and SuperAdmin review queue; requires `requests.view`.
- `/issues`: SuperAdmin issue queue; requires `issues.manage`.
- `/issues/new`: Admin/Paravet issue form; requires `issues.submit`.

The UI capability map only controls visibility and navigation. Each API handler independently checks the signed-in role, and the database security-definer functions enforce actor and barangay constraints for state transitions.

## Privacy and operational notes

- Do not query `id_verifications.image` directly. Its column privileges are intentionally withheld; use `get_id_photo`, which checks role, barangay, and retention state.
- The ID-photo response uses the common `no-store` cache policy. Do not log the image, base64 payload, or request body.
- List handlers return bounded metadata and never include password hashes, ID image bytes, or client-supplied actor identity. Reviewer and grant lists expose totals and bounded pagination metadata.
- `db/007_operations.sql` already defines the storage and functions. Do not re-run or alter the live migration as part of frontend/API work; deploy schema only through the project's reviewed migration process.
- The current API does not add grantable permissions, change census-round semantics, or migrate dashboard JSONB owner/pet records. Those remain separate product/schema decisions.
