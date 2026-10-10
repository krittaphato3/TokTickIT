# CPE 334 Lab 4 — TokTickIT Actions Taken, Ticket Lifecycle and Dashboards: API Specification

- **Status:** Approved v1.0 — engineering contract
- **Parent:** [`specification.md`](./specification.md)
- **Companions:** [`ui-spec.md`](./ui-spec.md), [`tests.md`](./tests.md)
- **Lab 3 baseline:** [`../lab-03/api-spec.md`](../lab-03/api-spec.md) — conventions, auth mechanism, masking rule and the whole Lab 2/3 surface remain in force. §8 lists what stays unchanged and §3.5 lists the single Lab 3 route Lab 4 changes.
- **Numbering contract:** `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-24`, `D-01..D-14` exactly per `specification.md` §11/§9.

---

## 1. Conventions

### 1.1 Authentication and CSRF (unchanged — Lab 3 AD-01)

Cookie-based server-side session. No tokens in localStorage, no `X-Dev-Requester-Id`.

| Item | Value |
|---|---|
| Session cookie | `toktickit.sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production |
| CSRF | All `POST`/`PATCH`/`DELETE` require `X-CSRF-Token`; mismatch or absence → `403` |
| mustChangePassword gate | Every non-auth endpoint (including every Lab 4 endpoint) returns `403 { "error": "Password change required", "code": "password_change_required" }` until the flag clears |
| Identity | `performedById`, requester scope, owner scope and dashboard scope are always derived from the session |
| Rate limiting | `POST /api/auth/login` stays at 10 attempts/minute/IP by default (`LOGIN_RATE_MAX` overrides it for local E2E runs) |

### 1.2 Roles

One role per user. Database enum `Role { REQUESTER, IT_STAFF, ADMINISTRATOR }`; the wire value for the administrator role is `ADMIN` (existing Lab 3 mapping). Lab 4 adds no role.

### 1.3 Error envelope

Unchanged from Lab 3:

```json
{ "error": "human-readable message" }
```

Validation and business-rule failures add `details`:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION",
  "details": [{ "field": "followUpNote", "message": "A follow-up note is required when follow-up is required" }]
}
```

**Where `code` appears (A-07):** the Lab 4 endpoints documented here, and the Lab 3 endpoints Lab 4 changes (§3.5), emit a `code`. Every other Lab 2/3 endpoint keeps its exact Lab 3 body, so no existing assertion changes.

### 1.4 Error codes

| `code` | Status | Meaning |
|---|---|---|
| `VALIDATION` | 400 | Field, parameter or body validation failure (`details` carries field/message pairs) |
| `UNAUTHENTICATED` | 401 | No, invalid or expired session |
| `FORBIDDEN` | 403 | Authenticated but not permitted (role, ownership, inactive account, CSRF, password-change gate) |
| `NOT_FOUND` | 404 | Absent resource, or the masked 404 used to avoid existence leaks |
| `CONFLICT` | 409 | Stale `expectedVersion`, or a duplicate that cannot be merged |
| `INVALID_TRANSITION` | 422 | Status target not permitted by the BR-09 matrix |
| `RESOLUTION_GATE` | 422 | Resolved requested while the BR-10 gate is unsatisfied |
| `INTERNAL` | 500 | Unexpected failure; body is always `{ "error": "An unexpected error occurred. Please try again.", "code": "INTERNAL" }` with no stack trace |

`INVALID_TRANSITION` and `RESOLUTION_GATE` both use `422`, and both carry machine-readable context in `details`:

```json
{ "error": "Illegal status transition from NEW to RESOLVED", "code": "INVALID_TRANSITION", "details": [{ "field": "status", "message": "Permitted targets from NEW: OPEN, IN_PROGRESS, CANCELLED" }] }
```

```json
{ "error": "Resolution requirements are not met", "code": "RESOLUTION_GATE", "details": [{ "field": "reasons", "message": "NO_ACTIONS" }, { "field": "reasons", "message": "MISSING_SUMMARY" }] }
```

### 1.5 Masking rule (no existence leak, unchanged)

