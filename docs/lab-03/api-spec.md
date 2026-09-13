# CPE 334 Lab 3 — TokTickIT Real Auth + Staff/Admin Workflows: API Specification

- **Status:** Approved v1.0 (engineering contract)
- **Base URL:** `http://localhost:4000/api` (dev; `VITE_API_URL` on the client)
- **Parent:** [`specification.md`](./specification.md)
- **Companions:** [`ui-spec.md`](./ui-spec.md), [`tests.md`](./tests.md), Lab 2 [`../lab-02/api-spec.md`](../lab-02/api-spec.md)
- **Lab 3 sheet:** §6 Required REST API Contract

All Lab 2 Requester resource shapes (ticket, attachment, list meta) are preserved. Lab 3 replaces
the `X-Dev-Requester-Id` header with cookie-session authentication and adds staff/admin surfaces.
The Lab 2 selector header is gone; every shape below is exact and implementation-ready.

---

## 1. Conventions

### 1.1 Authentication mechanism (decided — AD-01 closed)

Cookie-based server-side session. No tokens in localStorage. No `X-Dev-Requester-Id` header.

| Decision | Value |
|---|---|
| Session cookie | `toktickit.sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production (plain HTTP allowed on localhost dev) |
| Session lifetime | 24 h absolute, sliding refresh on activity; server-side store (DB or Redis-backed table) |
| CSRF | `SameSite=Lax` plus `X-CSRF-Token` double-submit: server issues `csrfToken` on login and `GET /api/auth/me`; all state-changing requests (`POST`/`PATCH`/`DELETE`) must send `X-CSRF-Token: <value>`; mismatch or absence → `403` |
| Password hashing | `bcrypt` cost factor 12; 72-byte input limit enforced by validation (§1.3) |
| Credential validation | Constant-time compare; identical timing for unknown vs wrong-password paths |
| Logout invalidation | Server destroys session row; clears cookie with expired `Set-Cookie`; old session id is unusable (`401` on reuse) |
| Inactive user | Session (if any) destroyed; login rejected; in-flight session behaves as `403` (see §11) |
| mustChangePassword gate | Login succeeds but returns `mustChangePassword: true`; every non-auth API except `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, and `POST /api/auth/logout` returns `403 { "error": "Password change required", "code": "password_change_required" }` until changed |

Authenticated requests send cookies automatically (`credentials: "include"` on the client). Unauthenticated
API access returns `401`. Authenticated-but-forbidden returns `403`. Missing resources are masked per §1.5.

### 1.2 Roles

One role per user: `REQUESTER`, `IT_STAFF`, `ADMIN`. Role is server-assigned, returned by
`GET /api/auth/me`, and enforced in the data-access layer on every request.

### 1.3 Password policy (BR-07)

Applies to `POST /api/auth/change-password` (user-chosen) and admin-set initial passwords with the
one stated relaxation.

| Rule | User-chosen change | Admin-set initial password |
|---|---|---|
| Minimum length | 8 chars | 8 chars |
| Maximum length | 72 chars (bcrypt input limit) | 72 chars |
| Uppercase required | yes (`A–Z`) | relaxed: length-only |
| Lowercase required | yes (`a–z`) | relaxed: length-only |
| Digit required | yes (`0–9`) | relaxed: length-only |
| Special char required | yes (non-alphanumeric) | relaxed: length-only |
| Must differ from current | yes | n/a (admin does not supply current) |
| Confirmation must match | yes (`confirmPassword`) | n/a (single `initialPassword` field) |
| Violation status | `400` with field-level `details` | `400` with field-level `details` |
| Full complexity enforced | at change time | at the user's own first-login change |

No forgot-password link, no reset flow, no email delivery exists in Lab 3. Admin-set passwords set
`mustChangePassword: true` and are documented as local-lab behavior only.

### 1.4 Error envelope

All errors use a uniform JSON envelope:

```json
{ "error": "human-readable message" }
```

