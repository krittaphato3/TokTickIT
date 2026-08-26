# CPE 334 Lab 2 — TokTickIT Requester Ticketing MVP: Test Plan

- **Status:** Draft v1.0 — Issue #13 rows (**UT-01, API-01..06, API-21, API-22, API-23, API-24**), Issue #14 rows (**UI-01, UI-02, UI-03**), Issue #15 rows (**UT-02, UT-03, API-07..API-11, API-20**) and Issue #16 rows (**UI-04, UI-05, UI-06, UI-10, UI-11**) are **Pass**; Issue #30 rows (**API-26..28, UI-13..15**) were added for My Tickets v2 (note: the prompt's proposed IDs API-22..24 / UI-12 were already allocated to Related System tests, so the next free numbers were used) and remain **Pending** until implemented; Issue #30 rows (**API-26..28, UI-13..15, E2E-01/02/04/05/06**) are **Pass**; the remaining rows (**E2E-03, API-25, UI-07..09, UI-12**) stay **Pending** until their owning issue is implemented.
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
| UT-01 | Unit | FR-02, BR-01, AC-01 | Ticket-number generator emits `TTK-<year>-<6 zero-padded digits>` | Format matches regex; consecutive calls increment the sequence; values unique | `server/tests/lab-02/unit/ticketNumber.test.ts` | Pass |
| UT-02 | Unit | FR-07, BR-09, AC-10 | Priority-rank map used by the sort comparator (LOW 1 → CRITICAL 4) | Comparator orders Critical > High > Medium > Low | `server/tests/lab-02/unit/priorityRank.test.ts` | Pass |
| UT-03 | Unit | FR-05, BR-07, AC-08 | Search-term normalization (trim, case-insensitive substring predicate) | "  NETWORK " matches "network" in title/description; empty term matches all | `server/tests/lab-02/unit/search.test.ts` | Pass |