- A Requester calling `/api/tickets*` for another requester's ticket gets `404 Ticket not found`, never `403` — including for the Lab 4 actions endpoints.
- A Requester calling any staff (`/api/staff/*`) or dashboard endpoint that is not theirs gets `403` — the existence of the staff surface is public knowledge in Lab 3/4, the existence of another user's *ticket* is not.
- Internal notes stay masked `404` for Requesters.

### 1.6 Concurrency, versions and timestamps

- `Ticket.version` and `ActionTaken.version` are integers starting at `1`.
- Workflow writes (§3.2–§3.4) and action PATCHes (§2.3) must send `expectedVersion`; absence → `400 VALIDATION`; mismatch → `409 CONFLICT`; success increments the stored version by exactly one.
- A `409` body carries the persisted version so the client can realign:

```json
{
  "error": "This record was changed by someone else",
  "code": "CONFLICT",
  "details": [{ "field": "expectedVersion", "message": "Expected version 5, stored version is 7" }],
  "currentVersion": 7
}
```

`currentVersion` is the one additive top-level field Lab 4 introduces, and it is documented here so clients do not have to parse the message.

- All timestamps are ISO-8601 UTC in responses (`2026-10-10T07:30:00.000Z`) and are rendered in Asia/Bangkok by the UI. Ticket numbers keep the `^TTK-\d{4}-\d{6}$` format.

### 1.7 Dashboard vocabulary

- **Active statuses:** `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`.
- **Terminal statuses:** `RESOLVED`, `CLOSED`, `CANCELLED`.
- **Recency:** the latest five rows by `updatedAt` descending, tie-broken by `id` descending. No date windows exist, so no timezone boundary can change a count.
- **Payload discipline:** counts plus at most five summary items per list — never a full ticket collection.

---

## 2. Actions Taken API

Model: `ActionTaken` (`ticketId` → `Ticket`, required, `onDelete: Restrict`; `performedById` → `User`, required, server-derived). There is **no** DELETE endpoint and no list endpoint decoupled from a ticket (BR-01, BR-19).

Shared response shape:

```json
{
  "id": 42,
  "ticketId": 17,
  "actionAt": "2026-10-10T07:30:00.000Z",
  "description": "Replaced the failing network switch port.",
  "result": "Link came up at 1 Gbps and stayed stable for 30 minutes.",
  "followUpRequired": true,
  "followUpNote": "Check the port error counters tomorrow morning.",
  "attachmentNotes": "See screenshot-switch-errors.png in the ticket attachments.",
  "performedBy": { "id": 7, "name": "Sara It", "role": "IT_STAFF" },
  "version": 1,
  "createdAt": "2026-10-10T07:31:12.000Z",
  "updatedAt": "2026-10-10T07:31:12.000Z"
}
```

### 2.1 `GET /api/tickets/:ticketNumber/actions` — List Actions Taken

- **Auth/roles:** session required. Owning Requester ✔, IT Staff ✔ (any ticket), Admin ✔ (any ticket). Foreign ticket from a Requester → masked `404 NOT_FOUND`. No session → `401 UNAUTHENTICATED`.
- **Request:** no body or parameters.
- **Success `200`:** `{ "ticketNumber": "TTK-2026-000017", "actions": [ …shared shape… ] }` ordered by `actionAt` descending then `id` descending. A ticket with no actions returns `200` with `"actions": []` — never `404` and never `null` (BR-11, AC-06).
- **Validation:** malformed ticket number → `400 VALIDATION`.
- **Status codes:** `200`, `400`, `401`, `403` (inactive account, password-change gate), `404` (absent or masked), `500`.

### 2.2 `POST /api/tickets/:ticketNumber/actions` — Create Action Taken

- **Auth/roles:** session required. IT Staff ✔, Admin ✔ (D-01/BR-15). Requester on own ticket → `403 FORBIDDEN`; foreign ticket from a Requester → masked `404`; no session → `401`.
- **Request:**

```json
{
  "actionAt": "2026-10-10T07:30:00.000Z",
  "description": "Replaced the failing network switch port.",
  "result": "Link came up at 1 Gbps and stayed stable for 30 minutes.",
  "followUpRequired": true,
  "followUpNote": "Check the port error counters tomorrow morning.",
  "attachmentNotes": "See screenshot-switch-errors.png in the ticket attachments.",
  "clientRequestId": "8f14e45f-ceea-467a-9c1c-1b2b4a1c9d77",
  "performedById": 999
}
```

