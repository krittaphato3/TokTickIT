# CPE 334 Lab 4 — TokTickIT Actions Taken, Ticket Lifecycle and Dashboards: Engineering Specification

- **Status:** Approved v1.0 — engineering contract (implements issue [#54](https://github.com/krittaphato3/TokTickIT/issues/54), handout §Sprint 4)
- **Sprint:** Lab 4 — Actions Taken, full ticket lifecycle, role dashboards, hardening
- **Base:** `feature/l4-1-contract` from `lab4-staging` (`414d289`, post-Lab 3 merge)
- **Companion documents:** [`ui-spec.md`](./ui-spec.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md), [`reviewer.md`](./reviewer.md)
- **Lab 3 baseline:** [`../lab-03/specification.md`](../lab-03/specification.md) — auth, staff queue/detail, admin user management, comments, notes, attachments, appears-resolved. Preserved except where §11 lists a deliberate change.
- **Numbering contract (frozen across Lab 4 docs):** `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-24`, `D-01..D-14`. `ui-spec.md`, `api-spec.md`, and `tests.md` use these exact IDs. No renumbering without a contract amendment.

---

## 1. Sprint Goal

Deliver **Actions Taken** as the record of the work actually performed on a ticket, give the ticket a complete governed lifecycle from creation to closure/cancellation with a resolution gate that cannot be bypassed from the client, and add concise role dashboards for Requesters and IT Staff that link back to the existing detail and list screens — all on the Zen Green design language, with every Lab 1–3 behaviour still working, tested, responsive, accessible and authorized server-side.

## 2. Stakeholder Request Interpretation

The desk can already receive tickets and staff can talk to requesters, but there is nothing that records what was actually done. The stakeholder wants each ticket to carry a log of the work: when the action happened, what was done, what the result was, who did it (recorded automatically, never chosen by the client), whether follow-up is needed and what that follow-up is, and a plain-text note naming the file or image to look for. One IT Staff member stays the primary owner who coordinates the whole ticket, while any other IT staff member may record actions against it — recording work is not the same as owning the ticket. Requesters keep their "the problem appears resolved" indication, but it stays advisory: only IT Staff formally move a ticket to Resolved, and only when the work log supports it and a resolution summary is supplied. Both roles need a short dashboard that answers "what needs my attention now" and links to the detailed screens rather than duplicating them. Finally the whole application is to be polished and hardened so every earlier feature behaves consistently under the Zen Green design language.

## 3. Scope

### IN SCOPE

- **Actions Taken:** create, update and view per ticket; performed-by recorded from the session; conditional follow-up note; attachment notes as plain text.
- **Ticket lifecycle:** one authoritative server-side transition matrix, resolution gate, per-ticket `allowedTransitions`, optimistic concurrency on every workflow write, ticket `version` and `resolvedAt`/`resolutionSummary`.
- **Role dashboards:** Requester dashboard (own tickets only) and IT Staff/Admin dashboard (queue-wide + own actions), backend-computed, with drill-down links to the existing list screens and explicit empty states.
- **Authorization:** Admin may perform every IT Staff ticket operation (D-01); dashboards are role-separated; every write enforced in the backend.
- **Navigation:** role-aware `#/dashboard` route, active-page indication, role-appropriate default landing.
- **Data:** one Prisma migration `lab4_actions_taken` (additive only) plus a documented and tested rollback, and an extended idempotent seed covering every status, priority, ownership state and action-count case, including zero-state data.
- **Hardening:** authorization sweep over every protected route, safe failures, form data retention across recoverable failures, dashboard performance smoke, responsive and accessibility evidence, full Lab 1–3 regression.

### OUT OF SCOPE (explicitly EXCLUDED)

No implementation, endpoint, UI control or test in Lab 4 covers the following. Any reference to them is a rejection path or a documented non-goal:

- SLA clocks, breach notices, escalation rules, on-call rosters and any SLA calculation.
- Email, SMS, LINE or push notification of any kind; no invitations and no reset emails.
- Inventory, spare parts, purchasing and cost tracking.
- Time-sheets, payroll and labour-cost accounting.
- Multi-level approval chains and electronic signatures.
- BI/report builders, ad-hoc querying and data exports.
- Multi-tenant organisations, departments and production cloud infrastructure.
- **Newly excluded in Lab 4 (unchanged from Lab 3 except where noted):** a separate assignee or status axis on Actions Taken (D-02); any date-window/timezone-boundary dashboard metric (D-09); deleting Actions Taken, comments or notes (all append-only or immutable); email/notification surfaces of every kind.
- **Lifted from Lab 3's exclusion list:** dashboards and KPI analytics are now in scope (FR-08, FR-09) — see §11.

## 4. Functional Requirements

- **FR-01 — Create Action Taken.** Active IT Staff or Admin creates an action on any ticket, supplying action date/time, description, result, optional follow-up flag plus required follow-up note, and optional attachment notes. The backend stamps `performedById` from the session, ignores any client-supplied performer, writes `version=1`, and returns the created record with `201`.
- **FR-02 — Update Action Taken.** Active IT Staff or Admin edits action date/time, description, result, follow-up flag/note and attachment notes on an existing action, sending `expectedVersion`. A stale version returns `409` and overwrites nothing; a successful PATCH increments `version`.
- **FR-03 — View Actions Taken.** The owning Requester, IT Staff and Admin read the ticket's action log ordered by action date/time descending then id descending. A ticket with no actions returns an empty array, never an error.
- **FR-04 — Governed status transitions.** Ticket status changes are validated against one server-side transition matrix (BR-09). Ticket detail responses carry `allowedTransitions` computed by the server, and the UI renders only those. Invalid targets return `422 INVALID_TRANSITION` naming the permitted set; Requesters have no status changes at all.
- **FR-05 — Resolution gate.** A transition into Resolved requires at least one action, no action with follow-up outstanding, and a non-empty `resolutionSummary` in the same request. Failure returns `422 RESOLUTION_GATE` with a machine-readable `reasons[]`. Success stores the summary and stamps `resolvedAt`.
- **FR-06 — Optimistic concurrency.** Status, owner, IT priority and resolution-summary writes, and action PATCHes, require `expectedVersion`. A mismatch returns `409` with the current version and leaves stored data untouched; a missing `expectedVersion` returns `400`. Ticket detail responses expose `version`.
- **FR-07 — Duplicate-safe create.** The client generates a `clientRequestId` (UUID) per opened create form. Re-posting the same `(performedById, clientRequestId)` returns the original record with `200` and inserts nothing.
- **FR-08 — Requester dashboard.** An authenticated Requester retrieves only their own metrics: active count, waiting-for-requester count, resolved count, closed count, and the five most recently updated and five most recently resolved own tickets. Any client-supplied identity is ignored.
- **FR-09 — Staff dashboard.** An authenticated IT Staff or Admin retrieves counts by all eight statuses, unassigned active count, own active owned count, counts by IT priority, the five most recently updated active tickets, their own five most recent recorded actions, and — for Admin only — user counts.
- **FR-10 — Drill-down.** Every dashboard card and list links to an existing list screen using that screen's existing query parameters, so the destination count matches the card. Empty metrics render an explicit empty state.
- **FR-11 — Role navigation.** The shell exposes a Dashboard entry for every role, marks the current page (`aria-current="page"` plus a visual state), and lands the user on `#/dashboard` after login and after the mandatory password change.
- **FR-12 — Admin operates as IT Staff.** An active Admin can perform every IT Staff ticket operation (owner, IT priority, status, resolution) in addition to staff reads. User management and reference data stay Admin-only; Requester surfaces stay closed to both.
- **FR-13 — Data migration and seed.** One additive Prisma migration plus an idempotent seed, with the rollback script documented and executed as part of the test suite.
- **FR-14 — Deactivated staff cannot write.** An inactive account cannot authenticate, and an account deactivated mid-session is rejected on its next request, so a deactivated user can never record or edit an action or advance a ticket.

## 5. Business Rules

- **BR-01 — Action Taken belongs to exactly one Ticket.** `ActionTaken.ticketId` is a required FK to `Ticket` with `onDelete: Restrict`; an action without a ticket cannot exist, cannot be re-parented, and cannot be deleted. There is no action list decoupled from a ticket and no `DELETE` endpoint.
- **BR-02 — Ticket Owner coordinates, any IT Staff may record actions.** Each ticket has zero or one primary owner (Lab 3 BR-12). Ownership is never required to record work: an IT Staff member who is not the owner may create and update actions on the ticket, and doing so never changes `ownerId`, never transfers the ticket and never reassigns responsibility. The owner stays the coordinator accountable for the ticket as a whole; "owner by me" is a dashboard convenience, not a permission gate.
- **BR-03 — Action fields and validation.** `actionAt` required, editable, defaults to now, must not be more than 5 minutes in the future and not earlier than the ticket's `createdAt`; `description` trimmed 1–2000; `result` trimmed 1–2000; `followUpRequired` boolean default false; `followUpNote` trimmed 1–1000 **required** when `followUpRequired=true` and stored as `null` when the flag is false (clearing the flag clears the note); `attachmentNotes` optional, trimmed ≤500, plain text naming the file or image to look for — it is not a file upload and creates no attachment. Violations return `400` with field-level `details`.
- **BR-04 — Performed-by is server-derived.** `performedById` is always the authenticated session user. A client-supplied `performedById` is ignored, not rejected; there is no endpoint that records an action on behalf of another user.
- **BR-05 — Action ordering.** The log is ordered by `actionAt` descending, then `id` descending as the stable tie-break, so equal timestamps never reorder between requests. Public comments and internal notes keep their Lab 3 append-only chronological order and are unaffected.
- **BR-06 — Duplicate protection.** `clientRequestId` is an optional client-generated UUID, unique per `performedById`. A repeated POST for the same pair is a read of the existing record (`200`), never a second row. The UI additionally disables submit while a request is in flight.
- **BR-07 — Optimistic locking.** `Ticket.version` and `ActionTaken.version` are integers starting at 1. Workflow writes and action PATCHes must send `expectedVersion`; a mismatch returns `409` with the persisted version and no write occurs; success increments the version. Integer versions are chosen over timestamps (D-04) because they avoid clock and precision comparisons.
- **BR-08 — Eight statuses, one terminal state.** The status set is unchanged from Lab 3 (`NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED`). Cancelled is terminal in Lab 4; Resolved and Closed remain re-openable. Requester has no status-change capability.
- **BR-09 — Single transition matrix.** One pure server module is the only source of transitions; the UI never duplicates the rules, it renders the server-supplied `allowedTransitions`. Requesters and any unauthenticated caller cannot transition anything.

  | From → To | Permitted roles | Notes |
  |---|---|---|
  | New → Open, In Progress, Cancelled | IT Staff, Admin | Confirm for Cancelled |
  | Open → In Progress, Waiting for Requester, Resolved, Cancelled | IT Staff, Admin | Resolved is gated (BR-10); confirm for Cancelled |
  | In Progress → Open, Waiting for Requester, Resolved, Cancelled | IT Staff, Admin | Resolved gated; confirm for Cancelled |
  | Waiting for Requester → Open, In Progress, Resolved, Cancelled | IT Staff, Admin | Resolved gated; confirm for Cancelled |
  | Resolved → Closed, Reopened | IT Staff, Admin | |
  | Closed → Reopened | IT Staff, Admin | |
  | Reopened → Open, In Progress, Waiting for Requester, Resolved, Cancelled | IT Staff, Admin | Resolved gated; confirm for Cancelled |
  | Cancelled → (none) | — | Terminal |
  | Any → same status | — | Rejected as a no-op |
- **BR-10 — Resolution gate.** Transitioning into Resolved requires, in the same request, (a) at least one Action Taken on the ticket, (b) no action with `followUpRequired=true`, and (c) a non-empty `resolutionSummary` of 1–2000 characters. Any failure returns `422` with code `RESOLUTION_GATE` and `reasons[]` drawn from `NO_ACTIONS`, `OPEN_FOLLOW_UP`, `MISSING_SUMMARY` (all applicable reasons are returned together). Success writes the summary and stamps `resolvedAt`. The gate applies only to *new* transitions into Resolved.
- **BR-11 — Legacy tickets and the requester signal.** Tickets already Resolved or Closed without actions stay valid and are never back-filled with invented history; the gate never blocks reading, listing or closing such a ticket. The Lab 3 "problem appears resolved" indication is unchanged: it is a boolean plus timestamp surfaced as a comment, it never changes status, and staff see it as a triage hint.
- **BR-12 — Dashboard definitions.** *Active* statuses are New, Open, In Progress, Waiting for Requester, Reopened; *terminal* statuses are Resolved, Closed, Cancelled. Recency is "latest 5 by `updatedAt`" with no date windows, so no timezone boundary can change a count; API timestamps are ISO-8601 UTC and the UI renders them in Asia/Bangkok. Counts are computed from authoritative rows at request time (D-09); payloads are counts plus at most five summary items, never whole ticket collections. Because the active counts span five statuses while the list endpoints filter one status at a time, both list endpoints accept one added boolean filter, `active=true|false`, meaning exactly this status set — so a drill-down list count always equals its card (AC-15). It is the only list filter Lab 4 adds.
- **BR-13 — Dashboard authorization.** The Requester dashboard is Requester-only and always scoped to the session user, ignoring any client-supplied id. The staff dashboard requires IT Staff or Admin; a Requester receives `403`. `userCounts` is present only for Admin.
- **BR-14 — Authorization matrix.** Frontend hiding is never enforcement; every operation below is enforced in the backend.

  | Operation | Requester | IT Staff | Admin |
  |---|---|---|---|
  | List Actions Taken on owned ticket | Yes (own) | Yes | Yes |
  | List Actions Taken on a foreign ticket | `404` masked | Yes | Yes |
  | Create / update Action Taken | `403` | Yes | Yes |
  | Ticket status / owner / IT priority / resolution writes | `403` | Yes | Yes |
  | Ticket detail, queue, comments, notes, attachments | Own tickets only (Lab 3) | Yes | Yes |
  | `GET /api/dashboard/requester` | Yes (own) | `403` | `403` |
  | `GET /api/dashboard/staff` | `403` | Yes | Yes (+ `userCounts`) |
  | User management, reference-data admin | `403` | `403` | Yes |
- **BR-15 — Admin performs staff operations.** An active Admin performs every IT Staff ticket operation, and Admin-only surfaces stay Admin-only. This deliberately replaces Lab 3 AD-02 (Admin view-only) — see §11.
- **BR-16 — Safe errors and anti-enumeration.** The Lab 3 envelope is preserved: `{ error: string, code?: string, details?: [{ field, message }] }`. `400` validation, `401` unauthenticated, `403` authenticated-but-forbidden, `404` not found or masked, `409` conflict (stale version, duplicate), `422` business-rule rejection (`INVALID_TRANSITION`, `RESOLUTION_GATE`), `500` generic with no stack trace. New codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `RESOLUTION_GATE`, `INTERNAL`. A Requester probing another requester's action log receives the same masked `404` as a non-existent ticket.
- **BR-17 — Seed idempotency and coverage.** The seed upserts on natural keys so repeated runs are safe: tickets across all eight statuses, mixed priorities, owned and unowned; a ticket with zero actions, one with exactly one, one with three or more recorded by two different staff; an unresolved follow-up ticket (the gate-failure demo); a Requester with zero tickets (zero-state dashboards); at least one ticket already Resolved/Closed without actions (legacy path). Credentials are local-development only and documented in the seed header and README.
- **BR-18 — Lab 1–3 regression.** Authentication, sessions and CSRF, requester self-service, staff queue, staff detail operations, public comments, internal notes (masked 404 for Requesters), attachments, admin user management, and every Lab 1–3 validation limit and safe-error path keep working, including all Lab 1–3 automated suites, except for the deliberate changes listed in §11.
- **BR-19 — Immutability.** Actions Taken have no delete endpoint; comments and notes remain append-only; ticket status history is not rewritable. `updatedAt` is the only mutated timestamp on an action.
- **BR-20 — Deactivated accounts.** An inactive user cannot authenticate and a mid-session deactivation is rejected on the next request, so a deactivated staff member cannot create or edit actions or change ticket state; their existing actions remain and still render with their recorded performer.

## 6. UI Specification Summary

Full layout, component, state and accessibility rules live in [`ui-spec.md`](./ui-spec.md). This section summarizes the contract the UI implements:

- **Shell and navigation:** the Lab 3 navbar gains a role-aware Dashboard entry as the first item (`#/dashboard`); the active page is marked with `aria-current="page"` plus the pale-green active pill; login and post-password-change land on `#/dashboard`; Requester nav is Dashboard / My Tickets / New Ticket, staff and Admin nav is Dashboard / Ticket Queue (+ User Management for Admin).
- **Requester dashboard:** own metrics as cards (active, waiting for requester, resolved, closed) plus "recently updated" and "recently resolved" lists of five, each row linking to the ticket detail; explicit empty state when the requester has no tickets.
- **IT Staff / Admin dashboard:** status-count cards, unassigned and owned-by-me counts, IT-priority counts, a recent-activity list and the staff member's own recent actions; Admin additionally sees user counts; every card links to the correspondingly filtered queue.
- **Actions Taken area (Ticket Detail):** desktop table and mobile card list in `actionAt desc` order; staff create mode, staff view/edit mode with a clear mode banner; field-level validation; the follow-up note appears only when follow-up is required and is required then; editable fields use the white editable treatment and read-only fields the soft gray-green treatment; a sticky busy state with submit disabled while in flight; Requester sees the same log read-only with no create or edit affordance.
- **Status control and Resolve dialog:** only the server's `allowedTransitions` are rendered; transitions needing confirmation ask for it; Resolved opens a dialog with the resolution-summary field and renders `RESOLUTION_GATE` reasons per-code; a stale write shows a conflict notice and keeps everything the user typed; the ticket summary header refreshes after a successful change.
- **States:** loading, validation, success, empty, no-results, forbidden, conflict, not-found and safe-failure states are defined for every new surface, with retry offered where the failure is recoverable and destructive/retryable actions protected against duplicate submission.
- **Responsive and accessibility:** no horizontal page scroll at desktop 1280×800, tablet 820×1180 or mobile 390×844; touch targets ≥44px; visible focus, keyboard operation, labelled controls, non-colour status cues, and the `axe` serious/critical bar set in AC-20.

## 7. Data Changes

Additive only. No existing row is rewritten, and no Lab 3 column is dropped.

### 7.1 New model `ActionTaken`

| Field | Type | Constraints |
|---|---|---|
| `id` | Int PK autoincrement | Matches the existing id convention |
| `ticketId` | Int FK → `Ticket` | Required, `onDelete: Restrict` (BR-01) |
| `performedById` | Int FK → `User` | Required, `onDelete: Restrict`; always server-derived (BR-04) |
| `actionAt` | DateTime | Required, default now(), editable, within the BR-03 window |
| `description` | String VarChar(2000) | Required, trimmed 1–2000 |
| `result` | String VarChar(2000) | Required, trimmed 1–2000 |
| `followUpRequired` | Boolean | Default false |
| `followUpNote` | String VarChar(1000) nullable | Required iff `followUpRequired=true`, else `null` |
| `attachmentNotes` | String VarChar(500) nullable | Optional plain text; not a file |
| `clientRequestId` | String VarChar(64) nullable | Optional UUID; unique per `performedById` |
| `version` | Int | Default 1; incremented on PATCH |
| `createdAt` / `updatedAt` | DateTime | UTC; `updatedAt` auto |

### 7.2 Ticket additions

| Field | Type | Constraints |
|---|---|---|
| `version` | Int | Default 1; required in workflow writes (BR-07) |
| `resolvedAt` | DateTime nullable | Stamped by the first successful transition into Resolved; cleared on Reopened |
| `resolutionSummary` | String VarChar(2000) nullable | Required by the resolution gate (BR-10); retained after reopening as history |

Unchanged: `status`, `priority`, `itPriority`, `ownerId`, `requesterId`, `appearsResolvedAt`, `ticketNumber`, `title`, `description`, `categoryId`, `relatedSystemId` and every Lab 1–3 index.

### 7.3 Indexes

Present already and reused: `(status, createdAt desc)`, `(ownerId)`, `(requesterId, createdAt desc)`, `(updatedAt desc)`, `(priority)`, `(categoryId)`, `(relatedSystemId)`. Added by `lab4_actions_taken`:

| Index | Why |
|---|---|
| `ActionTaken(ticketId, actionAt desc, id desc)` | Serves the BR-05 log ordering directly, so rendering a ticket's actions needs no sort step |
| `ActionTaken(performedById, createdAt desc)` | Serves "my recent actions" on the staff dashboard and the `clientRequestId` uniqueness check |
| `Ticket(ownerId, status)` | "Owned by me and active" is the staff dashboard's most-used predicate |
| `Ticket(requesterId, updatedAt)` | "My recently updated" on the requester dashboard filters owner then orders by recency |
| `Ticket(itPriority)` *(addition beyond the D-10 list, justified)* | `countsByItPriority` aggregates only active tickets; without it the aggregate scans the whole table. Recorded here as a deliberate, testable addition |
| `ActionTaken(performedById, clientRequestId)` unique | Enforces BR-06 at the database layer as well as in the service |

### 7.4 Migration `lab4_actions_taken`

1. `CREATE TYPE` is not needed — the action table introduces no enum.
2. Create `ActionTaken` with its FKs, defaults and indexes.
3. Add `Ticket.version` (default 1, backfilled by the default), `Ticket.resolvedAt`, `Ticket.resolutionSummary` as nullable additions.
4. Add the composite indexes in §7.3.
5. **No data rewrite and no back-fill:** existing tickets keep `version=1`, `resolvedAt=null`, `resolutionSummary=null`, and zero actions — the legacy path in BR-11. This is verified in the migration test by row counts and NULL checks before and after.

### 7.5 Rollback

`server/prisma/rollback/lab4_down.sql` drops exactly the Lab 4 additions: the `ActionTaken` table (with its indexes and constraints), `Ticket.version`, `Ticket.resolvedAt`, `Ticket.resolutionSummary`, and the added composite indexes. It touches no Lab 1–3 table, column or row. Documented here and executed by `server/tests/lab-04/migration-regression.test.ts` in the order apply → data intact → rollback → Lab 3 data intact (AC-16).

### 7.6 Seed (idempotent, extended — D-11)

Natural keys: `email` for users, `ticketNumber` for tickets, `(ticketId, description)` for actions. Coverage: all eight statuses, mixed requested/IT priorities, owned and unowned tickets, one ticket with 0 actions, one with exactly 1, one with ≥3 actions recorded by two different staff, one ticket with an unresolved follow-up (gate-failure demo), one Requester with no tickets (zero-state dashboard), and at least one Resolved/Closed ticket without actions (legacy path). Local-development credentials only, documented in the seed header and README; no real personal data.

### 7.7 Justified design decisions (≥2)

- **Integer `version` instead of timestamps for optimistic locking (D-04).** Timestamps invite precision and clock-skew bugs (PostgreSQL microseconds versus JavaScript milliseconds) and cannot express "the client saw write N". An integer is monotonic, comparable, cheap to index and unambiguous in a `409`, at the cost of one extra increment per write.
- **Dashboard counts computed live with `groupBy`/`count` instead of cached counters.** Live aggregation always equals the authoritative rows, which is exactly what AC-13 asserts against independent queries; cached counters would need invalidation on every status, owner, priority and action write and would drift the first time a write path forgot to bump them. The seeded dataset keeps the queries well inside the PERF-01 budget.
- **Follow-up state as a flag on the action rather than a new status axis.** Adding an action status would create a second lifecycle to keep consistent with the ticket matrix, and the handout defines no action status. The flag keeps one lifecycle per concept: an action either has outstanding follow-up or it does not, and "complete" is clearing that flag.

## 8. API Contract

Full paths, payloads, validation tables, status codes and error codes live in [`api-spec.md`](./api-spec.md). The normative Lab 4 surface:

- **Actions Taken:** `GET /api/tickets/:ticketNumber/actions`, `POST /api/tickets/:ticketNumber/actions`, `PATCH /api/tickets/:ticketNumber/actions/:actionId` — no DELETE.
- **Ticket workflow:** `PATCH /api/staff/tickets/:ticketNumber/status` (+ `expectedVersion`, `resolutionSummary` for Resolved), `PATCH …/owner`, `PATCH …/it-priority` (both + `expectedVersion`), and `GET /api/staff/tickets/:ticketNumber` returning `version` and `allowedTransitions`.
- **Dashboards:** `GET /api/dashboard/requester`, `GET /api/dashboard/staff`.
- **One added list filter:** `active=true|false` on `GET /api/tickets` and `GET /api/staff/tickets`, defined as the BR-12 active status set and used by the dashboard drill-downs (api-spec §5).
- **Changed from Lab 3:** `PATCH /api/tickets/:ticketNumber/status` still exists but rejects every Requester call with `403` (D-06 — requester has no status changes).
- **Unchanged Lab 2–3 surface:** auth (login/logout/me/change-password/forgot-password), tickets CRUD + attachments + events, comments, staff queue, staff comments, internal notes, admin users and reference data — listed as "unchanged" in api-spec §10 with their Lab 3 behaviour intact.
- Errors use the BR-16 envelope and the status codes 200/201/400/401/403/404/409/422/500 as specified per endpoint.

## 9. Acceptance Criteria

Every criterion is Given/When/Then and machine-verifiable; each maps to at least one planned test in [`tests.md`](./tests.md).

| AC ID | Criterion |
|---|---|
| AC-01 | Given an active IT Staff or Admin session, when an action is created on a ticket with a client-supplied performer, then the action is stored under that ticket with the session user as `performedBy` and the client value is ignored. |
| AC-02 | Given an authenticated Requester, when the requester dashboard is requested, then only metrics and tickets belonging to that requester are returned and any client-supplied identity is ignored. |
| AC-03 | Given an action create or update with `followUpRequired=true` and no note, then the API returns `400` with a field error; when the flag is set to false, then the stored note is cleared. |
| AC-04 | Given Requester, foreign-ticket and unauthenticated callers, when they attempt to create or update an action, then the Requester receives `403`, a foreign owned ticket is masked as `404`, and the unauthenticated caller receives `401`. |
| AC-05 | Given a ticket owned by staff member A, when staff member B records an action, then the action is accepted and the ticket owner remains A. |
| AC-06 | Given a ticket with actions at equal timestamps and a legacy ticket with none, when the log is read repeatedly, then ordering is stable by `actionAt` then `id` descending and the legacy ticket returns an empty array. |
| AC-07 | Given an existing action, when a PATCH is submitted with a stale `expectedVersion`, then the API returns `409` with the current version and no stored field changes. |
| AC-08 | Given a create form that re-posts with the same `clientRequestId` for the same performer, then exactly one row exists and the second call returns the original record. |
| AC-09 | Given the transition matrix, when status changes are submitted, then only matrix-permitted transitions succeed; a Requester receives `403`; a UI-bypassing request for an invalid target is rejected server-side. |
| AC-10 | Given a ticket, when Resolved is requested with no actions, with an open follow-up, or with no summary, then `422 RESOLUTION_GATE` returns the matching `reasons[]`; when all three conditions hold, then the status becomes Resolved and `resolvedAt` is set. |
| AC-11 | Given an owned ticket, when the Requester records that the problem appears resolved, then no status changes and the staff view shows the advisory hint. |
| AC-12 | Given a stale ticket workflow write, then the API returns `409` and the UI keeps the user's entered data and shows a conflict message. |
| AC-13 | Given seeded data, when staff dashboard metrics are compared with independent database queries, then every count matches, including the zero state. |
| AC-14 | Given a Requester session, when the staff dashboard is requested, then `403` is returned. |
| AC-15 | Given a dashboard card, when its drill-down link is followed, then the destination list is filtered so its count matches the card. |
| AC-16 | Given a database with Lab 3 data, when the migration is applied, then all Lab 3 rows remain; when the rollback runs, then Lab 3 data is still intact; when the seed runs twice, then the second run changes no counts. |
| AC-17 | Given an active Admin, when staff ticket operations are performed, then they succeed; when the same user attempts user management as a non-admin, then `403` is returned. |
| AC-18 | Given the Actions Taken UI, when staff create or edit, then field validation, the busy state, duplicate-submit protection and data retention after a recoverable failure all hold; a Requester sees the log read-only. |
| AC-19 | Given desktop, tablet and mobile viewports, when dashboards, ticket detail and the actions area render, then there is no clipping, overlap or horizontal page scroll. |
| AC-20 | Given the Lab 4 screens, when audited, then `axe` reports zero serious or critical violations, every control is keyboard operable with visible focus, and status is never conveyed by colour alone. |
| AC-21 | Given the Lab 1–3 suites, when they run on Lab 4, then they are green (with the §11 deliberate updates), with no console errors, broken links or placeholder text. |
| AC-22 | Given seeded data, when each dashboard endpoint is called 20 times, then p95 latency is under 1000 ms. |
| AC-23 | Given a deactivated staff account, when it attempts to authenticate or write, then it cannot, and its previously recorded actions remain visible. |
| AC-24 | Given the action field boundaries, when an action is created or updated with an action date/time beyond the allowed window, an empty or oversized description/result, or oversized attachment notes, then the API returns `400` with field-level details and writes no row. |

## 10. Product Definition of Done

The sprint is done when all of the following hold:

- [ ] Every FR-01..FR-14 is implemented and demonstrable end-to-end across the issue branch set.
- [ ] Every AC-01..AC-24 passes and maps to at least one passing automated test recorded in `tests.md`.
- [ ] No skipped, `.only`, commented-out or flaky tests exist anywhere in the Lab 4 suites.
- [ ] Data, API, UI and responsive behaviour conform to this specification, `api-spec.md` and `ui-spec.md`.
- [ ] Failure and boundary paths are handled: validation, `401`, `403`, masked `404`, `409`, `422 INVALID_TRANSITION`, `422 RESOLUTION_GATE`, `500` safe failure, empty and zero states, duplicate submit, stale write, follow-up boundaries, action-date boundaries.
- [ ] Migration is data-preserving with a documented, executed rollback; the seed is idempotent and covers every status, ownership and action-count case; Lab 1–3 data is intact.
- [ ] Authorization is verified by direct API calls for every protected route and every role, not by absent UI.
- [ ] All Lab 1–3 suites pass (server unit + API, client component, Playwright) with the §11-listed deliberate updates applied to Lab 3 tests.
- [ ] Dashboard performance smoke meets PERF-01 (p95 < 1000 ms over 20 calls).
- [ ] Responsive and accessibility evidence exists for every new screen, and `axe` is clean at serious/critical severity.
- [ ] README documents current commands, seeded accounts and the Lab 4 surfaces.
- [ ] Every Lab 4 document reflects final behaviour with no open items and no unresolved TODO.

## 11. Assumptions and Decisions

`D-01..D-14` are the frozen design decisions of this sprint. Where a decision changes Lab 3 behaviour, the change is called out in the "Lab 3 delta" column and the affected Lab 3 tests are named — those updates are deliberate, are made on the Lab 4 branch for the issue that introduces them, and are never silent.

| ID | Decision | Lab 3 delta | Affected Lab 3 tests / artifacts |
|---|---|---|---|
| D-01 | Actions Taken authorization: list for the owning Requester, IT Staff and Admin; create/update for active IT Staff or Admin; Requester write `403`; foreign ticket masked `404`; unauthenticated `401`. **Admin may perform every IT Staff ticket operation**, while user management and reference data stay Admin-only. | **CHANGED** — Lab 3 AD-02 made Admin view-only on staff writes (`403`). | `server/tests/lab-03/staff-ticket-detail.api.test.ts` (the ADMIN `403` cases on owner/it-priority/status at the read/write sweeps and the "every staff write route refuses ADMINISTRATOR" case), `server/tests/lab-03/staff-queue.api.test.ts` (admin read-only comment), `docs/lab-03/api-spec.md` §6/§12 (superseded), `client/tests/lab-03/StaffTicketDetail.test.tsx` (Admin write affordances). |
| D-02 | ActionTaken fields exactly as §7.1: no separate assignee and no action status. "Complete" means clearing the follow-up flag; "cancel" is the Ticket's Cancelled status; "a deactivated user cannot write" is enforced by account state. | New surface. | — |
| D-03 | Actions ordered `actionAt desc, id desc`; comments and notes stay append-only chronological. | None. | — |
| D-04 | Optimistic locking with an integer `version` on `Ticket` and `ActionTaken`; workflow writes and action PATCHes require `expectedVersion`; mismatch `409`; missing `expectedVersion` `400`. | **CHANGED** — Lab 3 had no concurrency control on owner/it-priority/status writes, so every Lab 3 call to those endpoints must now send `expectedVersion`. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` (all owner/IT-priority/status PATCH calls), `client/tests/lab-03/StaffTicketDetail.test.tsx`, `e2e/lab-03/staff-ticket-flow.spec.ts`. |
| D-05 | Duplicate protection via `clientRequestId` unique per `performedById`; repeat POST returns the original record with `200`; the UI disables submit while pending. | New surface. | — |
| D-06 | Transition matrix exactly as BR-09: staff/admin only, no self-transitions, invalid target `422 INVALID_TRANSITION`, matrix exposed to the UI as `allowedTransitions`. | **CHANGED** — Lab 3 allowed Resolved→Reopened and Closed→Reopened for the owning Requester through `PATCH /api/tickets/:ticketNumber/status`, returned `409` for illegal transitions, allowed no `REOPENED→WAITING_FOR_REQUESTER/RESOLVED/CANCELLED`, and allowed `CANCELLED→REOPENED`. Lab 4 removes the Requester status path, adds the missing targets, makes Cancelled terminal, adds New→In Progress and In Progress→Open, and returns `422 INVALID_TRANSITION`. | `server/tests/lab-03/authorization.api.test.ts` (requester formal-resolve/reopen cases), `server/tests/lab-03/staff-ticket-detail.api.test.ts` (illegal-transition `409` expectations, cancelled-reopen case), `docs/lab-03/api-spec.md` §6.4/§7.3 (superseded), `docs/lab-03/specification.md` BR-05/BR-15 (superseded). |
| D-07 | Resolution gate as BR-10, with `reasons[]` codes `NO_ACTIONS`, `OPEN_FOLLOW_UP`, `MISSING_SUMMARY`; `resolvedAt` stamped on success; legacy Resolved/Closed tickets without actions stay valid and are never back-filled. | New rule; supersedes the Lab 3 hand-driven resolve. | — |
| D-08 | The Requester "problem appears resolved" indication is unchanged from Lab 3 and never changes status. | None. | — |
| D-09 | Dashboards as FR-08/FR-09 with backend-computed counts, recency by `updatedAt` (no date windows), explicit empty states, and drill-down through existing queue parameters. Counts are computed live. | **CHANGED (scope)** — Lab 3 explicitly excluded dashboards and KPI analytics; Lab 4 lifts that exclusion. | `docs/lab-03/specification.md` §3 out-of-scope list (superseded for dashboards only). |
| D-10 | One additive migration `lab4_actions_taken` plus `server/prisma/rollback/lab4_down.sql`, both documented and tested; indexes as §7.3. | New migration. | — |
| D-11 | Idempotent extended seed (BR-17) with local-development credentials only. | Extends the Lab 3 seed. | — |
| D-12 | New role-aware `#/dashboard` route; Dashboard is the first nav item with `aria-current="page"`; default landing after login and after the mandatory password change is `#/dashboard`. | **CHANGED** — Lab 3 landed Requesters on `#/my`, staff on `#/staff/queue` and Admin on `#/admin/users`. | `e2e/lab-03/authentication.spec.ts` (role-navigation smoke `T-NAV-02`), `client/tests/lab-03/ChangePassword.test.tsx` (role-home navigation after a forced change), `client/tests/lab-03/UserManagement.test.tsx` and `client/tests/lab-03/StaffTicketQueue.test.tsx` where the landing route is asserted. |
| D-13 | Hardening: safe error envelope everywhere, an authorization sweep over every protected route, form data retained across `409`/`5xx`, and the PERF-01 dashboard budget (p95 < 1000 ms, soft target 500 ms). | Extends Lab 3 hardening. | — |
| D-14 | Fixed test layout and viewports (1280×800 / 820×1180 / 390×844) with screenshots under `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/`. | Lab 3 used 1280/800/375; Lab 4 re-specifies the standard viewports for all new evidence. | `e2e/lab-03/auth-responsive.spec.ts` keeps its own 320–1440 matrix unchanged. |

### 11.1 Additional recorded assumptions

| # | Assumption | Why it is safe |
|---|---|---|
| A-01 | The handout's grading text mentions "assign / complete / cancel / inactive-assignee" for Actions Taken but defines no assignee and no action status field. Lab 4 therefore models no such fields (D-02). | Follows the explicit field list in the same stakeholder request; BR-01/BR-02 keep ownership at ticket level, and the alternatives are covered by the Ticket's Cancelled status and by account state. |
| A-02 | `resolutionSummary` needs a real column (`Ticket.resolutionSummary`), which the D-10 wording did not enumerate. | The gate requires a stored summary; §7.2 adds it to the migration and §7.5 to the rollback, so the omission cannot become an untracked schema change. |
| A-03 | `Ticket(itPriority)` is added although it is not in the D-10 index list. | Justified in §7.3 by `countsByItPriority`; recorded here so the extra index is reviewable rather than incidental. |
| A-04 | Drill-downs reuse the existing list parameters (`status`, `ownerId`, `assigned`, `itPriority`, `search`, paging) and Lab 4 adds exactly one new filter, `active=true|false`, to both list endpoints. | Verified against `staff-queue.service.ts` and `ticket.service.ts` `validateListParams`, which already validate `ownerId`, `assigned`, `status`, `itPriority`, `priority`, `categoryId`, `sort`, `order`, `page`, `pageSize`, `search`. A single `status` filter cannot express a five-status active count, so the added boolean is the minimal way to keep AC-15 (drill-down count equals card) true; D-09 explicitly permits adding the minimal filter with tests. |
| A-05 | Dashboard timestamps are stored and returned as ISO-8601 UTC and rendered in Asia/Bangkok. | Matches the Lab 3 convention (§1.7 of the Lab 3 API spec) and removes the timezone-boundary risk D-09 asks to avoid. |
| A-06 | Requester status changes are removed rather than narrowed (D-06), and the route remains registered returning `403`. | The Lab 3 requester reopen path had no UI caller; keeping the route registered gives an explicit, testable rejection instead of an ambiguous `404`. |
| A-07 | The new error `code` values (`INVALID_TRANSITION`, `RESOLUTION_GATE`, `CONFLICT`, `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `UNAUTHENTICATED`) are emitted only by Lab 4 endpoints and by the Lab 3 endpoints Lab 4 changes. Lab 2/3 endpoints keep their exact Lab 3 error bodies, so adding a code never breaks an existing Lab 3 assertion. | Keeps BR-18 regression honest: the envelope is additive for new surfaces and untouched for old ones. Recorded so reviewers do not read the new codes as a global contract change. |
| A-08 | `confirm` remains required for the transitions Lab 3 flagged — every `→ CANCELLED`, every `→ RESOLVED`, `RESOLVED → CLOSED` and every `→ REOPENED` — now including the new `REOPENED → CANCELLED`. D-06 lists the matrix deltas and does not withdraw a confirmation, and BR-09 only annotates "Confirm for Cancelled", so the safe default is to keep the existing set rather than silently drop a safety step. The confirmation metadata is presentation only: it never decides whether a transition is permitted. | Continuing an existing confirmation cannot break a Lab 3 assertion, while dropping one would be an unrecorded behaviour change for a destructive action. Recorded here so L4-3 (which implements the matrix) is not read as having invented it. |
| A-09 | `client/tests/lab-04/TicketWorkflow.test.tsx` is created by L4-3 (rows UI-05/UI-06, AC-09/AC-10/AC-12) and extended by L4-4 to UI-03/UI-04, although §4 of tests.md lists the file under L4-4. | The file index fixes the path and the row owners state which issue writes which behaviour; splitting one UI file per row would contradict D-14's fixed layout. |
