# CPE 334 Lab 2 — TokTickIT Requester Ticketing MVP: Test Plan

- **Status:** Draft v1.0 — all results **Pending** until implementation
- **Companion documents:** [`specification.md`](./specification.md), [`api-spec.md`](./api-spec.md), [`ui-spec.md`](./ui-spec.md)

---

## 1. Test Strategy

Four automated layers, mirroring the Lab 1 convention of per-lab test directories:

1. **Unit (server, Vitest)** — pure logic with no I/O: ticket-number generation, priority-rank mapping, search normalization.
2. **API (server, Vitest + Supertest)** — the REST contract in api-spec.md against the real PostgreSQL database: creation, validation, ownership, search/filter/sort/pagination, attachment lifecycle, error codes (400/401/403/404/413/415/500), and safe-failure behavior. Each test creates its own data and cleans up after itself; ownership tests create two requesters and assert isolation.
3. **UI (client, Vitest + Testing Library)** — component behavior with mocked API: form validation, busy/disabled states, loading/empty/failure rendering, selector switching, attachment chip states.
4. **E2E (client, Playwright)** — full-stack flows against the running dev servers (API + Vite) and seeded database: create → list → detail, cross-requester ownership, attachment upload/download/remove, double-click prevention, and responsive checks at three viewports.

Test files live under `server/tests/lab-02/` and `client/tests/lab-02/`. API and E2E tests require PostgreSQL migrated and seeded (commands in §5).

## 2. Planned Tests

### 2.1 Unit (server)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| UT-01 | Unit | FR-02, BR-01, AC-01 | Ticket-number generator emits `TTK-<year>-<6 zero-padded digits>` | Format matches regex; consecutive calls increment the sequence; values unique | `server/tests/lab-02/unit/ticketNumber.test.ts` | Pending |
| UT-02 | Unit | FR-07, BR-09, AC-10 | Priority-rank map used by the sort comparator (LOW 1 → CRITICAL 4) | Comparator orders Critical > High > Medium > Low | `server/tests/lab-02/unit/priorityRank.test.ts` | Pending |
| UT-03 | Unit | FR-05, BR-07, AC-08 | Search-term normalization (trim, case-insensitive substring predicate) | "  NETWORK " matches "network" in title/description; empty term matches all | `server/tests/lab-02/unit/search.test.ts` | Pending |