### 2.2 API (server)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| API-01 | API | BR-06, AC-21 | `POST /api/tickets` without `X-Dev-Requester-Id` | 400 + error envelope | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | API | BR-06, AC-21 | Header with unknown requester id | 401 `Unknown development requester` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | API | BR-15, AC-21 | Header with an inactive requester id (seeded Epsilon) | 403 `Requester account is inactive` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | API | FR-01/02/03, AC-01/04 | Create valid ticket with explicit priority | 201; `ticketNumber` format; `status NEW`; priority echoed | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | API | FR-01, AC-02/03 | Create with empty title, title > 120 chars, description > 4000 chars, missing categoryId | 400 `Validation failed` + `details` entries per field | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-06 | API | FR-01, BR-11 | Create with nonexistent categoryId and invalid priority | 400 with field-specific messages | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-07 | API | FR-04/14, AC-06 | List returns only the active requester's tickets (two requesters seeded with data) | `data` contains only requester A tickets; `totalItems` counts only A's | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-08 | API | FR-05, AC-08 | `search` matches case-insensitively across title and description; empty search returns all | Subset matched; page resets to 1 | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-09 | API | FR-06, AC-09 | `categoryId` + `priority` filters combine with AND | Only tickets matching both returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-10 | API | FR-07, AC-10 | Sort by `title asc` and `priority desc`; invalid `sortBy`/`sortDir` | Correct ordering incl. priority rank; 400 on invalid values | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | API | FR-04, AC-11 | Pagination: 25 tickets, page 2 of default 10; `page=0`; `pageSize=51`; `categoryId` filter that doesn't exist | Correct slice + `meta` totals; 400 on invalid page/pageSize/filter | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | API | FR-08/14, AC-07 | Detail by ticketNumber: owned → 200 with requester + attachments; other-owner → 403; nonexistent → 404; malformed number → 400 | Documented status codes and messages; no data leak on 403 | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-13 | API | FR-09, AC-12 | Upload a valid 1 KB PNG to an owned ticket | 201 metadata; file stored; metadata matches | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-14 | API | FR-09, AC-13 | Upload a file > 5 MB | 413; no metadata persisted | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-15 | API | FR-09, AC-13 | Upload a disallowed type (e.g., `.exe`) | 415; no metadata persisted | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-16 | API | FR-09, AC-14 | Upload a 6th attachment to a ticket with 5 active | 400 limit-reached message | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-17 | API | FR-12, AC-15 | Soft-remove an attachment, then attempt download and re-remove | 200 with `removedAt` set; download 404 `Attachment has been removed`; re-remove 404; DB row persists with `removedAt` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-18 | API | FR-11/14, AC-12/07 | Download returns byte-identical stream with correct `Content-Type`/`Content-Disposition`; requester B downloading A's attachment | 200 + headers + identical bytes; 403 for B | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-19 | API | FR-10, AC-15 | Detail response excludes removed attachments | `attachments` lists active only; `removedAt` not null entries absent | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-20 | API | BR-13, AC-18 | Simulated DB failure on list endpoint (mock/stub) | 500 with generic message, no stack trace in body | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-21 | API | FR-13, BR-05 | `GET /api/requesters` returns only active requesters ordered by id (5 seeded: 4 active + 1 inactive Epsilon excluded) | 200; 4 active returned; inactive excluded | `server/tests/lab-02/api/requesters.test.ts` | Pass |
| API-22 | API | FR-17, AC-22 | `GET /api/related-systems` returns all 7 seeded systems ordered by id | 200; 7 systems returned | `server/tests/lab-02/api/relatedSystems.test.ts` | Pass |
| API-23 | API | FR-17, BR-19, AC-22 | Create ticket with a valid `relatedSystemId`; response includes `relatedSystem` | 201; relatedSystem matches the provided ID | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-24 | API | FR-17, BR-19, AC-22 | Create ticket with a missing or invalid `relatedSystemId` | 400 field error (`Related system is required` / `Related system does not exist`) | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-25 | API | FR-17, AC-22 | Detail and list responses include `relatedSystem` | relatedSystem present in both 200 responses | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-26 | API | FR-18, BR-20, BR-21, AC-23 | List items return nullable `itPriority`/`ownerName` + extended status; combined `itPriority` + `status` (+ category) filters AND-combine; invalid enum value for either new filter → 400 | Exact-match rows only; null fields returned as null; invalid `itPriority`/`status` → 400 | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-27 | API | FR-18, BR-07, AC-23 | Search matches ticket number case-insensitively (`search=ttk-…`); still matches title/description as before | Only ticket(s) whose ticketNumber contains the term are returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-28 | API | FR-18, BR-09, AC-23 | `sortBy=ticketNumber&sortDir=asc/desc` orders by ticket number; invalid `sortBy=ticketNo` → 400 | Rows ordered lexicographically per direction; invalid value rejected with 400 | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |

