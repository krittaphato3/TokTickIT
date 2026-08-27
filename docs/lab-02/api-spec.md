# CPE 334 Lab 2 — TokTickIT Requester Ticketing MVP: API Specification

- **Status:** Draft v1.0
- **Base URL:** `http://localhost:4000/api` (dev; `VITE_API_URL` on the client)
- **Companion documents:** [`specification.md`](./specification.md), [`ui-spec.md`](./ui-spec.md), [`tests.md`](./tests.md)

---

## 1. Conventions

### 1.1 Identity header (Development Requester)

Real authentication is **out of scope**. Every endpoint that touches requester-owned data requires the development identity header:

```
X-Dev-Requester-Id: <integer>
```

This mechanism is a placeholder for Lab 3 (BR-17): a later migration adds real credentials (`passwordHash`, `role`) to the `Requester` table without changing the Ticket/Attachment design or this API contract's resource shapes.

| Header state | HTTP status | Error message |
|---|---|---|
| Missing or malformed (non-integer) | 400 | `Missing or invalid X-Dev-Requester-Id header` |
| Unknown requester id | 401 | `Unknown development requester` |
| Inactive requester id | 403 | `Requester account is inactive` |

Header-free endpoints (public, no requester-owned data): `GET /api/health`, `GET /api/categories`, `GET /api/requesters`, `GET /api/related-systems`.

### 1.2 Error envelope

All errors use a uniform JSON envelope:

```json
{ "error": "human-readable message" }
```

Validation failures add a `details` array with field-level messages:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "title", "message": "Title is required" },
    { "field": "categoryId", "message": "Category is required" }
  ]
}
```

### 1.3 Status code summary

| Code | Meaning |
|---|---|
| 200 | OK (read, download, soft-removal) |
| 201 | Created (ticket, attachment) |
| 400 | Bad request: missing/invalid header, validation failure, invalid query params, attachment limit reached, malformed ticket number |
| 401 | Unknown Development Requester identity |
| 403 | Forbidden: inactive requester, or ticket/attachment owned by a different requester |
| 404 | Not found: unknown ticket number, unknown/removed attachment |
| 413 | Payload too large: attachment > 5 MB |
| 415 | Unsupported media type: attachment MIME not allowlisted |
| 500 | Unexpected server error (generic message, no stack trace) |

### 1.4 Safe unexpected-error behavior

- Any unhandled server exception returns `500` with `{ "error": "An unexpected error occurred. Please try again." }`.
- Stack traces and internal details are logged server-side only and never included in responses.
- The client treats 5xx like any failure: show a friendly message, preserve input, offer retry.
- Unknown routes return the default Express 404.

---

## 2. Public endpoints (no header)

### 2.1 `GET /api/health`

Existing Lab 1 endpoint. Returns `200` with:

```json
{ "status": "ok", "service": "TokTickIT API" }
```

### 2.2 `GET /api/categories`

Existing Lab 1 endpoint. Returns `200` with the four seeded categories ordered by id:

```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```

### 2.3 `GET /api/requesters`

Returns the **active** Development Requesters (testing identities), ordered by id. Inactive requesters are excluded (they are not selectable in the UI).

> **Seed note:** The database is seeded with 4 active requesters (Alpha–Delta) and 1 inactive requester (Epsilon, `isActive: false`). The inactive requester is excluded from this response but is used to test the inactive-requester 403 path (§1.1).

`200`:

```json
[
  { "id": 1, "name": "Dev User Alpha", "email": "alpha@toktickit.test" },
  { "id": 2, "name": "Dev User Beta",  "email": "beta@toktickit.test" },
  { "id": 3, "name": "Dev User Gamma", "email": "gamma@toktickit.test" },
  { "id": 4, "name": "Dev User Delta", "email": "delta@toktickit.test" }
]
```

### 2.4 `GET /api/related-systems`

Returns all seeded Related Systems, ordered by id. This is a public endpoint (no header required).

`200`:

```json
[
  { "id": 1, "name": "Email Server" },
  { "id": 2, "name": "VPN Gateway" },
  { "id": 3, "name": "Printer" },
  { "id": 4, "name": "Database Server" },
  { "id": 5, "name": "File Server" },
  { "id": 6, "name": "Active Directory" },
  { "id": 7, "name": "Web Application" }
]
```

---

## 3. Ticket endpoints (header required)

### 3.1 `POST /api/tickets` — Create ticket

**Headers:** `X-Dev-Requester-Id: <int>`, `Content-Type: application/json`

**Request body:**

```json
{
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "categoryId": 2,
  "priority": "HIGH",
  "relatedSystemId": 3
}
```

| Field | Required | Type | Validation |
|---|---|---|---|
| `title` | yes | string | trimmed, 1–120 characters |
| `description` | no | string | ≤ 4000 characters |
| `categoryId` | yes | integer | must reference an existing Category |
| `priority` | no | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`; defaults to `MEDIUM` |
| `relatedSystemId` | yes | integer | must reference an existing RelatedSystem |