### 2.2 API (server)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| API-01 | API | BR-06, AC-21 | `POST /api/tickets` without `X-Dev-Requester-Id` | 400 + error envelope | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-02 | API | BR-06, AC-21 | Header with unknown requester id | 401 `Unknown development requester` | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-03 | API | BR-15, AC-21 | Header with an inactive requester id (test-created) | 403 `Requester account is inactive` | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-04 | API | FR-01/02/03, AC-01/04 | Create valid ticket with explicit priority | 201; `ticketNumber` format; `status NEW`; priority echoed | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-05 | API | FR-01, AC-02/03 | Create with empty title, title > 120 chars, description > 4000 chars, missing categoryId | 400 `Validation failed` + `details` entries per field | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-06 | API | FR-01, BR-11 | Create with nonexistent categoryId and invalid priority | 400 with field-specific messages | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-07 | API | FR-04/14, AC-06 | List returns only the active requester's tickets (two requesters seeded with data) | `data` contains only requester A tickets; `totalItems` counts only A's | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-08 | API | FR-05, AC-08 | `search` matches case-insensitively across title and description; empty search returns all | Subset matched; page resets to 1 | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-09 | API | FR-06, AC-09 | `categoryId` + `priority` filters combine with AND | Only tickets matching both returned | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-10 | API | FR-07, AC-10 | Sort by `title asc` and `priority desc`; invalid `sortBy`/`sortDir` | Correct ordering incl. priority rank; 400 on invalid values | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-11 | API | FR-04, AC-11 | Pagination: 25 tickets, page 2 of default 10; `page=0`; `pageSize=51`; `categoryId` filter that doesn't exist | Correct slice + `meta` totals; 400 on invalid page/pageSize/filter | `server/tests/lab-02/api/tickets.test.ts` | Pending |
| API-12 | API | FR-08/14, AC-07 | Detail by ticketNumber: owned → 200 with requester + attachments; other-owner → 403; nonexistent → 404; malformed number → 400 | Documented status codes and messages; no data leak on 403 | `server/tests/lab-02/api/ticketDetail.test.ts` | Pending |
| API-13 | API | FR-09, AC-12 | Upload a valid 1 KB PNG to an owned ticket | 201 metadata; file stored; metadata matches | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-14 | API | FR-09, AC-13 | Upload a file > 5 MB | 413; no metadata persisted | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-15 | API | FR-09, AC-13 | Upload a disallowed type (e.g., `.exe`) | 415; no metadata persisted | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-16 | API | FR-09, AC-14 | Upload a 6th attachment to a ticket with 5 active | 400 limit-reached message | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-17 | API | FR-12, AC-15 | Soft-remove an attachment, then attempt download and re-remove | 200 with `removedAt` set; download 404 `Attachment has been removed`; re-remove 404; DB row persists with `removedAt` | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-18 | API | FR-11/14, AC-12/07 | Download returns byte-identical stream with correct `Content-Type`/`Content-Disposition`; requester B downloading A's attachment | 200 + headers + identical bytes; 403 for B | `server/tests/lab-02/api/attachments.test.ts` | Pending |
| API-19 | API | FR-10, AC-15 | Detail response excludes removed attachments | `attachments` lists active only; `removedAt` not null entries absent | `server/tests/lab-02/api/ticketDetail.test.ts` | Pending |
| API-20 | API | BR-13, AC-18 | Simulated DB failure on list endpoint (mock/stub) | 500 with generic message, no stack trace in body | `server/tests/lab-02/api/errors.test.ts` | Pending |
| API-21 | API | FR-13, BR-05 | `GET /api/requesters` returns only active requesters ordered by id | 200; 4 active seeded; inactive excluded | `server/tests/lab-02/api/requesters.test.ts` | Pending |

### 2.3 UI (client, component tests with mocked API)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| UI-01 | UI | FR-01, AC-02/03 | Create form: submit with empty title/missing category; long title; long description | Inline field errors with icon + text; no API call; first invalid field focused | `client/tests/lab-02/ui/createTicket.test.tsx` | Pending |
| UI-02 | UI | BR-12, AC-05 | Submit button busy/disabled while request in flight; rapid double-click | Exactly one create call; button shows "Submitting…" and ignores repeat clicks | `client/tests/lab-02/ui/createTicket.test.tsx` | Pending |
| UI-03 | UI | FR-01, AC-01 | Successful create with mocked API | Navigates to detail / shows success with generated ticket number | `client/tests/lab-02/ui/createTicket.test.tsx` | Pending |
| UI-04 | UI | FR-04/15, AC-11/18 | My Tickets renders skeleton while loading, then rows; failure shows error + Try again | Loading skeleton visible; rows render; error banner + retry re-fetches | `client/tests/lab-02/ui/ticketList.test.tsx` | Pending |
| UI-05 | UI | FR-15, AC-17 | Empty list vs no-results states | "No tickets yet" + CTA when zero tickets; "No results match your filters" + Clear filters when filters match nothing | `client/tests/lab-02/ui/ticketList.test.tsx` | Pending |
| UI-06 | UI | FR-05/06/07, AC-08/09/10 | Search, category/priority filters, sort control issue correct API params; Clear filters resets | Requests carry `search`/`categoryId`/`priority`/`sortBy`/`sortDir`; clear resets to defaults | `client/tests/lab-02/ui/ticketList.test.tsx` | Pending |
| UI-07 | UI | FR-13, AC-16 | Requester switch reloads list and clears search/filters/pagination | All list API calls after switch use new `X-Dev-Requester-Id`; context reset; caption visible | `client/tests/lab-02/ui/requesterSelector.test.tsx` | Pending |
| UI-08 | UI | FR-09/13, AC-13/14 | Attachment picker: oversize/unsupported file errors inline; 5-limit disables picker | Per-file invalid chip + message; "limit reached" caption; no upload attempted | `client/tests/lab-02/ui/attachments.test.tsx` | Pending |
| UI-09 | UI | FR-12, AC-15 | Remove attachment flow with inline confirm; chip becomes Removed | Confirm dialog; after remove, chip grayed + "Removed" badge; download action gone | `client/tests/lab-02/ui/attachments.test.tsx` | Pending |
| UI-10 | UI | BR-13, AC-18 | Create/list/download failure preserves input and offers retry | Inline alert + retry; form values intact after failure | `client/tests/lab-02/ui/ticketList.test.tsx` | Pending |
| UI-11 | UI | FR-16, AC-20 | Accessibility: required asterisk, `aria-describedby` error wiring, visible focus on keyboard nav | Assertions on `aria-invalid`, `aria-describedby`, focus outline visibility, label associations | `client/tests/lab-02/ui/a11y.test.tsx` | Pending |