- **Validation:**

| Field | Rule | Failure |
|---|---|---|
| `actionAt` | Required (defaults to now when omitted); not more than 5 minutes in the future; not earlier than `ticket.createdAt` | `400 VALIDATION`, field `actionAt` |
| `description` | Required, trimmed, 1–2000 | `400 VALIDATION`, field `description` |
| `result` | Required, trimmed, 1–2000 | `400 VALIDATION`, field `result` |
| `followUpRequired` | Boolean, default `false` | `400 VALIDATION`, field `followUpRequired` |
| `followUpNote` | Required (trimmed 1–1000) when `followUpRequired=true`; forced to `null` when `false` | `400 VALIDATION`, field `followUpNote` |
| `attachmentNotes` | Optional, trimmed, ≤500; plain text, creates no attachment | `400 VALIDATION`, field `attachmentNotes` |
| `clientRequestId` | Optional UUID (8–64 chars) | `400 VALIDATION`, field `clientRequestId` |
| `performedById` | **Ignored** — never validated for permission, never stored | none (BR-04) |

- **Duplicate handling (BR-06, AC-08):** a request whose `(performedById, clientRequestId)` pair already exists inserts nothing and returns `200` with the **original** record (distinguishable from a fresh `201`). Two requests without `clientRequestId` always create two rows.
- **Success `201`:** the shared shape. `performedBy` is the session user even when the body named a different one.
- **Status codes:** `201` created, `200` duplicate replay, `400`, `401`, `403`, `404` (absent or masked), `500`.

### 2.3 `PATCH /api/tickets/:ticketNumber/actions/:actionId` — Update Action Taken