Validation and business-rule failures add a `details` array:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Email is required" },
    { "field": "newPassword", "message": "Must contain a special character" }
  ]
}
```

Safe-error rule: `500` always returns `{ "error": "An unexpected error occurred. Please try again." }`
with no stack trace. Unknown routes return the default Express `404` envelope.

### 1.5 Masking rule (no existence leak)

- Requester-scoped endpoints (`/api/tickets*`) scope by server identity; a ticket owned by another
  requester behaves as `404 Ticket not found` (not `403`), so Requester A cannot probe Requester B's numbers.
- Internal-notes endpoints do not exist from a requester's perspective: any requester call returns
  `404 Not found` with no note content, never `403`.
- Staff/admin cross-ticket reads return real `404` only when the number is well-formed but absent.

### 1.6 Common status codes

| Code | Meaning in Lab 3 |
|---|---|
| 200 | OK (read, patch, delete-confirm, logout, change-password) |
| 201 | Created (ticket, attachment, comment, note, user) |
| 400 | Bad request: validation failure, malformed ticket number, invalid query param, attachment limit reached, malformed JSON |
| 401 | Unauthenticated: no/invalid/expired session |
| 403 | Forbidden: inactive account, wrong role, mustChangePassword gate, CSRF failure, requester touching another's data via staff surface |
| 404 | Not found or masked missing (ticket, attachment, comment parent, note parent, user) |
| 409 | Conflict: duplicate email, illegal status transition, last-admin safety, owner conflict |
| 413 | Payload too large: attachment > 5 MB |
| 415 | Unsupported media type: attachment MIME not allowlisted |
| 429 | Too many requests: login rate limit (BR-06: 10 attempts / minute / IP) |
| 500 | Unexpected server error (safe message only) |

### 1.7 Ticket number and timestamps

`ticketNumber` = `TTK-` + 4-digit year + `-` + 6-digit zero-padded sequence (e.g. `TTK-2026-000017`),
server-generated, unique, immutable. Format regex: `^TTK-\d{4}-\d{6}$`. All timestamps are ISO-8601 UTC.
Priority enums: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Status enum (§7.4): `NEW`, `OPEN`, `IN_PROGRESS`,
`WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`.

---

## 2. Authentication

### 2.1 `POST /api/auth/login` — Authenticate (public)

**Request:**

```json
{ "email": "alpha@example.test", "password": "Initial1!" }
```

| Field | Required | Validation |
|---|---|---|
| `email` | yes | trimmed, lowercase-compared, valid email format, max 254 chars |
| `password` | yes | 1–72 chars (never logged) |

**Success `200`:** sets `toktickit.sid` cookie, returns user identity plus CSRF token:

```json
{
  "user": {
    "id": 1,
    "name": "Dev User Alpha",
    "email": "alpha@example.test",
    "role": "REQUESTER",
    "isActive": true,
    "mustChangePassword": false
  },
  "csrfToken": "9f2c…64hex"
}
```

First-login variant (`mustChangePassword: true`) returns `200` with the same shape; the client must
route to the mandatory change-password screen (§4) before any other API will succeed.

**Errors:**

| Case | Status | Body |
|---|---|---|
| Missing/invalid email or password shape | 400 | `{ "error": "Validation failed", "details": [...] }` |
| Unknown email or wrong password | 401 | `{ "error": "Invalid email or password" }` (identical message both cases) |
| Account inactive | 403 | `{ "error": "Account is inactive. Contact an administrator." }` |
| Rate limited | 429 | `{ "error": "Too many login attempts. Try again later." }` |

Passwords are compared with bcrypt-12; unknown-email and wrong-password paths take the same
observable time. The response never indicates which of email/password was wrong.

### 2.2 `POST /api/auth/logout` — End session (auth)

Requires session cookie. Requires `X-CSRF-Token` header.

**Success `200`:**

```json
{ "message": "Logged out" }
```

Server destroys the session row and clears the cookie (`Set-Cookie: toktickit.sid=; Expires=Thu, 01 Jan 1970…`).
Calling with no session returns `401`. Calling twice with the same cookie: first `200`, second `401`.

### 2.3 `GET /api/auth/me` — Current user (auth)

**Success `200`:**

```json
{
  "user": {
    "id": 5,
    "name": "Sara IT",
    "email": "sara.it@example.test",
    "role": "IT_STAFF",
    "isActive": true,
    "mustChangePassword": false
  },
  "csrfToken": "9f2c…64hex"
}
```

**Errors:** no/invalid session → `401 { "error": "Not authenticated" }`. Inactive account with a
stale session → `403 { "error": "Account is inactive. Contact an administrator." }` and the session
is destroyed.

### 2.4 `POST /api/auth/forgot-password` — Credential-verified reset (public, no email)

Implements the "Forgot password?" flow from the approved mockup within the lab's exclusions: no
email is ever sent (email reset is excluded). The caller proves account ownership with the current
or administrator-issued initial password and sets the new one in a single request. Public
(rate-limited per IP on the shared login limiter: 10/min), reachable even while gated on
`mustChangePassword`.

**Request:**

```json
{
  "email": "alpha@example.test",
  "currentPassword": "Initial1!",
  "newPassword": "NewStrong9#",
  "confirmPassword": "NewStrong9#"
}
```

| Field | Required | Validation |
|---|---|---|
| `email` | yes | trimmed, lowercase-compared, valid email format, max 254 chars |
| `currentPassword` | yes | 1–72 chars (never logged) |
| `newPassword` | yes | BR-07 policy: 8–72 chars, upper, lower, digit, special |
| `confirmPassword` | yes | must equal `newPassword` |

**Success `200`:**

```json
{ "changed": true, "message": "Password updated" }
```

The stored hash is replaced (bcrypt-12), `mustChangePassword` is cleared, and **all of the user's
existing sessions are revoked** (a stolen session cannot survive a credential change). The client
returns the user to `#/login`.

**Errors:**

| Case | Status | Body |
|---|---|---|
| Missing/invalid field shape | 400 | `{ "error": "Validation failed", "details": [...] }` |
| Unknown email, wrong current password, or inactive account — **identical body** | 401 | `{ "error": "Unable to update password with the details provided." }` |
| New password equals the current one | 400 | `{ "error": "Validation failed", "details": [{ "field": "newPassword", ... }] }` |
| Rate limited | 429 | `{ "error": "Too many attempts. Try again later." }` |

Masking rule (§1.5) applies in full: the 401 body is byte-identical across unknown email, wrong
password, and inactive account, so account existence is never revealed.

---

## 3. Password change

### 3.1 `POST /api/auth/change-password` — First-login (mandatory) + voluntary change (auth)

Single endpoint serves both flows; the server branches on `user.mustChangePassword`. Requires session
cookie and `X-CSRF-Token`.

Mandatory (first-login) request — no current password required because the user authenticates with an
admin-issued initial secret:

```json
{ "newPassword": "NewValid1!", "confirmPassword": "NewValid1!" }
```

Voluntary (regular) request — current password required:

```json
{
  "currentPassword": "OldValid1!",
  "newPassword": "BrandNew2@",
  "confirmPassword": "BrandNew2@"
}
```

| Field | Required | Validation |
|---|---|---|
| `currentPassword` | only when `mustChangePassword=false` | 1–72 chars; must match stored hash |
| `newPassword` | yes | full policy §1.3 (min 8, max 72, upper+lower+digit+special, differs from current when current is known) |
| `confirmPassword` | yes | must equal `newPassword` exactly |

**Success `200`:**

```json
{
  "user": {
    "id": 1,
    "name": "Dev User Alpha",
    "email": "alpha@example.test",
    "role": "REQUESTER",
    "isActive": true,
    "mustChangePassword": false
  }
}
```