**`201 Created`** — the created ticket (server assigns `ticketNumber`, `status: NEW`, `ownerName` = creating requester's name, `createdAt`, `updatedAt`):

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "status": "NEW",
  "priority": "HIGH",
  "itPriority": null,
  "ownerName": "Dev User Alpha",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 3, "name": "Printer" },
  "createdAt": "2026-08-18T09:30:00.000Z",
  "updatedAt": "2026-08-18T09:30:00.000Z"
}
```

**Error cases:**

| Case | Status | Error |
|---|---|---|
| Missing/invalid header | 400 | `Missing or invalid X-Dev-Requester-Id header` |
| Unknown requester | 401 | `Unknown development requester` |
| Inactive requester | 403 | `Requester account is inactive` |
| Empty/oversized title, missing category, missing related system, description > 4000 chars | 400 | `Validation failed` + `details` |
| `categoryId` does not exist | 400 | `Validation failed` → `{ field: "categoryId", message: "Category does not exist" }` |
| `relatedSystemId` missing (required) | 400 | `Validation failed` → `{ field: "relatedSystemId", message: "Related system is required" }` |
| Invalid `priority` | 400 | `Validation failed` → `{ field: "priority", message: "Priority must be one of LOW, MEDIUM, HIGH, CRITICAL" }` |
| `relatedSystemId` is invalid | 400 | `Validation failed` → `{ field: "relatedSystemId", message: "Related system does not exist" }` |
| Malformed JSON body | 400 | `Invalid JSON body` |
| Unexpected server error | 500 | generic message |

**Duplicate-submission prevention:** the client disables the submit button while the request is in flight (BR-12). The server intentionally does not deduplicate by content; two identical submissions create two tickets.

### 3.2 `GET /api/tickets` — Paginated list of my tickets

**Headers:** `X-Dev-Requester-Id: <int>`

**Query parameters:**

| Param | Type | Default | Validation |
|---|---|---|---|
| `page` | integer | 1 | ≥ 1 |
| `pageSize` | integer | 10 | 1–50 |
| `search` | string | — | trimmed; case-insensitive substring over ticketNumber OR title OR description (v2); empty/absent = no search |
| `categoryId` | integer | — | must reference an existing Category |
| `priority` | enum | — | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `itPriority` | enum (v2) | — | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`; exact match on the stored IT priority, never falls back to the requested priority (BR-20) |
| `status` | enum (v2) | — | `NEW`, `OPEN`, `PENDING`, `IN_PROGRESS`, `RESOLVED` (BR-21) |
| `sortBy` | enum | `createdAt` | `createdAt`, `updatedAt`, `title`, `priority`, `ticketNumber` (v2) |
| `sortDir` | enum | `desc` | `asc`, `desc` |

Semantics (BR-07 … BR-10, BR-20, BR-21): all criteria combine with **AND**; `priority` and `itPriority` sort/filter by rank (Critical 4 > High 3 > Medium 2 > Low 1); only the active requester's tickets are ever counted or returned.

**`200 OK`:**