- **Auth/roles:** session required. IT Staff ✔, Admin ✔. Requester → `403`; foreign ticket from a Requester → masked `404`; no session → `401`.
- **Request:** any of `actionAt`, `description`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes` (same rules as §2.2) plus the required `expectedVersion`:

```json
{ "expectedVersion": 1, "followUpRequired": false, "result": "Counters stayed clean for 24 hours." }
```

- **Rules:** omitted fields are left unchanged; setting `followUpRequired=false` clears `followUpNote` to `null`; setting it to `true` requires a note; `performedById`, `ticketId` and `createdAt` are never editable; `updatedAt` is refreshed and `version` increments on success.
- **Stale write (AC-07):** `409 CONFLICT` with `currentVersion`; **no** field is written. **Missing `expectedVersion`:** `400 VALIDATION`. **Unknown `actionId`, or an action that belongs to another ticket:** `404 NOT_FOUND` (never a silent cross-ticket write).
- **Success `200`:** the shared shape with the incremented version.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `409`, `500`.
- **No delete:** `DELETE /api/tickets/:ticketNumber/actions/:actionId` does not exist and returns the default Express `404`.

---

## 3. Ticket workflow API

### 3.1 `GET /api/staff/tickets/:ticketNumber` — staff detail (changed: adds `version`, `allowedTransitions`)

- **Auth/roles:** unchanged from Lab 3 (session; IT Staff ✔, Admin ✔; Requester → `403`).
- **Change:** the response now additionally carries

```json
{
  "version": 4,
  "allowedTransitions": ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  "resolvedAt": null,
  "resolutionSummary": null
}
```

`allowedTransitions` is the **server's** computed list from the BR-09 matrix for the calling staff/admin user. The UI renders only these values and never re-implements the matrix (FR-04). Every other field keeps its Lab 3 shape.
- **Status codes:** unchanged (`200`, `401`, `403`, `404`, `500`).

### 3.2 `PATCH /api/staff/tickets/:ticketNumber/status` — governed transition (changed)

- **Auth/roles:** session + CSRF. IT Staff ✔, Admin ✔ (D-01/BR-15 — Admin is no longer read-only, see §3.5 note). Requester → `403 FORBIDDEN`.
- **Request:**

```json
{ "status": "RESOLVED", "expectedVersion": 4, "confirm": true, "resolutionSummary": "Port replaced and monitored for 24 hours." }
```

| Field | Rule |
|---|---|
| `status` | Required; one of the eight enum values, else `400 VALIDATION` |
| `expectedVersion` | Required integer; absent → `400 VALIDATION`; mismatch → `409 CONFLICT` with `currentVersion` |
| `confirm` | Required `true` for confirmation-required transitions; missing → `400 VALIDATION` naming the transition |
| `reason` | Required for `→ REOPENED` from `RESOLVED`/`CLOSED`; recorded as a system comment in the ticket's thread |
| `resolutionSummary` | Required (trimmed 1–2000) when the target is `RESOLVED`; otherwise ignored |

- **Transition rules:** only the BR-09 matrix applies. `Any → same status` → `400 VALIDATION`; a target outside the matrix → `422 INVALID_TRANSITION` with the permitted set in `details`; the matrix is never bypassable by calling the API directly (AC-09).
- **Resolution gate (BR-10, AC-10):** target `RESOLVED` additionally requires at least one action, no action with `followUpRequired=true`, and a non-empty summary. Every unsatisfied condition is returned together as `422 RESOLUTION_GATE` with `details` entries whose `message` is one of `NO_ACTIONS`, `OPEN_FOLLOW_UP`, `MISSING_SUMMARY`. On success `resolvedAt` is stamped and `resolutionSummary` stored; a later `→ REOPENED` keeps the summary as history and clears the active `resolvedAt`.
- **Success `200`:**

```json
{ "id": 17, "ticketNumber": "TTK-2026-000017", "status": "RESOLVED", "version": 5, "resolvedAt": "2026-10-10T08:00:00.000Z", "updatedAt": "2026-10-10T08:00:00.000Z" }
```

- **Status codes:** `200`, `400`, `401`, `403`, `404`, `409`, `422`, `500`.

### 3.3 `PATCH /api/staff/tickets/:ticketNumber/owner` — change owner (changed)

- **Auth/roles:** session + CSRF; IT Staff ✔, Admin ✔ (D-01). Requester → `403`.
- **Request:** Lab 3 body plus the new required `expectedVersion`: `{ "ownerId": 7 | null, "expectedVersion": 4 }`.
- **Rules:** unchanged from Lab 3 (`null` unassigns; the owner must be an active IT Staff or Admin user; a deactivated or requester id → `400 VALIDATION`; unknown id → `404 NOT_FOUND`). Lab 4 adds: stale `expectedVersion` → `409 CONFLICT` with `currentVersion` and no change; missing → `400`; success increments `version`.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `409`, `500`.

### 3.4 `PATCH /api/staff/tickets/:ticketNumber/it-priority` — set IT priority (changed)

- **Auth/roles:** session + CSRF; IT Staff ✔, Admin ✔ (D-01). Requester → `403`.
- **Request:** Lab 3 body plus `expectedVersion`: `{ "itPriority": "HIGH", "expectedVersion": 4 }`.
- **Rules:** unchanged from Lab 3 (`itPriority` must be one of the four enum values or `null`; `priority` — the requested priority — stays immutable and is never written here). Lab 4 adds the same `expectedVersion` contract as §3.3.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `409`, `500`.

### 3.5 `PATCH /api/tickets/:ticketNumber/status` — requester status route (changed)

- **Lab 3 behaviour:** the owning Requester could transition `RESOLVED → REOPENED` and `CLOSED → REOPENED`. **Lab 4 removes that capability (D-06/BR-09): Requester has no status changes at all.**
- **Lab 4 behaviour:** the route stays registered on the tickets router behind the session and CSRF gates so the rejection is explicit and testable, and **every** Requester call now returns:

```json
{ "error": "Only IT Staff may change ticket status", "code": "FORBIDDEN" }
```

with status `403`, regardless of the target status or ownership. Status changes happen only through §3.2. The appeared-resolved advisory signal is unaffected and keeps working through `POST /api/tickets/:ticketNumber/comments` with `{ "appearsResolved": true }` (BR-11, AC-11).
- **Status codes:** `403` (Requester), `400` (malformed body), `401`, `404` (masked for a foreign ticket), `500`.
- **Affected Lab 3 tests** are named in `specification.md` §11 (D-06).

---

## 4. Dashboards API

Both endpoints are read-only, session-scoped, and ignore any client-supplied identity. They never return ticket collections larger than five items per list, and every count is computed from authoritative rows at request time (BR-12, D-09).

### 4.1 `GET /api/dashboard/requester` — Requester dashboard

- **Auth/roles:** Requester only. IT Staff and Admin → `403 FORBIDDEN` (their own dashboard is §4.2). No session → `401`.
- **Scope:** always the session user; `userId`, `requesterId`, `email` or any equivalent supplied as a query parameter or body value is ignored (AC-02).
- **Success `200`:**

```json
{
  "activeCount": 4,
  "waitingForRequesterCount": 1,
  "resolvedCount": 2,
  "closedCount": 3,
  "recentlyUpdated": [
    { "id": 17, "ticketNumber": "TTK-2026-000017", "summary": "Printer offline on floor 3", "status": "IN_PROGRESS", "updatedAt": "2026-10-10T07:00:00.000Z" }
  ],
  "recentlyResolved": [
    { "id": 9, "ticketNumber": "TTK-2026-000009", "summary": "VPN drops every hour", "status": "RESOLVED", "updatedAt": "2026-10-09T10:00:00.000Z" }
  ]
}
```

| Field | Definition |
|---|---|
| `activeCount` | Own tickets whose status is in the BR-12 active set |
| `waitingForRequesterCount` | Own tickets with status `WAITING_FOR_REQUESTER` |
| `resolvedCount` / `closedCount` | Own tickets with status `RESOLVED` / `CLOSED` |
| `recentlyUpdated` | Own tickets, all statuses, latest 5 by `updatedAt` descending |
| `recentlyResolved` | Own tickets with status `RESOLVED`, latest 5 by `updatedAt` descending |
| item shape | `id`, `ticketNumber`, `summary`, `status`, `updatedAt` only |

- **Empty state:** a Requester with no tickets receives `200` with every count `0` and both lists `[]` — never `404` (AC-02, AC-13).
- **Status codes:** `200`, `400` (unknown query parameter rejected outright), `401`, `403`, `500`.

### 4.2 `GET /api/dashboard/staff` — IT Staff / Admin dashboard

- **Auth/roles:** IT Staff ✔, Admin ✔. Requester → `403 FORBIDDEN` (AC-14). No session → `401`.
- **Success `200`:**

```json
{
  "countsByStatus": { "NEW": 3, "OPEN": 4, "IN_PROGRESS": 5, "WAITING_FOR_REQUESTER": 2, "RESOLVED": 4, "CLOSED": 4, "REOPENED": 2, "CANCELLED": 1 },
  "unassignedActiveCount": 6,
  "myActiveOwnedCount": 4,
  "countsByItPriority": { "LOW": 1, "MEDIUM": 3, "HIGH": 4, "CRITICAL": 1 },
  "recentlyUpdated": [
    { "id": 17, "ticketNumber": "TTK-2026-000017", "summary": "Printer offline on floor 3", "status": "IN_PROGRESS", "owner": { "id": 7, "name": "Sara It" }, "updatedAt": "2026-10-10T07:00:00.000Z" }
  ],
  "myRecentActions": [
    { "id": 42, "ticketId": 17, "ticketNumber": "TTK-2026-000017", "description": "Replaced the failing network switch port.", "actionAt": "2026-10-10T07:30:00.000Z" }
  ],
  "userCounts": { "requester": 5, "itStaff": 4, "administrator": 1, "active": 9, "inactive": 2 }
}
```

| Field | Definition |
|---|---|
| `countsByStatus` | All eight statuses over all tickets, each key always present (never omitted when `0`) |
| `unassignedActiveCount` | Active tickets with `ownerId = null` |
| `myActiveOwnedCount` | Active tickets whose `ownerId` is the session user |
| `countsByItPriority` | The four priority enum values counted over **active** tickets that have an IT priority set. Active tickets with a null IT priority are not in any bucket — the response does not invent an "unset" enum value, and the UI labels the card accordingly |
| `recentlyUpdated` | Active tickets, all owners, latest 5 by `updatedAt` descending |
| `myRecentActions` | Actions with `performedById` = session user, latest 5 by `createdAt` descending; `description` is truncated to a 120-character excerpt with an ellipsis |
| `userCounts` | **Admin only.** Role counts (`requester`, `itStaff`, `administrator`) plus `active`/`inactive`. For IT Staff the key is absent from the payload, not zeroed (AC-17) |

- **Empty state:** on an empty dataset the response is `200` with every count `0` and both lists `[]`.
- **Status codes:** `200`, `400` (unknown query parameter), `401`, `403`, `500`.
- **Performance (PERF-01):** each dashboard endpoint must answer p95 < 1000 ms over 20 sequential calls on the seeded dataset (soft target 500 ms).

---

## 5. Added list filter: `active`

D-09 permits adding the minimal filter a drill-down needs. One filter is added to **both** existing list endpoints and to nothing else:

| Endpoint | New parameter | Values | Meaning |
|---|---|---|---|
| `GET /api/tickets` | `active` | `true` \| `false` | `true` = status in the BR-12 active set; `false` = status in the terminal set |
| `GET /api/staff/tickets` | `active` | `true` \| `false` | Same definition, evaluated over the staff queue's cross-ticket scope |

- Any other value → `400` with the message naming the field (`active must be true or false`), matching the existing `assigned` convention in `staff-queue.service.ts`.
- `active` combines with the existing filters with AND, exactly like `status`, `ownerId`, `assigned`, `itPriority`, `reqPriority`, `categoryId` and `search`.
- No response shape changes: both endpoints keep their Lab 2/3 payloads and `meta` objects, so `meta.totalItems` on a filtered request is directly comparable with the dashboard card it came from (AC-15).
- The filter is required because a single `status` value cannot express a five-status active count, and four staff dashboard cards (`unassignedActive`, `myActiveOwned`, `countsByItPriority`, active `recentlyUpdated`) are defined over the active set.

Verified drill-down targets:

| Card | Drill-down |
|---|---|
| Requester `activeCount` | `#/my?active=true` |
| Requester `waitingForRequesterCount` | `#/my?status=WAITING_FOR_REQUESTER` |
| Requester `resolvedCount` / `closedCount` | `#/my?status=RESOLVED` / `#/my?status=CLOSED` |
| Staff `countsByStatus[X]` | `#/staff/queue?status=X` |
| Staff `unassignedActiveCount` | `#/staff/queue?assigned=false&active=true` |
| Staff `myActiveOwnedCount` | `#/staff/queue?ownerId=<session user id>&active=true` |
| Staff `countsByItPriority[P]` | `#/staff/queue?itPriority=P&active=true` |