`mustChangePassword` flips to `false`; other sessions of the same user are kept (only the flag changes).
The client retries the originally blocked screen after success.

**Errors:**

| Case | Status | Body |
|---|---|---|
| Policy violation (length, composition, mismatch, same-as-current) | 400 | `{ "error": "Validation failed", "details": [{ "field": "newPassword", "message": "Must contain an uppercase letter" }] }` |
| `currentPassword` missing when required | 400 | `details: [{ "field": "currentPassword", "message": "Current password is required" }]` |
| `currentPassword` wrong | 401 | `{ "error": "Current password is incorrect" }` |
| No session | 401 | `{ "error": "Not authenticated" }` |
| Malformed JSON | 400 | `{ "error": "Invalid JSON body" }` |

---

## 4. Requester regression APIs (auth identity — no dev header)

All endpoints require session cookie. `requesterId` is always server-derived from the session;
any client-supplied `requesterId` field is ignored. `POST /api/tickets` is open to any active
authenticated user acting as requester-self (AD-03), including IT Staff and Admin users.

### 4.1 `GET /api/tickets` — List my tickets (requester-scoped)

Query params (Lab 2 semantics preserved):

| Param | Default | Validation |
|---|---|---|
| `page` | 1 | integer ≥ 1 |
| `pageSize` | 10 | integer 1–50 |
| `search` | — | trimmed; case-insensitive substring over ticketNumber, title, description |
| `categoryId` | — | must reference an existing Category |
| `priority` | — | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (requested priority) |
| `itPriority` | — | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (exact match, never falls back to requested) |
| `status` | — | `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED` (BR-15); legacy Lab 2 `PENDING` accepted as alias of `WAITING_FOR_REQUESTER` per AD-04 |
| `sortBy` | `createdAt` | `createdAt`, `updatedAt`, `title`, `priority`, `ticketNumber` |
| `sortDir` | `desc` | `asc`, `desc` |

All criteria combine with AND within the requester's own tickets only.

**Success `200`:**

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
      "itPriority": null,
      "owner": null,
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 3, "name": "Printer" },
      "createdAt": "2026-08-18T09:30:00.000Z",
      "updatedAt": "2026-08-18T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 3,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

Empty sets return `data: []` with `totalItems: 0`. Invalid query values → `400` with the offending
field named in `error` (e.g. `pageSize must be between 1 and 50`).

### 4.2 `POST /api/tickets` — Create ticket as self (any active role)

Requires session cookie + `X-CSRF-Token`. `Content-Type: application/json`.

```json
{
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "categoryId": 2,
  "priority": "HIGH",
  "relatedSystemId": 3
}
```

| Field | Required | Validation |
|---|---|---|
| `title` | yes | trimmed 1–120 chars |
| `description` | no | ≤ 4000 chars |
| `categoryId` | yes | must reference an existing Category |
| `priority` | no | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`; defaults to `MEDIUM` |
| `relatedSystemId` | yes | must reference an existing RelatedSystem |

**Success `201`:**

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "status": "NEW",
  "priority": "HIGH",
  "itPriority": null,
  "owner": null,
  "requester": { "id": 1, "name": "Dev User Alpha", "email": "alpha@example.test" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 3, "name": "Printer" },
  "createdAt": "2026-08-18T09:30:00.000Z",
  "updatedAt": "2026-08-18T09:30:00.000Z"
}
```

Server assigns `ticketNumber`, `status: NEW`, timestamps; `itPriority` starts `null`; `owner` starts
`null`; `requester` is the session user. Validation failures → `400 Validation failed + details`;
malformed JSON → `400 Invalid JSON body`.

### 4.3 `GET /api/tickets/:number` — Ticket detail (own ticket; masked 404)

`number` must match `^TTK-\d{4}-\d{6}$`, else `400 { "error": "Invalid ticket number format" }`.

**Success `200`** (active attachments only; removed excluded):

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "status": "NEW",
  "priority": "HIGH",
  "itPriority": null,
  "owner": null,
  "category": { "id": 2, "name": "Hardware" },
  "requester": { "id": 1, "name": "Dev User Alpha", "email": "alpha@example.test" },
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

Well-formed but absent, or owned by another requester → `404 { "error": "Ticket not found" }`
(masked; no ownership hint). Staff/admin must use §6 endpoints for cross-ticket reads.

### 4.4 Attachments (requester-scoped; Lab 2 rules preserved)

Rules: max 5 active attachments per ticket; max 5 MB per file; allowlist `.png` (`image/png`),
`.jpg`/`.jpeg` (`image/jpeg`), `.webp` (`image/webp`), `.pdf` (`application/pdf`); server-generated
random `storedName`; only metadata in JSON; soft removal via `removedAt`.

#### `POST /api/tickets/:number/attachments` — Upload (`201`)

`multipart/form-data` with single file part `file`. Requires session + CSRF.

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

Errors: missing file → `400 No file provided`; limit reached → `400 Attachment limit reached (maximum 5 active attachments per ticket)`;
> 5 MB → `413 File exceeds the 5 MB limit`; bad MIME → `415 File type <mime> is not supported`;
other's ticket or absent → `404 Ticket not found` (masked).

#### `GET /api/tickets/:number/attachments/:attachmentId/download` — Download (`200`)

Binary stream with `Content-Type: <mime>` and `Content-Disposition: attachment; filename="<fileName>"`.
Removed or unknown attachment → `404` (`Attachment not found` / `Attachment has been removed`).
Other's ticket → `404 Ticket not found`.

#### `DELETE /api/tickets/:number/attachments/:attachmentId` — Soft-remove (`200`)

Requires session + CSRF. Sets `removedAt`, retains the file on disk, excludes it from listings/downloads:

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

Already removed → `404 Attachment has already been removed`.

---

## 5. IT Staff Ticket Queue API