### 2.3 UI (client, component tests with mocked API)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| UI-01 | UI | FR-01, AC-02/03 | Create form: submit with empty title/missing category; long title; long description | Inline field errors with icon + text; no API call; first invalid field focused | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-02 | UI | BR-12, AC-05 | Submit button busy/disabled while request in flight; rapid double-click | Exactly one create call; button shows "Submitting…" and ignores repeat clicks | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-03 | UI | FR-01, AC-01 | Successful create with mocked API | Navigates to detail / shows success with generated ticket number | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-03a (extra) | UI | AC-20 | Visible labels wired via for/id; aria-invalid + aria-describedby on invalid fields; focus moves to first invalid field; attachment picker allowlist/5 MB/5-cap client rules | Label/control wiring asserted; error slot referenced by aria-describedby; picker rejects bad type, > 5 MB, 6th file | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-04 | UI | FR-04/15, AC-11/18 | My Tickets renders skeleton while loading, then rows; failure shows error + Try again | Loading skeleton visible; rows render; error banner + retry re-fetches | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-05 | UI | FR-15, AC-17 | Empty list vs no-results states | "No tickets yet" + CTA when zero tickets; "No results match your filters" + Clear filters when filters match nothing | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-06 | UI | FR-05/06/07, AC-08/09/10 | Search, category/priority filters, sort control issue correct API params; Clear filters resets | Requests carry `search`/`categoryId`/`priority`/`sortBy`/`sortDir`; clear resets to defaults | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-07 | UI | FR-13, AC-16 | Requester switch reloads list and clears search/filters/pagination | All list API calls after switch use new `X-Dev-Requester-Id`; context reset; caption visible | `client/tests/lab-02/ui/requesterSelector.test.tsx` | Pending |
| UI-08 | UI | FR-09/13, AC-13/14 | Attachment picker: oversize/unsupported file errors inline; 5-limit disables picker | Per-file invalid chip + message; "limit reached" caption; no upload attempted | `client/tests/lab-02/ui/attachments.test.tsx` | Pending |
| UI-09 | UI | FR-12, AC-15 | Remove attachment flow with inline confirm; chip becomes Removed | Confirm dialog; after remove, chip grayed + "Removed" badge; download action gone | `client/tests/lab-02/ui/attachments.test.tsx` | Pending |
| UI-10 | UI | BR-13, AC-18 | Create/list/download failure preserves input and offers retry | Inline alert + retry; form values intact after failure | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | FR-16, AC-20 | Accessibility: required asterisk, `aria-describedby` error wiring, visible focus on keyboard nav | Assertions on `aria-invalid`, `aria-describedby`, focus outline visibility, label associations | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI | FR-17, AC-22 | Related system select renders seeded options; selection sends correct `relatedSystemId` in create payload; detail shows the chip | Options loaded from API; selected ID sent in request; detail shows related system chip | `client/tests/lab-02/ui/createTicket.test.tsx` | Pending |
| UI-13 | UI | FR-18, BR-20/21, AC-23 | New IT Priority / Current Status filters issue correct `itPriority`/`status` params; any filter change resets page to 1; search placeholder is "Search by ticket number or summary." | Requests carry the new params exactly when set; page reset asserted on change | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-14 | UI | FR-18, FR-16, AC-20/23 | Sortable headers cycle asc/desc with stacked carets and `aria-sort`; switching column applies its natural default direction (Ticket No. → asc, dates → desc) | aria-sort toggling asserted per click; direction defaults asserted on column switch | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-15 | UI | FR-04, AC-11/23 | Pagination footer "Showing X to Y of Z tickets" (aria-live polite); window 1–5 + ellipsis + last page; active page solid green with aria-current; bounds disabled; page change scrolls to top | Window shapes and showing text asserted against stubbed multi-page meta | `client/tests/lab-02/MyTickets.test.tsx` | Pending |

### 2.4 E2E (client, Playwright)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | FR-01, AC-01/05 | Full create flow against real API, including a deliberate double-click on Submit | Ticket appears in My Tickets with `TTK-…` number, status New; **exactly one** ticket created | `client/tests/lab-02/e2e/create-ticket.spec.ts` | Pass |
| E2E-02 | E2E | FR-14, AC-06/07 | Requester A creates tickets; switch to B; B's list excludes A's; B opening A's detail URL shows 403 error state | List isolation verified visually + API; 403 page/state shown, no ticket data | `client/tests/lab-02/e2e/ownership.spec.ts` | Pass |
| E2E-03 | E2E | FR-09/11/12, AC-12/15 | Upload a real file via the picker, download it, verify bytes, soft-remove, verify Removed | File downloadable byte-identical; chip transitions Active → Removed; download after remove fails | `client/tests/lab-02/e2e/attachments.spec.ts` | Pending |
| E2E-04 | E2E | FR-16, AC-19 | Viewports 375px, 820px, 1280px on My Tickets + Create Ticket | Mobile: stacked cards, no horizontal scroll, touch targets ≥ 44px; tablet: two-column; desktop: table + two-column form | `client/tests/lab-02/e2e/responsive.spec.ts` | Pass |
| E2E-05 | E2E | FR-13, AC-16 | End-to-end requester switching with real data for A and B | Switch reloads only B's tickets; new ticket created is owned by B | `client/tests/lab-02/e2e/ownership.spec.ts` | Pass |
| E2E-06 | E2E | FR-17, AC-22 | Create ticket with a related system end-to-end; verify the chip in detail | Related system appears as a chip in detail; create with an invalid ID shows error | `client/tests/lab-02/e2e/create-ticket.spec.ts` | Pass |

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
| AC-22 Related system selection | API-22, API-23, API-24, API-25, UI-12, E2E-06 |
| AC-23 Extended list fields/filters (v2) | API-26, API-27, API-28, UI-13, UI-14, UI-15 |

## 4. Responsive and Visual Checklist (manual pass)