```json
{
  "data": [
    {
      "id": 17,
      "ticketNumber": "TTK-2026-000017",
      "title": "Laptop will not boot after update",
      "description": "Screen stays black after the latest OS update.",
      "status": "NEW",
      "priority": "HIGH",
      "itPriority": "HIGH",
      "ownerName": "Sarah Johnson",
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 3, "name": "Printer" },
      "createdAt": "2026-08-18T09:30:00.000Z",
      "updatedAt": "2026-08-18T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 42,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

Empty result sets return `data: []` and `totalItems: 0` (see empty-state handling in ui-spec.md).

`itPriority` and `ownerName` are nullable display fields owned by IT staff tooling; they are `null` until set and never influence requester-facing `priority` filtering or sorting (BR-20). Ownership is unchanged: results are always scoped to the requester identified by `X-Dev-Requester-Id` (BR-06) — every filter, search term, sort, and page is applied *within* that requester's tickets, so one requester can never see another requester's tickets through any combination of parameters.

**Error cases:**

| Case | Status | Error |
|---|---|---|
| `page` < 1 or non-integer | 400 | `page must be an integer >= 1` |
| `pageSize` outside 1–50 | 400 | `pageSize must be between 1 and 50` |
| Invalid `sortBy` / `sortDir` | 400 | `sortBy must be one of createdAt, updatedAt, title, priority, ticketNumber` / `sortDir must be asc or desc` |
| Invalid `priority` filter | 400 | `priority must be one of LOW, MEDIUM, HIGH, CRITICAL` |
| Invalid `itPriority` filter (v2) | 400 | `itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL` |
| Invalid `status` filter (v2) | 400 | `status must be one of NEW, OPEN, PENDING, IN_PROGRESS, RESOLVED` |
| `categoryId` references a nonexistent Category | 400 | `categoryId does not reference an existing category` |
| Header errors | 400/401/403 | see §1.1 |
| Unexpected server error | 500 | generic message |

### 3.3 `GET /api/tickets/:ticketNumber` — Ticket detail (owned)

**Headers:** `X-Dev-Requester-Id: <int>`

`ticketNumber` must match the format `TTK-\d{4}-\d{6}`.

**`200 OK`** — ticket plus requester and **active** attachments (removed attachments are excluded):

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "status": "NEW",
  "priority": "HIGH",
  "itPriority": null,
  "ownerName": "Dev User Alpha",
  "category": { "id": 2, "name": "Hardware" },
  "requester": { "id": 1, "name": "Dev User Alpha", "email": "alpha@toktickit.test" },
  "relatedSystem": { "id": 3, "name": "Printer" },
  "attachments": [
    {
      "id": 3,
      "fileName": "boot-error.png",
      "mimeType": "image/png",
      "sizeBytes": 51200,
      "uploadedAt": "2026-08-18T09:45:00.000Z",
      "removedAt": null
    }
  ],
  "createdAt": "2026-08-18T09:30:00.000Z",
  "updatedAt": "2026-08-18T09:30:00.000Z"
}
```

**Error cases:**

| Case | Status | Error |
|---|---|---|
| Malformed ticket number format | 400 | `Invalid ticket number format` |
| Ticket does not exist | 404 | `Ticket TTK-2026-000099 does not exist` |
| Ticket exists but belongs to another requester | 403 | `Ticket TTK-2026-000017 does not belong to this requester` |
| Header errors | 400/401/403 | see §1.1 |

---

## 4. Attachment endpoints (header required)

Common rules (BR-14, BR-18): max **5 active attachments** per ticket; max **5 MB** per file; MIME allowlist below; files stored server-side on local disk (never exposed); only metadata is returned. The server generates a cryptographically secure random `storedName` (e.g., `crypto.randomUUID()`) for disk storage while retaining the original `fileName` in the database for the `Content-Disposition` download header.

**MIME allowlist (4 types):**

| Extension | MIME type |
|---|---|
| .png | `image/png` |
| .jpg / .jpeg | `image/jpeg` |
| .webp | `image/webp` |
| .pdf | `application/pdf` |

### 4.1 `POST /api/tickets/:ticketNumber/attachments` — Upload attachment

**Headers:** `X-Dev-Requester-Id: <int>`; `Content-Type: multipart/form-data` with a single file part named `file`.