### 5.1 `GET /api/staff/tickets` — Cross-ticket search/filter/sort/pagination (IT_STAFF, ADMIN)

Requires session cookie. Requester role → `403` (no leak; queue is invisible to requesters).

Query parameters:

| Param | Type | Notes |
|---|---|---|
| `q` | string | trimmed; case-insensitive substring over ticketNumber, title (summary), description; empty/absent = no search |
| `status` | enum | `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED` |
| `categoryId` | integer | must reference an existing Category |
| `reqPriority` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (requested priority) |
| `itPriority` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (stored IT priority; `null` rows never match a value filter) |
| `ownerId` | integer | must reference an active IT_STAFF/ADMIN user; implies assigned |
| `assigned` | boolean | `true` = only assigned, `false` = only unassigned; absent = all |
| `sort` | enum | `createdAt`, `updatedAt`, `priority`, `number`; default `createdAt` |
| `order` | enum | `asc`, `desc`; default `desc` |
| `page` | integer | default 20-per-page contract: default `1`, ≥ 1 |
| `pageSize` | integer | default `20`, range 1–100 |

Rules: all supplied criteria combine with AND. `priority` sort uses effective rank
(`itPriority ?? reqPriority`; Critical 4 > High 3 > Medium 2 > Low 1) with `createdAt` as tiebreak.
`number` sort is lexicographic on `ticketNumber` (zero-padded, chronological). `ownerId` and
`assigned=false` together → `400` (contradictory). Unknown `status`/`reqPriority`/`itPriority`/
`sort`/`order` values, `page < 1`, `pageSize` outside 1–100, non-integer `categoryId`/`ownerId`/
`page`/`pageSize` → `400` naming the field (e.g. `{ "error": "sort must be one of createdAt, updatedAt, priority, number" }`).

**Success `200`:**

```json
{
  "data": [
    {
      "id": 17,
      "ticketNumber": "TTK-2026-000017",
      "title": "Laptop will not boot after update",
      "status": "OPEN",
      "priority": "HIGH",
      "itPriority": "CRITICAL",
      "owner": { "id": 5, "name": "Sara IT", "email": "sara.it@example.test" },
      "requester": { "id": 1, "name": "Dev User Alpha", "email": "alpha@example.test" },
      "category": { "id": 2, "name": "Hardware" },
      "createdAt": "2026-08-18T09:30:00.000Z",
      "updatedAt": "2026-08-19T14:02:00.000Z"
    },
    {
      "id": 18,
      "ticketNumber": "TTK-2026-000018",
      "title": "VPN drops every hour",
      "status": "NEW",
      "priority": "MEDIUM",
      "itPriority": null,
      "owner": null,
      "requester": { "id": 2, "name": "Dev User Beta", "email": "beta@example.test" },
      "category": { "id": 4, "name": "Network" },
      "createdAt": "2026-08-18T10:00:00.000Z",
      "updatedAt": "2026-08-18T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

Example: `GET /api/staff/tickets?q=vpn&status=NEW&sort=updatedAt&order=desc&page=1&pageSize=20`.
Invalid example: `GET /api/staff/tickets?sort=owner` → `400 { "error": "sort must be one of createdAt, updatedAt, priority, number" }`.

---

## 6. IT Staff Ticket Operations API (IT_STAFF only — ADMIN view-only per AD-02, see §12)

### 6.1 `GET /api/staff/tickets/:number` — One ticket for staff operations

`number` format validated as in §4.3. Requester role → `403` even for own tickets (requesters use
`/api/tickets/:number`; the staff surface never leaks cross-ticket existence to them).

**Success `200`:** full detail including requester, owner, both priorities, active attachments,
comment/note counts:

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "title": "Laptop will not boot after update",
  "description": "Screen stays black after the latest OS update.",
  "status": "OPEN",
  "priority": "HIGH",
  "itPriority": "CRITICAL",
  "owner": { "id": 5, "name": "Sara IT", "email": "sara.it@example.test" },
  "requester": { "id": 1, "name": "Dev User Alpha", "email": "alpha@example.test" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 3, "name": "Printer" },
  "attachments": [],
  "commentCount": 2,
  "internalNoteCount": 1,
  "createdAt": "2026-08-18T09:30:00.000Z",
  "updatedAt": "2026-08-19T14:02:00.000Z"
}
```

Absent number → `404 { "error": "Ticket TTK-2026-000099 does not exist" }`.

### 6.2 `PATCH /api/staff/tickets/:number/owner` — Claim / assign / reassign / unassign

Requires session + CSRF; IT_STAFF only (ADMIN → `403` view-only per AD-02).

**Request:**

```json
{ "ownerId": 5 }
```

or unassign:

```json
{ "ownerId": null }
```

| Field | Validation |
|---|---|
| `ownerId` | integer or `null`; when non-null must reference an active `IT_STAFF`/`ADMIN` user; requester/inactive/unknown → `400`/`409` below |

Claim pattern: staff sends their own id. Reassign: staff sends another eligible id.
Unassign: `null` clears ownership. Setting `itPriority` copy rule: when a ticket transitions from
unassigned → assigned and `itPriority` is `null`, the server copies requested `priority` into
`itPriority` automatically (BR-13); the response includes `itPriorityCopied: true` in that case.