Performed against the running app at the three breakpoints in ui-spec.md §7 (desktop ≥ 992px, tablet 768–991px, mobile < 768px):

- [ ] My Tickets renders the 9-column v2 fluid table on desktop/tablet (Ticket No., Created Date, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, Last Updated); stacked cards on mobile.
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
- [ ] Pagination shows "Showing X to Y of Z tickets"; Prev/Next disabled at bounds.
- [ ] Attachment chips show all five states (Active / Uploading / Invalid / Removed / Unavailable).

## 5. Test Commands

Prerequisites (fresh database):

```bash
docker compose up -d
cd server && npm install
cp .env.example .env
npx prisma migrate dev   # applies the Lab 2 migration (Ticket/Requester/Attachment/RelatedSystem tables; Ticket.systemId FK → RelatedSystem)
npx prisma db seed       # idempotent: 4 categories + 7 Related Systems + 4 active + 1 inactive Development Requesters
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

_Issue #15 (My Tickets API) recorded 2026-08-24. Earlier-issue rows were recorded on their owning branches._

### Issue #15 — GET /api/tickets (UT-02, UT-03, API-07..API-11, API-20)

Commands executed (from `server/`, embedded PostgreSQL running via `npm run db:up`):

```bash
npx vitest run tests/lab-02/unit/priorityRank.test.ts tests/lab-02/unit/search.test.ts
npx vitest run tests/lab-02/my-tickets.api.test.ts
npm test          # full server suite
npm run build     # typecheck/build gate
```

Outcomes:

| Test ID | Outcome | Notes |
|---|---|---|
| UT-02 | Pass | Rank map LOW 1 → CRITICAL 4; comparator highest-first; alphabetical-label trap covered |
| UT-03 | Pass | Trim + lowercase normalization; blank/absent term → no filter; title OR description predicate |
| API-07 | Pass | Two-requester isolation; `totalItems` per requester; list-row shape; 400/401/403 header contract |
| API-08 | Pass | Case-insensitive match on title and description; empty/blank search returns all; pagination resets to page 1 of the matched subset |
| API-09 | Pass | categoryId + priority combine with AND; each filter alone returns the superset; invalid priority → 400 |
| API-10 | Pass | createdAt desc default; title asc/desc; priority rank desc/asc with deterministic tie-break; invalid sortBy/sortDir → 400 |
| API-11 | Pass | 25 fixtures, page 2 slice at default pageSize 10, final partial page hasNextPage=false; page=0 / page=abc / pageSize=0 / pageSize=51 / nonexistent categoryId → 400 |
| API-20 | Pass | `$transaction` stubbed to reject → generic 500 envelope; body contains neither the simulated error text nor a stack trace |

Totals: full server suite **57/57 passing across 10 files** (`npm test`); build gate clean. The red→green cycle was real: all 22 new API assertions first failed with `expected 404` (no route) and both unit files failed on missing exports before implementation.

Deviations / notes:

- **Serial file execution is now mandatory**, as anticipated by the CI note above: `vitest.config.ts` sets `fileParallelism: false`. With parallel workers, `create-ticket.api.test.ts` and `my-tickets.api.test.ts` interleave writes for the same requesters against the shared database and exact-count assertions fail intermittently (~1 in 10 runs). Verified stable over 16 consecutive full-suite runs after the change.
- Priority sorting uses a parameterized raw SQL `CASE` rank expression (not Prisma enum ordering, which would sort alphabetically); page ids are selected first, then hydrated through Prisma with category/related-system includes so response shapes stay identical to §3.1.
- Search wildcards (`%`, `_`, `\`) in user input are escaped before ILIKE matching.
- Fixture tickets use reserved `TTK-<year>-9xxxxx` numbers so they never collide with sequence-issued numbers; the suite sweeps that band on start to self-heal after interrupted runs.

_Peer-review addendum (PR #27):_ the reviewer asked whether `%`, `_`, and `\` are escaped before ILIKE. Verification found the page query escaped correctly but the count path (Prisma `contains`) did not, so a term containing `%` or `_` behaved as a wildcard in `totalItems` while matching literally in `data`. Fixed by sharing one escaped ILIKE fragment (`buildIlikePattern` → `buildSearchFilter`) across the page query and the count; a wildcard-consistency test was added (red: `expected 3 to be 1`, green after fix). Suite now 60/60.

### Issue #16 — My Tickets UI (UI-04, UI-05, UI-06, UI-10, UI-11)

_Issue #16 (My Tickets UI) recorded 2026-08-25._

Commands executed (from `client/`):

```bash
npx vitest run tests/lab-02/MyTickets.test.tsx
npx vitest run          # full client suite
npm run build           # typecheck/build gate
```

Outcomes:

| Test ID | Outcome | Notes |
|---|---|---|
| UI-04 | Pass | Exactly 3 shimmer skeleton rows while in flight; rows + "Showing X–Y of Z" after resolve; every list call carries `X-Dev-Requester-Id`; error banner (`role="alert"`) with Try again re-fetches the current params |
| UI-05 | Pass | "No tickets yet" + "Create your first ticket" CTA at zero tickets/defaults; distinct "No results match your filters" when a non-default category matches nothing (stub returns empty only for that categoryId) |
| UI-06 | Pass | Search debounced 300ms into exactly one request; categoryId/priority/sort select map to correct params incl. all six sort labels; Clear filters appears only when non-default and restores defaults |
| UI-10 | Pass | Failure preserves filter inputs; retry re-fetches with the same search param and clears the banner |
| UI-11 | Pass | All six column headers with `scope="col"`; text-label badges for all four priorities + status New (dot glyph); monospace ticket-number links with accessible names; `aria-live="polite"` busy region; `aria-current="page"` on pagination |

Totals: **13/13 passing in MyTickets.test.tsx** (the 5 planned test IDs plus pagination bounds/window and BR-05 requester-switch coverage); full client suite **29/29 across 6 files**; build gate clean. The red→green cycle was real: the initial red phase had **11/11 tests failing** on the missing `MyTicketsPage` module/route (placeholder still rendered), before implementation turned them green.

Deviations / notes:

- Test file placed at `client/tests/lab-02/MyTickets.test.tsx` per protocol §4 mandatory path; the tests.md Automated Test File column for UI-04/05/06/10/11 was repointed from the original `ui/ticketList.test.tsx` / `ui/a11y.test.tsx` plan.
- ui-spec §10 corrected from a 7-column table (with Related System filter/column) to the shipped 6-column contract — matching Issue #16 scope, the approved mockup, and the GET /api/tickets API, which exposes no relatedSystemId filter; §7 desktop wording updated to 6 columns accordingly.
- BR-05 requester-switch reset was added after QA review: the list screen is keyed by active requester id in App.tsx, so switching remounts with defaults instead of refetching the previous requester's filters/page (which could render a blank stale-page state).
- Pagination numbered-button window capped at 5 whenever totalPages > 5 after QA review (totalPages = 6 previously rendered six buttons); shapes are now `1 … x y z … N` with first/last caps always present.
- Evidence screenshots in `artifacts/lab-02/screenshots/my-tickets/` (desktop/tablet/mobile + state-initial/state-api-failure/state-no-results/state-empty) captured against the live seeded stack via `client/scripts/my-tickets-shots.mjs`.

### Issue #30 — My Tickets v2 UI + additive API extensions (API-26..28, UI-13..15, E2E-01/02/04/05/06)

_Issue #30 (My Tickets v2) recorded 2026-08-26._

Commands executed (from `server/` and `client/`):

```bash
cd server && npm test            # 67/67 across 10 files
cd server && npm run build       # typecheck gate
cd client && npx vitest run      # 33/33 across 6 files
cd client && npm run build       # typecheck + Vite build
cd client && npm run lint        # ESLint clean
cd client && npx playwright test # 8/8 e2e across 3 specs
```

Outcomes:

| Test ID | Outcome | Notes |
|---|---|---|
| API-26 | Pass | List rows return nullable `itPriority`/`ownerName` + extended status; `itPriority` + `status` (+ category) AND-combine exactly (BR-20/21); invalid values → 400. Count-sensitive tests run against throwaway requesters so the seeded demo set never skews totals. |
| API-27 | Pass | Search matches `ticketNumber` case-insensitively in addition to title/description; ownership still scopes the result. |
| API-28 | Pass | `sortBy=ticketNumber` asc/desc orders lexicographically; error message lists the new key. |
| UI-13 | Pass | Nine columns in order; IT Priority badges incl. "Unset" and Ticket Owner incl. "Unassigned"; sortable headers cycle asc/desc with `aria-sort`, switching columns applies natural defaults (Ticket No. → asc, dates → desc). |
| UI-14 | Pass | "Showing X to Y of Z tickets" (aria-live); window `1..5 … N` / `1 … x-1 x x+1 … N` / `1 … N-4..N`; active page `aria-current="page"`; bounds disabled; page change scrolls to top. |
| UI-15 | Pass | Pagination footer assertions (merged into UI-14 describe). |
| E2E-01 | Pass | Full create flow via UI with deliberate double-click → exactly one `TTK-…` ticket created, status New. |
| E2E-02 / E2E-05 | Pass | Requester isolation: switching Alpha→Beta reloads only Beta's set; a foreign ticket number never appears in another requester's list or API response. |
| E2E-04 | Pass | 375px stacked cards + no horizontal scroll + ≥40px targets; 820px and 1280px render the two-column form / nine-column table without overflow. |
| E2E-06 | Pass | Missing related system shows the inline field error; the created ticket's number and related system render in the list. |

Totals: server **67/67**, client **33/33**, E2E **8/8**; all build/lint gates clean.

Deviations / notes:

- **ID remap:** the prompt proposed API-22..24 / UI-12 for these additions, but those IDs were already allocated to Related System tests (API-22..24 Pass, UI-12 Pending). Per "next free number after reading the current doc," the new rows use **API-26..28** and **UI-13..15**; the remap is recorded in ai-use.md.
- **Docs-first conflict:** `itPriority`/`ownerName` display fields and the extended Status enum are new additive schema (D-16/D-17); decisions D-15 and the Status-enum doc were updated in specification.md §11.
- **Search scope:** now ticketNumber OR title OR description (api-spec §3.2), with the shared escaped-ILIKE fragment unchanged so rows and `totalItems` cannot diverge.
- **`itPriority` filter never falls back** to the requested priority (BR-20): a ticket whose IT priority is NULL is only matched by the absence of the filter.
- **Loading behavior:** sort/filter/pagination refreshes keep the table mounted (`status` stays `ready` during background refetch) so the header the user just clicked is never detached mid-interaction; the skeleton appears only on the initial load and after an error retry.
- **Demo seed:** Alpha = 42 tickets (5 pages at pageSize 10), Beta/Gamma/Delta = 10 each, statuses spread across the extended enum, `itPriority` sometimes equal/different/null, `ownerName` from the fixed pool with some null. Seed wipes the dev-requesters' demo band and stray manual tickets so re-runs converge; the E2E suite creates its fixtures as Dev User Delta so the Alpha/Beta counts stay deterministic for the responsive/ownership assertions.
- **E2E evidence screenshots** refreshed in `artifacts/lab-02/screenshots/my-tickets/` (desktop-1280, tablet-800, mobile-375 + state-initial/api-failure/no-results/empty) against the rebuilt Docker stack.

## 7. Known Limitations

- **Identity is simulated.** Tests assert per-requester isolation via `X-Dev-Requester-Id`, which is a testing mechanism, not real authentication; real auth is out of scope and untested.
- **Status is fixed at New on creation.** The Status enum now also contains OPEN/PENDING/IN_PROGRESS/RESOLVED (My Tickets v2), but no transitions exist this sprint — tickets are only ever created as NEW and the extended values appear solely in seeded demo data and filters (BR-02, D-17).
- **Search is substring-based** (ILIKE), not full-text; precision/recall characteristics differ from a production search engine.
- **Attachments are stored on local disk** (`server/uploads/`); durability, virus scanning, and object storage are out of scope.
- **No server-side idempotency.** Duplicate-submission prevention is client-side; a network retry can legitimately create two tickets (documented decision D-06).
- **Single-region timestamps:** stored UTC, displayed in the browser's local timezone; DST edge cases are not tested.
- **Responsive coverage** is limited to the three defined breakpoints; intermediate widths are spot-checked manually.
- **DB-backed API tests require PostgreSQL** migrated and seeded; they will fail without the Docker database running.