---

## 6. Common status codes

| Code | Meaning in Lab 4 |
|---|---|
| 200 | OK (reads, PATCHes, duplicate-replay create) |
| 201 | Created (action) |
| 400 | Validation failure, malformed ticket number, invalid list parameter, missing `expectedVersion`, missing confirmation, no-op transition (envelope `VALIDATION`) |
| 401 | No, invalid or expired session (`UNAUTHENTICATED`) |
| 403 | Wrong role, Requester write on Actions Taken, Requester status change, staff-dashboard access for a Requester, inactive account, CSRF failure, password-change gate (`FORBIDDEN` / `password_change_required`) |
| 404 | Absent, malformed-but-absent, or masked resource (`NOT_FOUND`) |
| 409 | Stale `expectedVersion`, duplicate that cannot be merged (`CONFLICT`, with `currentVersion`) |
| 413 / 415 / 429 | Unchanged Lab 2/3 attachment-size, MIME and login-rate limits |
| 422 | `INVALID_TRANSITION`, `RESOLUTION_GATE` |
| 500 | Unexpected failure (`INTERNAL`, safe message, no stack trace) |

---

## 7. Authorization matrix (normative — backend enforced)

| Endpoint | Requester | IT Staff | Admin |
|---|---|---|---|
| `GET /api/tickets/:n/actions` | Own ticket only; foreign masked `404`; `401` without session | Any ticket | Any ticket |
| `POST /api/tickets/:n/actions` | `403` | ✔ | ✔ |
| `PATCH /api/tickets/:n/actions/:id` | `403` | ✔ | ✔ |
| `PATCH /api/staff/tickets/:n/status` | `403` | ✔ | ✔ |
| `PATCH /api/staff/tickets/:n/owner`, `/it-priority` | `403` | ✔ | ✔ |
| `PATCH /api/tickets/:n/status` | `403` (D-06 — no requester status changes) | ✔ | ✔ |
| `GET /api/dashboard/requester` | ✔ (own scope only) | `403` | `403` |
| `GET /api/dashboard/staff` | `403` | ✔ | ✔ (+ `userCounts`) |
| `GET /api/staff/tickets`, `/api/staff/tickets/:n`, comments, notes | `403` / masked `404` (notes) | ✔ | ✔ |
| `GET|POST /api/users*`, reference-data admin | `403` | `403` | ✔ |
| Attachments, requester ticket CRUD, auth endpoints | Unchanged Lab 2/3 | Unchanged | Unchanged |