**Success `200`:**

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "status": "OPEN",
  "owner": { "id": 5, "name": "Sara IT", "email": "sara.it@example.test" },
  "itPriority": "HIGH",
  "itPriorityCopied": true,
  "updatedAt": "2026-08-19T14:02:00.000Z"
}
```

**Errors:**

| Case | Status | Body |
|---|---|---|
| `ownerId` missing | 400 | `Validation failed → { field: "ownerId", message: "ownerId is required (integer or null)" }` |
| `ownerId` is a requester / inactive user | 409 | `{ "error": "Owner must be an active IT Staff or Administrator" }` |
| `ownerId` unknown user | 404 | `{ "error": "User not found" }` |
| Ticket absent | 404 | `{ "error": "Ticket TTK-2026-… does not exist" }` |

Zero-or-one is structural: one nullable `ownerId` column; no multi-owner state exists.

### 6.3 `PATCH /api/staff/tickets/:number/it-priority` — Set IT priority

Requires session + CSRF; IT_STAFF only (ADMIN → `403` view-only per AD-02). Independent edit after the initial copy (BR-13).

**Request:**

```json
{ "itPriority": "CRITICAL" }
```

Validation: must be one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`; `null` is rejected (use owner
unassign flow, not priority nulling). Requested `priority` is never modified by this endpoint.