**`201 Created`:**

```json
{
  "id": 3,
  "fileName": "boot-error.png",
  "mimeType": "image/png",
  "sizeBytes": 51200,
  "uploadedAt": "2026-08-18T09:45:00.000Z",
  "removedAt": null
}
```

**Error cases:**

| Case | Status | Error |
|---|---|---|
| Missing `file` part | 400 | `No file provided` |
| Ticket does not exist | 404 | `Ticket TTK-2026-000099 does not exist` |
| Ticket owned by another requester | 403 | `Ticket TTK-2026-000017 does not belong to this requester` |
| File > 5 MB | 413 | `File exceeds the 5 MB limit` |
| MIME not in allowlist | 415 | `File type image/svg+xml is not supported` |
| Ticket already has 5 active attachments | 400 | `Attachment limit reached (maximum 5 active attachments per ticket)` |
| Header errors | 400/401/403 | see §1.1 |

On any error, no attachment metadata is persisted and the partially received file is discarded.

### 4.2 `GET /api/tickets/:ticketNumber/attachments/:attachmentId/download` — Download attachment

**Headers:** `X-Dev-Requester-Id: <int>`

**`200 OK`** — binary stream with:

```
Content-Type: image/png
Content-Disposition: attachment; filename="boot-error.png"
```

The body is byte-for-byte identical to the uploaded file.

**Error cases:**

| Case | Status | Error |
|---|---|---|
| Attachment not found on the ticket | 404 | `Attachment not found` |
| Attachment was softly removed | 404 | `Attachment has been removed` |
| Ticket owned by another requester (incl. its attachments) | 403 | `Ticket TTK-2026-000017 does not belong to this requester` |
| Malformed attachment id / ticket number | 400 | `Invalid identifier format` |
| Header errors | 400/401/403 | see §1.1 |

### 4.3 `DELETE /api/tickets/:ticketNumber/attachments/:attachmentId` — Soft-remove attachment

**Headers:** `X-Dev-Requester-Id: <int>`

Soft removal sets `removedAt`; the row persists and the physical file is retained on disk (recoverable). The attachment is immediately excluded from detail metadata and downloads.

**`200 OK`** — the attachment metadata with `removedAt` populated:

```json
{
  "id": 3,
  "fileName": "boot-error.png",
  "mimeType": "image/png",
  "sizeBytes": 51200,
  "uploadedAt": "2026-08-18T09:45:00.000Z",
  "removedAt": "2026-08-18T10:00:00.000Z"
}
```

**Error cases:**

| Case | Status | Error |
|---|---|---|
| Attachment not found on the ticket | 404 | `Attachment not found` |
| Attachment already removed | 404 | `Attachment has already been removed` |
| Ticket owned by another requester | 403 | `Ticket TTK-2026-000017 does not belong to this requester` |
| Malformed identifiers | 400 | `Invalid identifier format` |
| Header errors | 400/401/403 | see §1.1 |

---

## 5. Ownership checks (summary)

1. Every `/api/tickets*` request resolves the active requester from `X-Dev-Requester-Id` (§1.1) before any data access.
2. **List:** the base query is always `WHERE requesterId = :activeId`; `totalItems` counts only that requester's tickets.
3. **Detail / upload / download / remove:** the ticket is first resolved by `ticketNumber`. If it does not exist → 404. If `ticket.requesterId !== activeId` → 403, and no ticket data (title, description, attachments, requester) is included in the response.
4. **Attachments:** attachment operations additionally verify the attachment belongs to the resolved ticket; removed attachments are invisible to download and listing.
5. These rules are enforced in the data-access layer, not merely hidden in the UI, so Requester A can never observe Requester B's data through any endpoint.

## 6. Ticket number format

`ticketNumber` = `TTK-` + 4-digit year + `-` + 6-digit zero-padded sequence from a dedicated PostgreSQL sequence, e.g. `TTK-2026-000017`. Generated server-side at creation, unique via a database constraint, never editable by clients. The sequence is shared across requesters (numbers are globally unique, not per-requester).
