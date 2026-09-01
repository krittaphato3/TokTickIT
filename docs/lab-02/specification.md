# CPE 334 Lab 2 — TokTickIT Requester Ticketing MVP: Engineering Specification

- **Status:** Draft v1.0 (specification only — no code)
- **Sprint:** Lab 2 — Requester-facing ticketing MVP using the Development Requester identity
- **Companion documents:** [`ui-spec.md`](./ui-spec.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)

---

## 1. Sprint Goal

Deliver a complete, testable Requester-facing ticketing MVP in which a seeded "Development Requester" can create tickets, browse and manage only their own tickets, search/filter/sort/paginate their ticket list, open a read-only ticket detail view, and attach files that can be downloaded or softly removed. Multi-user ownership is simulated through a Development Requester selector that is explicitly a **testing mechanism, not authentication**. All work is specified here before any code is written, with a full API contract, UI specification, and automated test plan.

## 2. Stakeholder Request Interpretation

The stakeholders (CPE 334 course) want a realistic first slice of the TokTickIT service-desk product focused entirely on the Requester side. Because real authentication and IT Staff tooling are out of scope this sprint, we simulate "who am I" with a Development Requester selector so that ownership rules (Requester A can never see Requester B's tickets) can be built and verified now, and swapped for real auth later without redesigning the data model. Every decision in this document is made so that: (a) the MVP is demonstrable end-to-end, (b) ownership and attachment lifecycle rules are enforced server-side and testable, and (c) later sprints (real auth, IT Staff workflow, comments/notes, status lifecycle) can extend the design rather than rewrite it.

## 3. Scope

### IN SCOPE
- **Create Ticket** — requester submits title, description, category, priority, and a required related system.
- **My Tickets** — owned, paginated list with search, filters (category, priority), sorting, and pagination.
- **Requester Ticket Detail** — read-only detail of an owned ticket, including attachment metadata.
- **Attachment lifecycle** — upload, metadata listing, download, and soft-removal.
- **Ownership protection** — every ticket/attachment operation is scoped to the active Development Requester.
- **Development Requester selector** — switch identity client-side for testing multi-user ownership.
- Empty states, failure states, loading states, and responsive behavior (desktop/tablet/mobile).

### OUT OF SCOPE (explicitly EXCLUDED this sprint)
- Real authentication: login, logout, passwords, sessions, tokens, roles, or authorization beyond the Development Requester identity.
- IT Staff workflows of any kind.
- Comments, internal notes, or Actions Taken on tickets.
- Lifecycle status changes beyond "New" (no transitions, no assignment, no resolution).

## 4. Functional Requirements

- **FR-01 — Create Ticket.** A requester can create a ticket with a required title, optional description, required category, a required related system (FR-17), and a priority that defaults to `MEDIUM`. The backend assigns all server-controlled fields (see FR-02/FR-03).
- **FR-02 — Official Ticket Number.** The backend generates a unique, human-readable official ticket number in the format `TTK-<year>-<6-digit zero-padded sequence>` (e.g., `TTK-2026-000017`). The number is unique across all tickets and is never editable by the client.
- **FR-03 — Initial Status.** Every newly created ticket has Current Status `New` (enum `NEW`). No other status is reachable this sprint.
- **FR-04 — My Tickets List.** A requester can retrieve a paginated list containing **only their own tickets**, ordered by the requested sort, with search and filters applied.
- **FR-05 — Search.** The requester can search their tickets by a case-insensitive substring match against ticket **title and description**.
- **FR-06 — Filters.** The requester can filter the list by **Category** and **Priority**. Multiple filters combine with AND logic.
- **FR-07 — Sorting.** The list can be sorted by `createdAt`, `updatedAt`, `title`, or `priority` (priority sorts by rank: Critical > High > Medium > Low), each ascending or descending. Default: `createdAt` descending.
- **FR-08 — Requester Ticket Detail.** A requester can open a read-only detail view of any of their own tickets, identified by its official ticket number, including attachment metadata.
- **FR-09 — Attachment Upload.** A requester can attach files to one of their own tickets (multipart upload). Enforced limits: max **5 active attachments per ticket**, max **5 MB per file**, MIME allowlist (see api-spec.md §4). The server generates a cryptographically secure random `storedName` for disk storage (BR-18).
- **FR-10 — Attachment Metadata.** Ticket detail returns metadata for each active attachment (id, original file name, MIME type, size, upload time). Server-side storage names (`storedName`) are never exposed; the original `fileName` is retained in the database for the `Content-Disposition` download header (BR-18).
- **FR-11 — Attachment Download.** A requester can download an active attachment of one of their own tickets as a binary stream with correct `Content-Type` and `Content-Disposition` headers.
- **FR-12 — Attachment Soft Removal.** A requester can remove an attachment. Removal is **soft**: the file row persists with a `removedAt` timestamp, the attachment disappears from detail/list metadata, and download attempts return 404.
- **FR-13 — Development Requester Selector.** The app shell exposes a Development Requester selector (seeded identities). Switching requester re-issues all ticket API calls with the new requester identity via the `X-Dev-Requester-Id` header and reloads the list with search/filters/pagination reset.
- **FR-14 — Ownership Enforcement.** All ticket and attachment endpoints resolve the active requester from the `X-Dev-Requester-Id` header and enforce ownership on every read, write, upload, download, and removal. Cross-requester access is denied with 403.
- **FR-15 — Empty and Failure States.** The UI renders distinct states: initial load (skeleton), loading, empty list ("No tickets yet"), no-results ("No results match"), validation errors, submitting (busy), success, and failure (friendly message + retry). Form input is preserved on failure.
- **FR-16 — Accessibility and Responsiveness.** The UI is keyboard-operable, labeled, non-color-dependent for errors/badges, and renders correctly at desktop (≥992px), tablet (768–991px), and mobile (<768px) with no horizontal scroll on mobile (see ui-spec.md).
- **FR-17 — Related System Selection.** A requester must associate a related system with a ticket during creation. Available systems are fetched from `GET /api/related-systems`. The server validates that the provided ID references an existing RelatedSystem record; a missing or invalid ID is rejected with 400.
- **FR-18 — Extended List Fields and Filters (My Tickets v2).** `GET /api/tickets` additionally returns each ticket's IT Priority (nullable) and Ticket Owner display name (nullable), plus the extended Current Status. The list endpoint accepts two new optional filters, `itPriority` and `status`, both validated against their enums (invalid values → 400). Search matches ticket number OR title OR description case-insensitively, and `sortBy` additionally accepts `ticketNumber`. The My Tickets screen presents a nine-column fluid table with sortable headers, extended status/neutral badges, a "Showing X to Y of Z tickets" pagination footer, stacked mobile cards below 768px, and no horizontal scroll at any width ≥768px (full layout rules in ui-spec.md §10). Every list remains scoped to the active requester's own tickets (BR-06/BR-22).

## 5. Business Rules

- **BR-01 — Official Ticket Number (backend-generated, unique).** The `ticketNumber` is generated exclusively by the backend from a dedicated PostgreSQL sequence and carries a unique constraint. Clients may read it but never supply or modify it.
- **BR-02 — Initial Status.** A new ticket always begins with Current Status `New` (`NEW`). There are no status transitions in this sprint.
- **BR-03 — Dev Requester Selector Is Testing Only.** The Development Requester selector is a testing mechanism that simulates identity. It is **not** authentication, provides no security boundary in production semantics, and must be visibly labeled as such in the UI ("Testing only — not real authentication").
- **BR-04 — Ticket Defaults.** If the client omits `priority`, the server stores `MEDIUM`. `description` is optional (defaults to empty/null). `status` is always `NEW`. `categoryId` is required and must reference an existing Category. `relatedSystemId` is required and must reference an existing RelatedSystem (BR-19).
- **BR-05 — Requester Switching.** The active Development Requester is resolved per request from the `X-Dev-Requester-Id` header. Switching requester in the selector clears the current list context (search, filters, sort, pagination) and reloads only the new requester's tickets. The selection may be persisted client-side (localStorage) for convenience; the server keeps no session state.
- **BR-06 — Ownership.** Every ticket/attachment operation is scoped to the requester identified by the header. A requester can never list, view, upload to, download from, or remove attachments of another requester's tickets. Violations return 403.
- **BR-07 — Search Semantics.** Search is a trimmed, case-insensitive substring match (ILIKE) applied to title OR description. An empty search term is ignored. Search and filters combine with AND.
- **BR-08 — Filter Semantics.** Filters are exact matches on `categoryId` and `priority` and combine with AND. Invalid or non-existent filter values return 400.
- **BR-09 — Sort Semantics.** `sortBy` is limited to `createdAt`, `updatedAt`, `title`, `priority`; `sortDir` to `asc`/`desc`. Priority ordering uses rank (Critical 4 > High 3 > Medium 2 > Low 1). Invalid values return 400. Default: `sortBy=createdAt&sortDir=desc`.
- **BR-10 — Pagination Semantics.** `page` ≥ 1 (default 1), `pageSize` 1–50 (default 10). The response always includes pagination metadata (`page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, `hasPrevPage`). Out-of-range values return 400.
- **BR-11 — Validation Rules.** Title: required, trimmed, 1–120 characters. Description: optional, ≤ 4000 characters. Category: required, must exist. Related system: required, must exist. Priority: must be one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. The client validates with the same rules before submitting; the server re-validates authoritatively. Field-level errors are returned inline (UI) and in a `details` array (API).
- **BR-12 — Duplicate-Submission Prevention.** A single submit action must create at most one ticket. The client disables the submit button and ignores repeat submissions while a submission is in flight. The server does **not** deduplicate by content (two identical tickets are two tickets); duplicate prevention is a client guarantee verified by test.
- **BR-13 — Failure Behavior.** On any API failure: the server returns a generic, safe error message (no stack traces, no internal detail); the client shows a friendly inline error, preserves the user's input, and offers retry. Loading indicators are shown for all async operations.
- **BR-14 — Attachment Rules.** Max 5 **active** attachments per ticket; max 5 MB per file; MIME allowlist enforced (413 for size, 415 for type). Files are stored server-side on local disk; only metadata is stored in the database and returned by the API. Soft removal sets `removedAt`; removed attachments are excluded from metadata lists and downloads return 404.
- **BR-15 — Inactive/Unknown Requesters.** The selector lists only active requesters. A request with a missing header returns 400; an unknown requester id returns 401; an inactive requester id returns 403.
- **BR-16 — Empty States.** A requester with zero tickets sees "No tickets yet" with a call-to-action to create a ticket. A requester whose search/filters match nothing sees "No results match your filters" with a "Clear filters" action. The two states are visually and textually distinct.
- **BR-17 — Lab 3 Authentication Transition.** The current `Requester` model and `X-Dev-Requester-Id` header are strictly for Lab 2 testing. The database schema is designed to accommodate Lab 3 by adding `passwordHash` and `role` columns directly to the `Requester` table via a future Prisma migration, without altering the core Ticket/Attachment relationships or requiring a schema rewrite.
- **BR-18 — Safe Filename and Storage Behavior.** To prevent path traversal and filename collisions, the server must never use the user-supplied `fileName` for disk storage. The server must generate a cryptographically secure random identifier (e.g., using `crypto.randomUUID()`) for the `storedName` on disk, while retaining the original `fileName` in the database strictly for the `Content-Disposition` download header.
- **BR-19 — Related System Validation.** `relatedSystemId` is required and must reference an existing RelatedSystem. A missing or invalid ID is rejected with 400 with a field-level error on `relatedSystemId`.
- **BR-20 — IT Priority and Ticket Owner Display Rules.** `itPriority` and Ticket Owner (`owner` / `ownerName`) are nullable display fields set only when IT Staff claims the ticket in a later lab; tickets created in Lab 2 are Unassigned (`owner` null, rendered muted "Unassigned"). The Requester (`requester` / `requesterId`) is the Development Requester who created the ticket and owns the *request* — a different concept from Ticket Owner. The `itPriority` filter matches only tickets whose stored `itPriority` equals the given value — it never falls back to matching the requested priority.
- **BR-22 — List Ownership Scoping (reaffirmed for v2).** Every `GET /api/tickets` query — including the v2 filters (`itPriority`, `status`), extended search scope (ticketNumber), and new sort key — is resolved *within* the tickets owned by the requester identified by `X-Dev-Requester-Id`. Ownership scoping is applied before filtering, counting, sorting, and pagination, so no parameter combination can expose another requester's tickets or skew another requester's totals (extending BR-06/BR-07).
- **BR-21 — Extended Status Filter Semantics.** The `status` filter accepts any value of the extended Status enum (`NEW`, `OPEN`, `PENDING`, `IN_PROGRESS`, `RESOLVED`) and combines with all other criteria via AND (extending BR-08). Ticket creation still always produces `NEW` (BR-02 unchanged); status transitions remain out of scope.

## 6. UI Specification Summary

Full component-level specification: [`ui-spec.md`](./ui-spec.md). Summary:

- **App shell:** Sticky top navbar with brand, primary navigation (New Ticket, My Tickets) with active-state indication, and the Development Requester selector at the top right labeled "Testing only — not real authentication".
- **Screens:** (1) My Tickets — search box, category/priority/related-systems filters, sort control, clear-filters action, responsive list (table on desktop, cards on mobile), pagination; (2) Create Ticket — form with title, required category, priority, required related-system single select, description, attachment picker; (3) Ticket Detail — read-only ticket information and attachment management.
- **States:** initial, loading (skeleton), validation (inline, field-level), submitting (busy button), success, failure (inline alert + retry).
- **Responsive rules:** Desktop ≥992px multi-column table + two-column form; Tablet 768–991px two-column; Mobile <768px stacked, touch targets ≥44px, no horizontal scroll.
- **Accessibility:** visible labels, `aria-describedby` for inline validation, visible focus ring, errors and badges never rely on color alone, keyboard-operable controls.

## 7. Data Changes

### Models (Prisma)

| Model | Key fields | Notes |
|---|---|---|
| `Requester` | `id` (Int PK), `name`, `email` (unique), `isActive` (Boolean, default true), `createdAt` | Seeded Development Requester identities. Not a User/auth model. |
| `Ticket` | `id` (Int PK), `ticketNumber` (String, unique), `title`, `description` (nullable), `status` (enum, default `NEW`), `priority` (enum, default `MEDIUM`), `requesterId` (FK → Requester), `categoryId` (FK → Category), `relatedSystemId` (FK → RelatedSystem, required), `createdAt`, `updatedAt` | Core ticket record. |
| `Category` | existing Lab 1 model (id, name unique, createdAt) | Reused unchanged; four seeded categories. |
| `Attachment` | `id` (Int PK), `ticketId` (FK → Ticket, `onDelete: Cascade`), `fileName` (original), `storedName` (server-generated), `mimeType`, `sizeBytes` (Int), `uploadedAt`, `removedAt` (nullable) | Soft-removal lifecycle. |
| `RelatedSystem` | `id` (Int PK), `name` (String, unique), `createdAt` | Seeded reference data (6+ entries). |

### Enums

- `Status { NEW }` — deliberately limited to `NEW` this sprint. Extending in a later lab requires a Prisma migration, which is the intended path for the IT Staff workflow.
- `Priority { LOW, MEDIUM, HIGH, CRITICAL }` — default `MEDIUM`.

### Relationships

- `Requester 1—N Ticket` (a requester owns many tickets; a ticket has exactly one requester).
- `Category 1—N Ticket` (a ticket has exactly one category).
- `Ticket 1—N Attachment` (a ticket has many attachments).
- `RelatedSystem 1—N Ticket` (a ticket is associated with exactly one related system via the required `Ticket.relatedSystemId` FK; a related system can appear on many tickets).

### Indexes

- `Ticket.ticketNumber` — unique (lookup by official number).
- `Ticket (requesterId, createdAt DESC)` — composite; serves the primary owned-list query with default sort.
- `Ticket.categoryId`, `Ticket.priority`, `Ticket.relatedSystemId` — filtered lookups.
- `Attachment.ticketId` — attachment listing per ticket.

### Justified database design decision — soft removal via `removedAt`

Attachments are softly removed (`removedAt` timestamp) rather than hard-deleted. Rationale: (1) it preserves an audit trail that the future IT Staff workflow will need (who removed what, when); (2) it is reversible — a support agent can restore a mistakenly removed attachment without file recovery; (3) it keeps the physical file on disk recoverable during the sprint; and (4) it costs one nullable timestamp and one `WHERE removedAt IS NULL` clause in queries, which is trivial at this scale. Hard deletion would be a destructive, non-recoverable operation with no sprint requirement to justify it.

A second design decision: the externally visible identifier is the generated `ticketNumber` (used in URLs and the UI), while the integer `id` remains the internal primary key. This decouples the human-facing identifier from storage, gives requester-facing URLs a stable, shareable format (`/tickets/TTK-2026-000017`), and avoids exposing sequential database ids.

## 8. API Contract

Full contract with request/response examples, validation, and error tables: [`api-spec.md`](./api-spec.md). Summary:

- **Identity:** all `/api/tickets*` endpoints require the `X-Dev-Requester-Id` header (Development Requester id). Missing → 400; unknown → 401; inactive → 403. `/api/health`, `/api/categories`, `/api/requesters`, and `/api/related-systems` are header-free.
- **Create:** `POST /api/tickets` — body `{ title, description?, categoryId, priority?, relatedSystemId }` → 201 with the full ticket (ticketNumber generated, status `NEW`, priority defaulted to `MEDIUM`, relatedSystem included).
- **List:** `GET /api/tickets?page=&pageSize=&search=&categoryId=&priority=&sortBy=&sortDir=` → 200 with `{ data, meta }`; pagination metadata always present; only the active requester's tickets are ever returned.
- **Detail:** `GET /api/tickets/:ticketNumber` → 200 with ticket + `requester` + active `attachments` metadata; 404 not found; 403 not owned.
- **Attachments:** `POST /api/tickets/:ticketNumber/attachments` (multipart, field `file`) → 201 metadata (413 size / 415 type / 400 limit); `GET /api/tickets/:ticketNumber/attachments/:attachmentId/download` → 200 stream (404 if removed); `DELETE /api/tickets/:ticketNumber/attachments/:attachmentId` → 200 with `removedAt` set (soft removal).
- **Errors:** uniform envelope `{ error: string }`; validation adds `details: [{ field, message }]`. Status codes: 200, 201, 400, 401, 403, 404, 413, 415, 500. Unexpected server errors return a generic message with no stack traces.

## 9. Acceptance Criteria

Each criterion is stated in Given-When-Then form. All ACs are machine-verifiable; traceability to planned tests is in [`tests.md`](./tests.md).

- **AC-01 — Create ticket (happy path).** Given a requester is selected in the Development Requester selector, when they submit a valid ticket (title, category, related system, priority), then a 201 response returns a ticket with a generated `ticketNumber` matching `TTK-<year>-<6 digits>`, status `New`, the chosen priority, and the ticket appears in their My Tickets list.
- **AC-02 — Required-field validation.** Given the Create Ticket form, when the requester submits with an empty title or no category, then the form shows field-level inline errors next to each invalid field, no API request is sent, and the form remains editable.
- **AC-03 — Length validation.** Given the Create Ticket form, when the requester enters a title longer than 120 characters or a description longer than 4000 characters, then both the client and server reject the input with a clear field-level error.
- **AC-04 — Defaults.** Given a valid ticket submission without a priority, when the ticket is created, then its priority is `Medium` and its status is `New`.
- **AC-05 — Duplicate-submission prevention.** Given the requester clicks the Submit button, when they click it again before the request completes, then exactly one ticket is created and only one submission request is sent.
- **AC-06 — Ownership on list.** Given Requester A and Requester B each have tickets, when A opens My Tickets, then only A's tickets are shown and `totalItems` counts only A's tickets.
- **AC-07 — Ownership on detail.** Given Requester A is active, when A requests the detail of one of B's ticket numbers directly (e.g., via URL), then the API returns 403 with an ownership error and no ticket data is revealed.
- **AC-08 — Search.** Given a requester's tickets with varied titles/descriptions, when they enter a search term, then only tickets whose title or description contains the term (case-insensitive substring) are returned, and pagination resets to page 1.
- **AC-09 — Filtering.** Given tickets across categories and priorities, when the requester selects Category = Hardware and Priority = High, then only tickets matching both criteria are returned (AND logic).
- **AC-10 — Sorting.** Given a requester's tickets, when they sort by title ascending, then titles are ordered A–Z; when they sort by priority descending, then Critical tickets appear before High, Medium, then Low.
- **AC-11 — Pagination.** Given more than 10 tickets, when the requester requests page 2 with the default page size, then the second 10-item slice is returned with correct `meta` totals; page 0 or pageSize 51 is rejected with 400.
- **AC-12 — Attachment upload + download (happy path).** Given a requester owns a ticket, when they upload an allowlisted file ≤ 5 MB, then a 201 response returns its metadata, it appears in the ticket detail, and downloading it returns the identical bytes with the correct `Content-Type` and `Content-Disposition`.
- **AC-13 — Attachment validation.** Given a requester uploading to an owned ticket, when the file exceeds 5 MB, then the API returns 413 and the UI shows an inline "file too large" error; when the file type is not allowlisted, the API returns 415 and the UI shows an inline "unsupported type" error. No attachment metadata is created in either case.
- **AC-14 — Attachment limit.** Given a ticket already has 5 active attachments, when the requester uploads a 6th, then the API returns 400 with a clear "limit reached" message and the UI disables further adds with an explanatory message.
- **AC-15 — Attachment soft removal.** Given an active attachment on an owned ticket, when the requester removes it, then it is no longer listed in the detail view, the download endpoint returns 404 with a "removed" message, and the database row persists with a non-null `removedAt`.
- **AC-16 — Requester switching.** Given Requester A is active with search/filters applied, when the requester switches to Requester B in the selector, then the list reloads showing only B's tickets, search/filters/pagination are cleared, and a new ticket created afterwards is owned by B.
- **AC-17 — Empty states.** Given a requester with zero tickets, then My Tickets shows "No tickets yet" with a "Create your first ticket" action; given a requester with tickets whose search/filters match nothing, then the list shows "No results match your filters" with a "Clear filters" action.
- **AC-18 — Failure states.** Given the list or create API fails, then the UI shows a friendly inline error message with a retry action, does not crash, and preserves any in-progress form input; loading indicators are shown for all async operations.
- **AC-19 — Responsive behavior.** Given viewport widths of ≥992px, 768–991px, and <768px, then the ticket list renders as a multi-column table (desktop), a two-column layout (tablet), and stacked cards (mobile) with no horizontal scroll and touch targets ≥ 44px on mobile.
- **AC-20 — Accessibility.** Given the UI is exercised with a keyboard and a screen reader, then all form fields have visible labels and `aria-describedby` error wiring, focus is visibly indicated, validation errors and badges convey meaning without color alone, and all interactive controls are keyboard-operable.
- **AC-21 — Dev identity edge cases.** Given a request to any `/api/tickets*` endpoint, then a missing `X-Dev-Requester-Id` header returns 400, an unknown requester id returns 401, and an inactive requester id returns 403, each with a clear error message.
- **AC-22 — Related system selection.** Given a requester creating a ticket with a valid `relatedSystemId` referencing an existing RelatedSystem record, then the created ticket includes that related system in its detail response; given a missing or invalid ID, the server returns 400 with a field-level error.
- **AC-23 — Extended list fields and filters (My Tickets v2).** Given tickets with varying IT priorities, owners, and statuses, then `GET /api/tickets` returns `itPriority` and `ownerName` (nullable) per item; combining `itPriority` + `status` (+ other criteria) filters with AND semantics; an invalid enum value for either new filter returns 400; searching by ticket number matches case-insensitively; sorting by `ticketNumber` orders correctly; the UI renders the nine-column fluid table with sortable headers, the extended badge set, the "Showing X to Y of Z tickets" pagination footer, stacked mobile cards below 768px with no horizontal scroll, and shows each requester only their own tickets.

## 10. Definition of Done

The sprint is done when **all** of the following hold:

- [ ] All FR-01 through FR-18 are implemented and demonstrable end-to-end.
- [ ] All AC-01 through AC-22 pass; every AC has at least one passing automated test (see tests.md traceability matrix).
- [ ] The API enforces ownership on every ticket/attachment operation (no test can leak another requester's data).
- [ ] All planned tests in tests.md are green: server unit + API (Vitest/Supertest), client UI (Vitest + Testing Library), and E2E (Playwright), including responsive checks.
- [ ] `cd server && npm run build` and `cd client && npm run build` complete without errors; `npm run lint` is clean.
- [ ] Seed is idempotent: 4 categories (from Lab 1), 7 Related Systems, 4 active Development Requesters, and 1 inactive Development Requester can be re-seeded without duplicates.
- [ ] Attachment limits verified: 5/ticket, 5 MB/file, 4-type MIME allowlist; 413/415/400 paths return the documented shapes.
- [ ] Manual pass at three breakpoints (desktop/tablet/mobile) confirms ui-spec.md responsive rules, including no horizontal scroll on mobile.
- [ ] All four documents (specification, api-spec, ui-spec, tests) are updated to reflect final behavior and their Final Results sections are filled in.

## 11. Assumptions and Decisions

| # | Decision | Rationale |
|---|---|---|
| D-01 | URLs use `ticketNumber` (`TTK-…`), internal PK is integer `id`. | Human-readable, stable, shareable URLs; hides sequential ids; decouples UI identifier from storage. |
| D-02 | `Status` enum contains only `NEW` this sprint. | No lifecycle work is in scope; extending the enum later is a deliberate, migration-backed change. |
| D-03 | List filters are Category and Priority only; no Status filter. | Every ticket is `New` this sprint, so a status filter would be meaningless; the API shape is designed so a status filter can be added later without breaking changes. |
| D-04 | Identity travels per-request via `X-Dev-Requester-Id`; the server keeps no session. | Matches "testing only" semantics, is trivially testable, and maps cleanly to a real auth token header later. |
| D-05 | Missing/unknown/inactive dev requester → 400/401/403 respectively. | Distinguishes malformed requests (400), unknown identity (401), and a known-but-disabled identity (403); all clearly labeled as dev-mode behavior. |
| D-06 | Duplicate submission is prevented client-side only; the server does not dedupe by content. | Identical tickets are legitimate; idempotency keys would add complexity with no sprint requirement. Verified by E2E double-click test. |
| D-07 | Attachments are stored on local disk (`server/uploads/`, gitignored); only metadata lives in the DB. | Simplest correct design for the sprint; object storage (S3 etc.) can replace the storage layer later without changing the API contract. |
| D-08 | Limits: 5 active attachments/ticket, 5 MB/file, 4-type MIME allowlist. | Concrete, testable limits; values are documented defaults that product can tune later. |
| D-09 | Search is ILIKE substring on title + description. | Sufficient for MVP data volumes; full-text search is a documented future upgrade. |
| D-10 | Cross-requester access returns explicit 403 rather than a masked 404. | The lab requires demonstrable ownership protection; an explicit denial is easier to verify and reason about than anti-enumeration masking. (A production system may revisit this.) |
| D-11 | Categories are reused unchanged from Lab 1; requesters are new seeded data. | Avoids churn on an existing, working model; keeps the four-course-defined categories authoritative. |
| D-12 | Timestamps are stored in UTC and rendered in the requester's local timezone. | Standard practice; keeps stored data unambiguous. |
| D-13 | The Development Requester selection may persist in localStorage; switching always resets list context. | Good UX while preserving per-requester data isolation in the UI; the server never persists the "current" requester. |
| D-14 | `/api/health`, `/api/categories`, `/api/requesters`, `/api/related-systems` are header-free. | They expose no requester-owned data; keeps the existing Lab 1 health/categories contract unchanged. |
| D-15 | Related Systems are a seeded lookup table; every ticket references exactly one via a required one-to-many FK (labsheet 4.4 / 5.1 / 6). | Real service desks track affected systems; the lookup table is simple to seed and query; one-to-many keeps the common "ticket affects a single system" case simple while allowing a system to appear on many tickets. |
| D-16 | `itPriority` and `ownerName` are nullable, denormalized display columns on Ticket (no IT Staff foreign key this sprint). | The v2 screen needs to display IT-side data the requester model cannot provide; a real IT Staff relation arrives in a later lab, and nullable columns keep the migration purely additive with zero impact on existing endpoints or tests. |
| D-17 | The Status enum is extended in place (NEW + OPEN, PENDING, IN_PROGRESS, RESOLVED) rather than introducing a second field. | One status axis keeps BR-02 ("new tickets are NEW"), filtering, and badge rendering coherent; extending a PostgreSQL enum is additive and requires no backfill because every existing row is already NEW. |
| D-18 | Create-screen pending files use a compensation strategy: ticket is created first (201), then each pending file is uploaded sequentially to the new ticket; per-file failure shows an inline chip error while the ticket persists. | Guarantees the ticket is never lost due to an attachment failure; sequential uploads keep the 5-active limit check deterministic and allow a single failing file to be retried or dismissed without rolling back the ticket. Documented for Issue #17. |