**Success `200`:**

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "priority": "HIGH",
  "itPriority": "CRITICAL",
  "updatedAt": "2026-08-19T15:00:00.000Z"
}
```

Invalid value → `400 Validation failed → { field: "itPriority", message: "itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL" }`.

### 6.4 `PATCH /api/staff/tickets/:number/status` — Permitted status change

Requires session + CSRF; IT_STAFF only (ADMIN → `403` view-only per AD-02). Request body:

```json
{ "status": "IN_PROGRESS" }
```

Validation: `status` must be one of the 8 enum values. Illegal transition → `409` (see matrix).
Malformed value → `400`.

**Success `200`:**

```json
{
  "id": 17,
  "ticketNumber": "TTK-2026-000017",
  "status": "IN_PROGRESS",
  "updatedAt": "2026-08-19T16:00:00.000Z"
}
```

**Status transition matrix (BR-15):** rows = current, ✓ = allowed for IT_STAFF only (ADMIN is view-only per AD-02/BR-20: GET queue/detail/comments/notes allowed, PATCH owner/it-priority/status → `403`; see §12). Confirmations, owner guards, and audit comments per BR-15 apply.

| From \ To | NEW | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
|---|---|---|---|---|---|---|---|---|
| NEW | — | ✓ | — | — | — | — | — | ✓ |
| OPEN | — | — | ✓ | ✓ | — | — | — | ✓ |
| IN_PROGRESS | — | — | — | ✓ | ✓ | — | — | ✓ |
| WAITING_FOR_REQUESTER | — | — | ✓ | — | ✓ | — | — | ✓ |
| RESOLVED | — | — | — | — | — | ✓ | ✓ | — |
| CLOSED | — | — | — | — | — | — | ✓ | — |
| REOPENED | — | ✓ | ✓ | — | — | — | — | — |
| CANCELLED | — | — | — | — | — | — | ✓ | — |

Confirmations (BR-15): Cancelled requires confirm from NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER; Resolved requires confirm from IN_PROGRESS/WAITING_FOR_REQUESTER; Closed requires confirm from RESOLVED; REOPENED from RESOLVED/CLOSED/CANCELLED requires reason comment + confirm. Any → same status is rejected as no-op with `400`. All other transitions return `409` with the allowed-target list. Resolved and Closed require a non-deactivated owner (BR-12); deactivated-owner tickets must reassign before progress except to Cancelled. Every transition writes `updatedAt` and appends an audit-visible system comment (actor, from/to, timestamp).

Illegal example: `PATCH …/status { "status": "RESOLVED" }` on a `NEW` ticket →
`409 { "error": "Illegal status transition from NEW to RESOLVED" }`.
`CLOSED → REOPENED` is the only exit from `CLOSED`; `CANCELLED → REOPENED` (reason comment + confirm) is the only exit from `CANCELLED` per BR-15.

Requester formal transitions: requesters cannot use this staff endpoint (`403`). On their own
tickets requesters use `POST /api/tickets/:number/comments` with an appears-resolved hint (§7.2)
and `POST /api/tickets/:number/reopen` is not a separate route — a requester re-engages via
`PATCH /api/tickets/:number/status` limited to `CLOSED→REOPENED` and `RESOLVED→REOPENED`
(see §7.3); attempts to set `RESOLVED`/`CLOSED` directly → `403 { "error": "Only IT Staff may resolve or close tickets" }`.

---

## 7. Public Comments API (visible to Requester + IT_STAFF + ADMIN)

Author and `createdAt` are server-derived. Append-only: no edit/delete routes in Lab 3.
Length: trimmed 1–2000 chars; whitespace-only rejected. Safe rendering: server stores raw text;
client must escape HTML (no stored HTML execution).

### 7.1 `GET /api/tickets/:number/comments` — List public comments

Auth required. Requester: only own ticket (else masked `404`); staff/admin: any ticket
(also reachable as `GET /api/staff/tickets/:number/comments` alias, identical shape).
Ordered ascending by `createdAt`.

**Success `200`:**

```json
[
  {
    "id": 11,
    "body": "Tried safe mode — same black screen.",
    "author": { "id": 1, "name": "Dev User Alpha", "role": "REQUESTER" },
    "createdAt": "2026-08-19T09:00:00.000Z"
  },
  {
    "id": 12,
    "body": "Thanks — we have reproduced it, working on a fix.",
    "author": { "id": 5, "name": "Sara IT", "role": "IT_STAFF" },
    "createdAt": "2026-08-19T10:00:00.000Z"
  }
]
```

### 7.2 `POST /api/tickets/:number/comments` — Create public comment

Requires session + CSRF. Requester: own ticket only. Staff/admin: any ticket
(alias `POST /api/staff/tickets/:number/comments` behaves identically).

**Request:**

```json
{ "body": "The laptop booted once this morning — problem appears resolved from my side." }
```

| Field | Validation |
|---|---|
| `body` | trimmed 1–2000 chars; whitespace-only → `400` |

**Success `201`:**

```json
{
  "id": 13,
  "body": "The laptop booted once this morning — problem appears resolved from my side.",
  "author": { "id": 1, "name": "Dev User Alpha", "role": "REQUESTER" },
  "createdAt": "2026-08-19T11:00:00.000Z"
}
```

This is the BR-05 requester "problem appears resolved" indication: it is a comment, not a status
transition. Formal `RESOLVED`/`CLOSED` remains staff-only (§6.4). Empty body →
`400 Validation failed → { field: "body", message: "Comment must not be empty" }`; over 2000 chars →
`400 … { field: "body", message: "Comment must be at most 2000 characters" }`.

### 7.3 `PATCH /api/tickets/:number/status` — Limited requester transition (own ticket)

Requires session + CSRF; REQUESTER on own ticket only. Allowed: `CLOSED→REOPENED`,
`RESOLVED→REOPENED` (re-engage). Body `{ "status": "REOPENED" }`. Success `200` returns
`{ id, ticketNumber, status, updatedAt }`. Any other target, including `RESOLVED` or `CLOSED`,
→ `403 { "error": "Only IT Staff may resolve or close tickets" }`. This REOPEN-only transition is the sole BR-05 exception to staff-only resolution.

---

## 8. Internal Notes API (IT_STAFF / ADMIN only — requester masked as 404)

Author and `createdAt` server-derived. Append-only. Length: trimmed 1–2000 chars.
Requester calls (even on own ticket) return `404 { "error": "Not found" }` with no note content —
indistinguishable from a missing ticket, per §1.5.

### 8.1 `GET /api/staff/tickets/:number/internal-notes` — List notes

IT_STAFF/ADMIN only. Ascending by `createdAt`.

**Success `200`:**

```json
[
  {
    "id": 4,
    "body": "Spare SSD ready on shelf 2; check warranty before swap.",
    "author": { "id": 5, "name": "Sara IT", "role": "IT_STAFF" },
    "createdAt": "2026-08-19T12:00:00.000Z"
  }
]
```

Missing ticket → `404 Ticket … does not exist`. Requester → `404 Not found` (masked).

### 8.2 `POST /api/staff/tickets/:number/internal-notes` — Create note

Requires session + CSRF; IT_STAFF/ADMIN only.

**Request:** `{ "body": "Image backup finished; proceed with OS reinstall tomorrow." }`

**Success `201`:**

```json
{
  "id": 5,
  "body": "Image backup finished; proceed with OS reinstall tomorrow.",
  "author": { "id": 6, "name": "Tom IT", "role": "IT_STAFF" },
  "createdAt": "2026-08-19T13:00:00.000Z"
}
```

Validation mirrors §7.2 (`body` 1–2000 chars). Requester → masked `404`, never `403`, so note
existence cannot be probed.

---

## 9. Administrator User Management API (ADMIN only)

All endpoints require session cookie (+ CSRF for writes). Non-admin roles → `403`.
List responses never include password hashes. Email comparison is case-insensitive; stored lowercase.

User shape:

```json
{
  "id": 7,
  "name": "New Staff",
  "email": "new.staff@example.test",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": true,
  "createdAt": "2026-08-20T09:00:00.000Z",
  "updatedAt": "2026-08-20T09:00:00.000Z"
}
```

### 9.1 `GET /api/users` — List + search + role filter

Query params:

| Param | Notes |
|---|---|
| `search` | optional; trimmed case-insensitive substring over name or email; empty = no filter |
| `role` | optional; `REQUESTER`, `IT_STAFF`, `ADMIN`; invalid → `400` |

No pagination required (Lab 3 minimalist admin). Ordered by `id` ascending.

**Success `200`:**

```json
{
  "data": [
    { "id": 1, "name": "Dev User Alpha", "email": "alpha@example.test", "role": "REQUESTER", "isActive": true, "mustChangePassword": false, "createdAt": "2026-08-01T09:00:00.000Z", "updatedAt": "2026-08-01T09:00:00.000Z" }
  ],
  "meta": { "totalItems": 1 }
}
```

Example: `GET /api/users?search=sara&role=IT_STAFF`. Non-admin → `403 { "error": "Administrator access required" }`.

### 9.2 `POST /api/users` — Create user

Requires session + CSRF; ADMIN only.

**Request:**

```json
{
  "name": "New Staff",
  "email": "new.staff@example.test",
  "role": "IT_STAFF",
  "isActive": true,
  "initialPassword": "TempPass1!"
}
```

| Field | Validation |
|---|---|
| `name` | trimmed 1–100 chars |
| `email` | valid email, max 254, unique (case-insensitive) |
| `role` | `REQUESTER`, `IT_STAFF`, `ADMIN` |
| `isActive` | boolean (default `true` if omitted) |
| `initialPassword` | min 8, max 72 chars (complexity relaxed per §1.3) |

Created users start with `mustChangePassword: true`. Local-lab behavior only: no email is sent.

**Success `201`:** the user shape above. Duplicate email (case-insensitive) →
`409 { "error": "Email already exists" }`. Validation failures → `400 + details`.

### 9.3 `PATCH /api/users/:id` — Update name / email / role / activation

Requires session + CSRF; ADMIN only. Partial update; at least one field required.

**Request example:**

```json
{ "name": "Sara IT-Lead", "isActive": false }
```

| Field | Validation |
|---|---|
| `name` | trimmed 1–100 chars |
| `email` | valid email, unique (case-insensitive, excluding self) |
| `role` | `REQUESTER`, `IT_STAFF`, `ADMIN` |
| `isActive` | boolean |

Admin guards (all → `409`):

- No self-deactivation: admin cannot set their own `isActive` to `false` →
  `409 { "error": "Cannot deactivate your own account" }`.
- No last-admin deactivation: deactivating the sole remaining active admin →
  `409 { "error": "Cannot deactivate the last active Administrator" }`.
- No last-admin role reassignment: changing the sole remaining active admin's role away from
  `ADMIN` → `409 { "error": "Cannot reassign the last active Administrator" }`.
- Deactivation instead of deletion: no `DELETE /api/users/:id` route exists in Lab 3.
- Unknown user → `404 { "error": "User not found" }`; duplicate email → `409 Email already exists`.

**Success `200`:** updated user shape.

### 9.4 `POST /api/users/:id/set-initial-password` — Issue new initial password

Requires session + CSRF; ADMIN only. Sets `mustChangePassword: true`; user must change at next login.

**Request:**

```json
{ "initialPassword": "ResetPass2@" }
```

Validation: `initialPassword` min 8, max 72 chars (complexity relaxed; full policy enforced at the
user's own change). No reset-email checkbox, no email delivery.

**Success `200`:**

```json
{
  "id": 1,
  "email": "alpha@example.test",
  "mustChangePassword": true,
  "updatedAt": "2026-08-20T10:00:00.000Z"
}
```

Unknown user → `404 User not found`. Self-reset is allowed (unlike self-deactivation) but still
forces `mustChangePassword: true` on the admin's own next request cycle.

---

## 10. Health and reference data (unchanged, now session-aware where noted)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/health` | Public | `200 { "status": "ok", "service": "TokTickIT API" }` |
| `GET /api/categories` | Public | 4 seeded categories ordered by id |
| `GET /api/related-systems` | Public | seeded systems ordered by id |
| `GET /api/requesters` | Removed in Lab 3 | Development selector removed; use `GET /api/users` (admin) |