Hiding a control in the UI is never enforcement; every row above is asserted by direct API calls in `server/tests/lab-04/authz-sweep.api.test.ts` (AUTHZ-01..AUTHZ-05).

---

## 8. Unchanged Lab 2/3 endpoints (regression surface)

These keep their exact Lab 3 contract — paths, payloads, validation, status codes and error bodies (A-07). Lab 4 adds no `code` field to them.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/forgot-password` |
| Reference data | `GET /api/health`, `GET /api/categories`, `GET /api/related-systems` |
| Requester tickets | `GET /api/tickets`, `POST /api/tickets`, `GET /api/tickets/:ticketNumber` (now accepting the added `active` filter in §5) |
| Attachments | `POST /api/tickets/:ticketNumber/attachments`, `GET …/attachments/:attachmentId/download`, `DELETE …/attachments/:attachmentId`, `POST …/attachments/:attachmentId/restore`, `GET /api/tickets/:ticketNumber/events`, staff attachment download/audit |
| Comments | `GET|POST /api/tickets/:ticketNumber/comments` (including the `{ "appearsResolved": true }` advisory signal), `GET|POST /api/staff/tickets/:number/comments` |
| Internal notes | `GET|POST /api/staff/tickets/:ticketNumber/internal-notes` (masked `404` for Requesters) |
| Staff queue | `GET /api/staff/tickets` (now accepting the added `active` filter in §5), `GET /api/staff/owners` |
| Admin users | `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/set-initial-password` |
| Removed in Lab 3, still absent | `GET /api/requesters` (default `404`), `X-Dev-Requester-Id` handling |

---

## 9. Traceability

| Endpoint | FR | BR | AC |
|---|---|---|---|
| `GET /api/tickets/:n/actions` | FR-03 | BR-01, BR-05, BR-11 | AC-06, AC-11, AC-18 |
| `POST /api/tickets/:n/actions` | FR-01, FR-07 | BR-01, BR-02, BR-03, BR-04, BR-06 | AC-01, AC-03, AC-04, AC-05, AC-08, AC-18, AC-24 |
| `PATCH /api/tickets/:n/actions/:id` | FR-02 | BR-03, BR-07, BR-19 | AC-03, AC-07, AC-18, AC-24 |
| `PATCH /api/staff/tickets/:n/status` | FR-04, FR-05, FR-06 | BR-07, BR-08, BR-09, BR-10 | AC-09, AC-10, AC-12 |
| `PATCH /api/staff/tickets/:n/owner`, `/it-priority` | FR-06 | BR-07 | AC-12 |
| `PATCH /api/tickets/:n/status` (403) | FR-04 | BR-09 | AC-09 |
| `GET /api/dashboard/requester` | FR-08, FR-10 | BR-12, BR-13 | AC-02, AC-13, AC-15 |
| `GET /api/dashboard/staff` | FR-09, FR-10 | BR-12, BR-13, BR-15 | AC-13, AC-14, AC-15, AC-17 |
| `active` list filter | FR-10 | BR-12 | AC-15 |
| `GET /api/staff/tickets/:n` (`version`, `allowedTransitions`) | FR-04, FR-06 | BR-07, BR-09 | AC-09, AC-12 |