### 2.4 E2E (client, Playwright)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | FR-01, AC-01/05 | Full create flow against real API, including a deliberate double-click on Submit | Ticket appears in My Tickets with `TTK-…` number, status New; **exactly one** ticket created | `client/tests/lab-02/e2e/create-ticket.spec.ts` | Pending |
| E2E-02 | E2E | FR-14, AC-06/07 | Requester A creates tickets; switch to B; B's list excludes A's; B opening A's detail URL shows 403 error state | List isolation verified visually + API; 403 page/state shown, no ticket data | `client/tests/lab-02/e2e/ownership.spec.ts` | Pending |
| E2E-03 | E2E | FR-09/11/12, AC-12/15 | Upload a real file via the picker, download it, verify bytes, soft-remove, verify Removed | File downloadable byte-identical; chip transitions Active → Removed; download after remove fails | `client/tests/lab-02/e2e/attachments.spec.ts` | Pending |
| E2E-04 | E2E | FR-16, AC-19 | Viewports 375px, 820px, 1280px on My Tickets + Create Ticket | Mobile: stacked cards, no horizontal scroll, touch targets ≥ 44px; tablet: two-column; desktop: table + two-column form | `client/tests/lab-02/e2e/responsive.spec.ts` | Pending |
| E2E-05 | E2E | FR-13, AC-16 | End-to-end requester switching with real data for A and B | Switch reloads only B's tickets; new ticket created is owned by B | `client/tests/lab-02/e2e/ownership.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

Every AC (specification.md §9) maps to at least one planned test:

| AC | Covered by |
|---|---|
| AC-01 Create ticket (happy path) | API-04, UI-03, E2E-01, UT-01 |
| AC-02 Required-field validation | API-05, UI-01 |
| AC-03 Length validation | API-05, UI-01 |
| AC-04 Defaults (Medium, New) | API-04 |
| AC-05 Duplicate-submission prevention | UI-02, E2E-01 |
| AC-06 Ownership on list | API-07, E2E-02 |
| AC-07 Ownership on detail | API-12, API-18, E2E-02 |
| AC-08 Search | UT-03, API-08, UI-06 |
| AC-09 Filtering (AND) | API-09, UI-06 |
| AC-10 Sorting (incl. priority rank) | UT-02, API-10, UI-06 |
| AC-11 Pagination | API-11, UI-04 |
| AC-12 Attachment upload + download | API-13, API-18, E2E-03 |
| AC-13 Attachment validation (413/415) | API-14, API-15, UI-08 |
| AC-14 Attachment limit (5) | API-16, UI-08 |
| AC-15 Attachment soft removal | API-17, API-19, UI-09, E2E-03 |
| AC-16 Requester switching | UI-07, E2E-05 |
| AC-17 Empty states | UI-05 |
| AC-18 Failure states | API-20, UI-04, UI-10 |
| AC-19 Responsive behavior | E2E-04 |
| AC-20 Accessibility | UI-11 |
| AC-21 Dev identity edge cases (400/401/403) | API-01, API-02, API-03 |