---

## 11. Safe error conventions

| Status | Meaning | Example body |
|---|---|---|
| 401 | Unauthenticated (no/invalid/expired session, wrong credentials, CSRF absent on login-me paths where applicable) | `{ "error": "Not authenticated" }` / `{ "error": "Invalid email or password" }` |
| 403 | Forbidden: inactive account, wrong role, mustChangePassword gate, CSRF mismatch, requester on staff surface, requester resolving/closing | `{ "error": "Account is inactive. Contact an administrator." }`, `{ "error": "Password change required", "code": "password_change_required" }`, `{ "error": "IT Staff access required" }`, `{ "error": "Only IT Staff may resolve or close tickets" }` |
| 400 | Invalid input with field details | `{ "error": "Validation failed", "details": [{ "field": "pageSize", "message": "pageSize must be between 1 and 100" }] }` |
| 404 | Not found / masked missing (ticket, attachment, user, or requester-probed internal note) | `{ "error": "Ticket not found" }`, `{ "error": "Not found" }`, `{ "error": "User not found" }` |
| 409 | Conflict: duplicate email, illegal transition, admin safety, owner eligibility | `{ "error": "Email already exists" }`, `{ "error": "Illegal status transition from NEW to RESOLVED" }`, `{ "error": "Cannot deactivate the last active Administrator" }` |
| 500 | Generic server error | `{ "error": "An unexpected error occurred. Please try again." }` |

Envelope is always `{ error }` plus optional `details` array of `{ field, message }`.

---

## 12. Authorization matrix (every endpoint × role)

`✓` allowed · `✗` rejected (`401` if unauthenticated, `403`/`404` masked per §1.5).

| Endpoint | Public | REQUESTER | IT_STAFF | ADMIN |
|---|---|---|---|---|
| `POST /api/auth/login` | ✓ | ✓ | ✓ | ✓ |
| `POST /api/auth/logout` | ✗ (401) | ✓ | ✓ | ✓ |
| `GET /api/auth/me` | ✗ (401) | ✓ | ✓ | ✓ |
| `POST /api/auth/change-password` | ✗ (401) | ✓ | ✓ | ✓ |
| `GET /api/tickets` | ✗ (401) | ✓ own only | ✓ own-as-requester | ✓ own-as-requester |
| `POST /api/tickets` | ✗ (401) | ✓ as self | ✓ as self (AD-03) | ✓ as self (AD-03) |
| `GET /api/tickets/:number` | ✗ (401) | ✓ own (else masked 404) | ✓ own-as-requester (cross-ticket via staff route) | ✓ own-as-requester (cross-ticket via staff route) |
| `POST/GET/DELETE /api/tickets/:number/attachments*` | ✗ (401) | ✓ own (else masked 404) | ✓ own-as-requester | ✓ own-as-requester |
| `GET /api/staff/tickets` | ✗ (401) | ✗ (403) | ✓ | ✓ |
| `GET /api/staff/tickets/:number` | ✗ (401) | ✗ (403) | ✓ | ✓ |
| `PATCH /api/staff/tickets/:number/owner` | ✗ (401) | ✗ (403) | ✓ | ✗ (403 view-only per AD-02) |
| `PATCH /api/staff/tickets/:number/it-priority` | ✗ (401) | ✗ (403) | ✓ | ✗ (403 view-only per AD-02) |
| `PATCH /api/staff/tickets/:number/status` | ✗ (401) | ✗ (403) | ✓ matrix | ✗ (403 view-only per AD-02) |
| `PATCH /api/tickets/:number/status` | ✗ (401) | ✓ REOPEN-only on own | ✗ (use staff route) | ✗ (use staff route) |
| `GET /api/tickets/:number/comments` (+ staff alias) | ✗ (401) | ✓ own | ✓ any | ✓ any |
| `POST /api/tickets/:number/comments` (+ staff alias) | ✗ (401) | ✓ own | ✓ any | ✓ any |
| `GET/POST /api/staff/tickets/:number/internal-notes` | ✗ (401) | ✗ (masked 404) | ✓ | ✓ |
| `GET /api/users` | ✗ (401) | ✗ (403) | ✗ (403) | ✓ |
| `POST /api/users` | ✗ (401) | ✗ (403) | ✗ (403) | ✓ |
| `PATCH /api/users/:id` | ✗ (401) | ✗ (403) | ✗ (403) | ✓ (+ safety guards) |
| `POST /api/users/:id/set-initial-password` | ✗ (401) | ✗ (403) | ✗ (403) | ✓ |

Notes: (1) AD-02 closed: ADMIN is view-only on the staff ticket surface — GET queue/detail/comments/notes allowed, PATCH owner/it-priority/status → `403`; ADMIN alone for user management (§9).
(2) Hidden/disabled UI controls never substitute for these server checks.
(3) All `POST`/`PATCH`/`DELETE` rows additionally require a valid `X-CSRF-Token`.

---

## 13. Traceability (FR / BR / AC mapping)

Canonical IDs from `specification.md` §4 (FR-01..FR-14), §5 (BR-01..BR-20), §9 (AC-01..AC-18).
Frozen numbering contract per `specification.md` §4 header. No renumbering. Endpoint paths and
shapes above are unchanged; this section only corrects the semantic mapping.

| API section | FR | BR | AC |
|---|---|---|---|
| §2 login/logout/me (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`) | FR-01, FR-02, FR-03 | BR-01, BR-02, BR-06, BR-08, BR-09, BR-10, BR-16 | AC-01, AC-05 |
| §3 change-password (`POST /api/auth/change-password` canonical) | FR-04 | BR-02, BR-07, BR-16 | AC-02, AC-06 |
| §4 requester regression + attachments (`GET|POST /api/tickets`, `GET /api/tickets/:number`, attachments) | FR-05 | BR-03, BR-11, BR-16, BR-17, BR-20 | AC-03, AC-07 |
| §5 staff queue (`GET /api/staff/tickets`) | FR-06 | BR-16, BR-19, BR-20 | AC-08 |
| §6 owner / it-priority / status (`PATCH /api/staff/tickets/:number/owner`, `/it-priority`, `/status`) | FR-07 | BR-12, BR-13, BR-15, BR-16, BR-20 | AC-09, AC-10, AC-11 |
| §7 public comments + appears-resolved signal + requester reopen (`GET|POST /api/tickets/:number/comments` — no separate appears-resolved route, §7.2 comment hint only — plus `PATCH /api/tickets/:number/status` REOPEN-only as sole BR-05 exception) | FR-08, FR-10 | BR-04, BR-05, BR-14, BR-15, BR-16, BR-20 | AC-11, AC-12, AC-14 |
| §8 internal notes (`GET|POST /api/staff/tickets/:number/internal-notes` canonical) | FR-09 | BR-04, BR-14, BR-16, BR-20 | AC-04, AC-13 |
| §9 user management (`GET|POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/set-initial-password` canonical) | FR-11, FR-12 | BR-09, BR-10, BR-16, BR-18, BR-20 | AC-15, AC-16, AC-17 |
| §10 health/reference + seed/migration (no runtime seed endpoint; single Prisma migration + idempotent seed) | FR-13 | BR-17 | AC-18 |
| §1 conventions + §11 errors + §12 matrix + shell gate (role navigation enforced server-side) | FR-14 | BR-01, BR-02, BR-09, BR-11, BR-16, BR-20 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-17 |

Coverage notes (no shape change):

- FR-10 appears-resolved is a boolean + timestamp signal (BR-05), not a status; formal Resolved/Closed stays staff-only via the BR-15 matrix (§6.4, §7.2).
- FR-11 admin list (search name/email + single role filter) and FR-12 admin create/edit/activation/password (409 duplicate, BR-18 safety) are §9.1..§9.4.
- FR-13 seed/migration: quotas (4+1 requesters, 3+1 staff, 1 admin), ownership repoint, `PENDING`→`WAITING_FOR_REQUESTER`, owner/`itPriority`/comments/notes structures, idempotent rerun (AC-18).
- FR-14 shell: name + role badge, role-filtered navigation, Logout/password-change entry; hidden controls are feedback only, enforcement is BR-20 server-side (§12).
- BR-06 login-attempt: safe messages, no lockout, IP rate limit 10/minute → 429 (§1.6, §2.1).
- BR-07 password: 8–72, upper+lower+digit+special, differs-from-current, confirm match, bcrypt-12, admin-set length-only + `mustChangePassword=true` (§1.3, §3.1).
- BR-12 owner: zero-or-one, null or active IT Staff/Administrator id; 422/400 on inactive/Requester/unknown; deactivated-owner badge + reassign-before-progress except Cancelled (§6.2).
- BR-13 `itPriority`: nullable, copy `priority` on first claim when null, staff-only independent edit thereafter (§6.2, §6.3).
- BR-15 matrix: 8 statuses, allowed transitions + confirmations + reason-comment + owner-presence + audit system comment as listed in §6.4.
- BR-13..BR-20 full range is covered above; BR-14 append-only 1–2000 integrity (§7, §8); BR-16 envelope `{ error, details }` + 400/401/403/masked-404/409/422/429/500 (§1.4, §1.5, §11); BR-17 Lab 2 regression preserved (§4, §10); BR-18 safety 409s (§9.3); BR-19 queue semantics (§5.1); BR-20 matrix normative (§12).
- AC-01..AC-18: each AC maps to at least one row above (AC-01 §2/§12, AC-02 §3/§12, AC-03 §4/§12, AC-04 §8/§12, AC-05 §2, AC-06 §3, AC-07 §4, AC-08 §5, AC-09 §6, AC-10 §6, AC-11 §6/§7, AC-12 §7, AC-13 §8, AC-14 §7, AC-15 §9, AC-16 §9, AC-17 §9/§12, AC-18 §10).

Password-policy acceptance (400 cases + 200 success), queue invalid-param 400 cases, illegal-transition
409 cases, duplicate-email 409 cases, last-admin 409 cases, and requester-masked-404 cases are each
covered by at least one planned test in `tests.md`.