## 4. Responsive and Visual Checklist (manual pass)

Performed against the running app at the three breakpoints in ui-spec.md §7 (desktop ≥ 992px, tablet 768–991px, mobile < 768px):

- [ ] My Tickets renders as a 6-column table on desktop; reduced columns on tablet; stacked cards on mobile.
- [ ] Create Ticket form is two-column on desktop/tablet, stacked full-width on mobile.
- [ ] No horizontal scroll or clipped content at any breakpoint (verify with `document.documentElement.scrollWidth <= innerWidth`).
- [ ] Touch targets ≥ 44×44px on mobile (buttons, pagination, attachment actions, nav).
- [ ] Dev Requester selector visible and usable at all breakpoints (compact on mobile).
- [ ] Zen Green tokens applied consistently: page bg `#F5F7F6`, white cards, primary green `#006B3C`, pale green `#EAF6EF` accents.
- [ ] Read-only fields (detail) show soft gray-green / warm ivory backgrounds; editable fields white.
- [ ] Required asterisk red; inline validation messages directly under fields with icon + text.
- [ ] Focus ring visible on keyboard navigation; contrast of body text and primary buttons ≥ 4.5:1.
- [ ] Priority/status badges show text labels (never color-only); Critical badge distinct from High.
- [ ] Empty vs no-results states visually distinct with correct CTAs.
- [ ] Pagination shows "Showing X–Y of Z"; Prev/Next disabled at bounds.
- [ ] Attachment chips show all five states (Active / Uploading / Invalid / Removed / Unavailable).

## 5. Test Commands

Prerequisites (fresh database):

```bash
docker compose up -d
cd server && npm install
cp .env.example .env
npx prisma migrate dev   # applies the Lab 2 migration (Ticket/Requester/Attachment tables)
npx prisma db seed       # idempotent: 4 categories + 4 active Development Requesters
```

Run each layer:

```bash
# Server: unit + API tests (Vitest + Supertest)
cd server && npm test

# Client: UI component tests (Vitest + Testing Library)
cd client && npm test

# Client: E2E (Playwright) — requires API on :4000 and Vite dev server on :5173
cd client && npm run test:e2e

# Typecheck + lint + build gates
cd server && npm run build
cd client && npm run build
cd client && npm run lint
```

CI note: `npm test` in `server` may need a `--runInBand`-style serial execution if the test suite creates concurrent database fixtures; if required, document the exact command in the Final Results section.

## 6. Final Results

_Pending — to be completed after implementation. Record per-test outcomes (Pass/Fail + notes) for every row in §2, the executed commands from §5, and any deviations from this plan._

## 7. Known Limitations

- **Identity is simulated.** Tests assert per-requester isolation via `X-Dev-Requester-Id`, which is a testing mechanism, not real authentication; real auth is out of scope and untested.
- **Status is fixed at New.** No lifecycle tests exist because no lifecycle exists this sprint; the `Status` enum will be extended by a later migration.
- **Search is substring-based** (ILIKE), not full-text; precision/recall characteristics differ from a production search engine.
- **Attachments are stored on local disk** (`server/uploads/`); durability, virus scanning, and object storage are out of scope.
- **No server-side idempotency.** Duplicate-submission prevention is client-side; a network retry can legitimately create two tickets (documented decision D-06).
- **Single-region timestamps:** stored UTC, displayed in the browser's local timezone; DST edge cases are not tested.
- **Responsive coverage** is limited to the three defined breakpoints; intermediate widths are spot-checked manually.
- **DB-backed API tests require PostgreSQL** migrated and seeded; they will fail without the Docker database running.
