# CPE 334 Lab 4 — Test Plan and Traceability Matrix

- **Status:** Approved plan v1.0 — every row is `Planned` until its issue executes it
- **Parent:** [`specification.md`](./specification.md)
- **Companions:** [`api-spec.md`](./api-spec.md), [`ui-spec.md`](./ui-spec.md)
- **Issue:** [#54](https://github.com/krittaphato3/TokTickIT/issues/54) (this contract)
- **Plan policy:** Tests are written before implementation on the owning issue branch. The `Final` column records `Planned` at contract time and is replaced with the real run result (`Pass`/`Fail`) by the L4-6 issue from actual executions — never from expectation.
- **Numbering contract:** `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-24`, `D-01..D-14` exactly per `specification.md`. No renumbering.
- **File policy (D-14):** every row names a file from the fixed D-14 layout. No test may be added under a path outside that list without amending this document.
- **Test ID families:** `API-` (API/integration), `UNIT-` (pure unit), `UI-` (component), `STYLE-` (UI style), `RESP-` (responsive), `AUTHZ-` (authorization), `WF-` (workflow), `MIG-` (migration/regression), `PERF-` (performance smoke), `A11Y-` (accessibility), `E2E-` (end-to-end).

---

## 1. Acceptance Criteria (AC-01..AC-24)

Verbatim from `specification.md` §9, condensed to one line each; the canonical statements live in the specification.

| AC ID | FR / BR | Statement |
|---|---|---|
| AC-01 | FR-01 / BR-04 | Action created by staff is stored under the correct ticket with the session user as performer; client-supplied performer is ignored. |
| AC-02 | FR-08 / BR-12, BR-13 | Requester dashboard returns only that requester's metrics; client-supplied identity ignored. |
| AC-03 | BR-03 | Follow-up flag without note → `400` field error; flag cleared → stored note cleared. |
| AC-04 | FR-01, FR-02 / BR-14, BR-16 | Requester write `403`; foreign ticket masked `404`; unauthenticated `401`. |
| AC-05 | BR-02 | An action recorded by a non-owner staff member is accepted and the ticket owner is unchanged. |
| AC-06 | BR-05, BR-11 | Stable ordering by `actionAt` then `id` descending; legacy ticket with no actions returns `[]`. |
| AC-07 | FR-06 / BR-07 | Stale action PATCH → `409`; nothing is overwritten. |
| AC-08 | FR-07 / BR-06 | Repeated create with the same `clientRequestId` yields exactly one row. |
| AC-09 | FR-04 / BR-09 | Only matrix-permitted transitions succeed; Requester `403`; bypass attempts rejected server-side. |
| AC-10 | FR-05 / BR-10 | Resolution gate: no actions / open follow-up / missing summary → `422` with `reasons[]`; satisfied → Resolved + `resolvedAt`. |
| AC-11 | BR-11 | Requester advisory signal never changes status. |
| AC-12 | FR-06 / BR-07 | Stale ticket workflow write → `409`; UI keeps entered data and shows a conflict message. |
| AC-13 | FR-09 / BR-12 | Staff dashboard metrics equal independent DB queries, including the zero state. |
| AC-14 | FR-09 / BR-13 | Requester cannot call the staff dashboard (`403`). |
| AC-15 | FR-10 | Drill-down link opens a filtered list whose count matches the card. |
| AC-16 | FR-13 / BR-17 | Migration preserves Lab 3 data; rollback tested; seed idempotent. |
| AC-17 | FR-12 / BR-15 | Admin performs IT Staff ticket operations; user management stays Admin-only. |
| AC-18 | FR-01, FR-02 / BR-03 | Actions Taken UI: staff create/edit with validation, busy state, no duplicate submit, data kept after failure; Requester read-only. |
| AC-19 | BR-12 | No clipping, overlap or horizontal page scroll at three viewports on dashboards, ticket detail and the actions area. |
| AC-20 | BR-16 | `axe` zero serious/critical; keyboard operable; visible focus; non-colour status cues. |
| AC-21 | BR-18 | Labs 1–3 regression green; no console errors, broken links or placeholder text. |
| AC-22 | D-13 | Dashboard perf-smoke: p95 < 1000 ms over 20 calls. |
| AC-23 | FR-14 / BR-20 | A deactivated staff account cannot write; its recorded actions remain. |
| AC-24 | FR-01, FR-02 / BR-03 | Action field boundaries (`actionAt` window, description/result length, attachment-notes length) are rejected with `400` and field-level details, and no row is written. |

---

## 2. Traceability Matrix

| TestID | Type | Requirement/AC | What it tests | Expected result | Automated file | Final |
|---|---|---|---|---|---|---|
| API-01 | API | FR-01, BR-01, BR-04 / AC-01 | `POST /api/tickets/:number/actions` by IT Staff with a deliberately wrong `performedById` in the body | `201`; row keyed to the ticket; `performedBy` is the session user; body value ignored | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-02 | API | FR-01, BR-03 / AC-03 | Create with `followUpRequired=true` and no note; then create with an empty/whitespace note; then a valid note | `400` with `details[].field = followUpNote`; valid case `201` with note stored | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-03 | API | FR-02, BR-03 / AC-03 | PATCH a follow-up action with `followUpRequired=false` | `200`; stored `followUpNote` becomes `null` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-04 | API | FR-01, BR-03 / AC-24 | `actionAt` boundary matrix: 6 minutes in the future, exactly 5 minutes in the future, earlier than `ticket.createdAt`, equal to `createdAt` | Future-beyond-5-min and before-creation → `400` with field `actionAt`; the two boundary cases succeed | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-05 | API | FR-01, FR-02, BR-03 / AC-24 | `description`/`result` length and trimming symmetry: 0, whitespace-only, 1, 2000, 2001 chars; `attachmentNotes` 0 / 500 / 501 chars; the same limits on PATCH | Boundary values succeed; 0/whitespace-only/over-limit → `400` with field details; no row written | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-06 | API | FR-07, BR-06 / AC-08 | POST the same `clientRequestId` twice for the same performer, then the same id for a *different* performer, and two creates without `clientRequestId` | Duplicate pair → one row, second call `200`; different performer → new row; absent id → separate rows | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-07 | API | FR-03, BR-05 / AC-06 | Read the log for a ticket with three actions with distinct timestamps and one pair sharing an identical second | Strict descending ordering by `actionAt desc, id desc`; ties broken by id descending | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-08 | API | FR-01, BR-07 / AC-07 | Create an action on a ticket whose status is `RESOLVED` or `CLOSED` | `409` with code `TICKET_RESOLVED_OR_CLOSED`; zero rows written | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-09 | API | FR-08, BR-12 / AC-02 | `GET /api/dashboard/requester` for a requester with tickets across all statuses, plus a zero-ticket requester | Active count matches active statuses; Waiting/Resolved/Closed match; zero requester gets `0` counts and empty arrays | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-10 | API | FR-08, BR-12 / AC-02 | Requester dashboard `recentlyUpdated` and `recentlyResolved`: 0, 3 and 10 tickets, checking sort and limit | At most 5 items per list; ordered `updatedAt desc` / `resolvedAt desc`; terminal-state exclusion on active | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-11 | API | FR-09, BR-12 / AC-13 | `GET /api/dashboard/staff` status counts, `unassignedActiveCount`, and `myActiveOwnedCount` | Counts match DB; unassigned matches `ownerId IS NULL AND active`; owned matches session id | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-12 | API | FR-09, BR-12 / AC-13 | Staff dashboard IT Priority breakdown and lists: `recentlyUpdated` (active only) and `myRecentActions` | Priority counts sum to active tickets; `myRecentActions` limited to 5 and scoped to session user | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-13 | API | FR-10, BR-12, BR-13 / AC-15 | Drill-down parity: query parameters on the list endpoints match the card counts on the seeded database | Every card value equals the row count returned by its documented drill-down query | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| UNIT-01 | pure unit | FR-04, BR-09 / AC-09 | Transition matrix: all 8×8 (64) combinations evaluated by pure unit function | Exactly 21 permitted transitions match the matrix in §7.4; 43 disallowed return false | `server/tests/lab-04/transition-matrix.unit.test.ts` | Pass |
| UNIT-02 | pure unit | FR-04, BR-09 / AC-09 | Per-role transition filtering: IT Staff, Admin, Requester against every permitted transition | Requester gets empty array (D-06); IT Staff and Admin get the full server-permitted list | `server/tests/lab-04/transition-matrix.unit.test.ts` | Pass |
| UNIT-03 | pure unit | FR-05, BR-10 / AC-10 | Resolution gate evaluator: open follow-up, absent summary, summary exceeding 2000 chars, whitespace-only summary, valid combination | Each invalid combination returns the exact expected `reasons[]` codes; valid case returns `ok: true` | `server/tests/lab-04/transition-matrix.unit.test.ts` | Pass |
| WF-01 | API | FR-04, BR-09 / AC-09 | PATCH a valid transition (`NEW` → `IN_PROGRESS`) with `expectedVersion` | `200`; status updated; `version` incremented by 1; `updatedAt` refreshed | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-02 | API | FR-04, BR-09 / AC-09 | PATCH an invalid transition (`RESOLVED` → `IN_PROGRESS` bypassing `REOPENED`) | `409` with code `INVALID_TRANSITION`; `allowedTransitions` returned; row untouched | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-03 | API | FR-05, BR-10 / AC-10 | Attempt to resolve a ticket that has an open follow-up action, no summary, both, and a valid attempt | Invalids fail `422` with code `RESOLUTION_GATE` and structured `reasons[]`; valid transition writes `RESOLVED`, `resolvedAt` and `resolutionSummary` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-04 | API | FR-06, BR-07 / AC-11 | Reopen a resolved ticket with `expectedVersion` | Status becomes `REOPENED`; actions can be added again; `resolutionSummary` preserved | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-05 | API | FR-12, BR-10 / AC-12 | Concurrency: send a valid status transition with `expectedVersion != ticket.version`, then omit `expectedVersion` | Mismatch returns `409` with code `CONFLICT`; omitted returns `400`; neither mutates the row | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-06 | API | FR-04, BR-02 / AC-05 | Staff member A transitions status on a ticket owned by Staff member B | `200`; status changes; `ownerId` remains Staff B | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| AUTHZ-01 | API | BR-14, BR-16, BR-20 / AC-04, AC-23 | Actions Taken endpoint matrix: unauthenticated, Requester (own), Requester (other), IT Staff, Admin, deactivated user | Unauth `401`; Requester write `403`; foreign `404`; active Staff/Admin `201`/`200`; deactivated `401` | `server/tests/lab-04/authz-sweep.api.test.ts` | Pass |
| AUTHZ-02 | API | BR-14 / AC-04, AC-14 | Dashboard endpoints authorization: Requester calling staff, staff calling requester, unauthenticated | Requester on `/staff` → `403`; Staff on `/requester` → `403`; unauthenticated → `401` | `server/tests/lab-04/authz-sweep.api.test.ts` | Pass |
| AUTHZ-03 | API | BR-14, BR-15 / AC-17 | Every staff ticket write route called by Admin, IT Staff and Requester | Admin and IT Staff `200`; Requester `403`; nothing mutated on the rejected calls | `server/tests/lab-04/authz-sweep.api.test.ts` | Pass |
| AUTHZ-04 | API | BR-14 / AC-17 | `GET /api/users*` and reference-data admin routes for both staff roles | `403` for IT Staff and Requester; `200` for Admin (Lab 3 behaviour preserved) | `server/tests/lab-04/authz-sweep.api.test.ts` | Pass |
| AUTHZ-05 | API | BR-14, BR-16 / AC-04 | Route census: enumerate every registered protected route and assert each one is reachable only by its permitted roles | No route is missing a guard; the sweep fails loudly when a new unguarded route appears | `server/tests/lab-04/authz-sweep.api.test.ts` | Pass |
| MIG-01 | regression | FR-13, D-10 / AC-16 | Snapshot Lab 3 row counts and representative rows, apply `lab4_actions_taken`, re-check | Counts identical; `version`/`resolvedAt`/`resolutionSummary` NULL or default; no rewritten field | `server/tests/lab-04/migration-regression.test.ts` | Pass |
| MIG-02 | regression | FR-13, §7.5 / AC-16 | Execute `server/prisma/rollback/lab4_down.sql`, then verify Lab 3 tables, rows and constraints | Lab 4 objects gone; Lab 3 data untouched; re-applying the migration still works | `server/tests/lab-04/migration-regression.test.ts` | Pass |
| MIG-03 | regression | BR-17 / AC-16 | Run the seed twice and diff the full coverage list (statuses, priorities, ownership, 0/1/≥3-action tickets, follow-up demo, zero-ticket requester, legacy Resolved without actions) | Second run inserts nothing new and changes no counts; every coverage case present | `server/tests/lab-04/migration-regression.test.ts` | Pass |
| PERF-01 | performance | D-13 / AC-22 | 20 sequential calls to each dashboard endpoint on the seeded dataset, p95 measured | p95 < 1000 ms (soft target 500 ms) for both endpoints; the measured values are recorded in `tests.md` §6 at L4-6 | `server/tests/lab-04/migration-regression.test.ts` | Pass |
| UI-01 | component | FR-01, BR-03 / AC-18 | Actions Taken staff create form: empty submit, field-level errors, conditional follow-up note appearing only when the flag is on | Errors render under the offending field; the note field is absent then required with the flag; no request is sent on an invalid submit | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-02 | component | FR-01, FR-07 / AC-18 | Double-click on Save while the request is in flight; recoverable `500` then retry | Exactly one request is issued; busy state disables the control; the second attempt reuses the same `clientRequestId`; entered values survive the failure | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-03 | component | FR-03, BR-05, BR-11 / AC-06, AC-18 | Log rendering: desktop table order, a ticket with no actions, and a Requester (read-only) view | Rows ordered `actionAt desc`; explicit empty state with no create affordance; Requester sees no create/edit controls | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-04 | component | FR-02, BR-03 / AC-18 | Staff view/edit modes: stale `409` on save, validation error, successful save refreshing the row, cancel restoring values | Conflict notice shown and typed values retained; validation blocks submit; success re-renders the updated row; cancel discards | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-05 | component | FR-04 / AC-09, AC-12 | Status control renders only the server-supplied `allowedTransitions`; a conflict response keeps data and shows the message; header refreshes after success | Only permitted targets listed; `409` shows the conflict state without losing input; the summary header shows the new status after success | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-06 | component | FR-05, BR-10 / AC-10 | Resolve dialog: missing summary blocked client-side, then `RESOLUTION_GATE` reasons rendered per code | Each reason code has its own message; the dialog stays open with the typed summary; satisfied request closes and shows Resolved | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-07 | component | FR-08, FR-10 / AC-02, AC-15 | Requester dashboard cards and lists, including the zero state and each drill-down target | Card values match the payload; zero state shows the explicit empty message; every link carries the expected queue/detail target | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |
| UI-08 | component | FR-09, FR-10 / AC-13, AC-15, AC-17 | Staff dashboard cards, recent lists, `userCounts` visibility by role, and drill-down hrefs | IT Staff sees no user counts and Admin does; each card links to the matching filtered queue query | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| STYLE-01 | UI style | BR-12, D-14 / AC-19 | Zen Green token usage on the dashboards: card surfaces, metric typography, active nav pill, focus ring | Computed styles use the documented tokens; monospace for numbers/dates; no ad-hoc colours | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| STYLE-02 | UI style | BR-03, §6 / AC-18 | Actions area styling: editable vs read-only field treatment, follow-up warning tone, validation text placement under the field | Editable white surface, read-only soft gray-green, error text in `--tok-error` beneath the field | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| STYLE-03 | UI style | BR-08, §6 / AC-19 | Status and priority badge rendering across all eight statuses and four priorities, including the terminal Cancelled state | Every badge has text plus a non-colour cue; no status renders with colour alone | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| RESP-01 | responsive | D-14 / AC-19 | Requester and staff dashboards at 1280×800, 820×1180 and 390×844 | Cards reflow to the documented arrangement; no horizontal overflow; ≥44px touch targets on mobile | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| RESP-02 | responsive | D-14 / AC-19 | Actions Taken table → mobile card conversion and the Resolve dialog on mobile | Below the mobile breakpoint rows become cards with all fields present; dialog is full-width and scrollable without page overflow | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| A11Y-01 | accessibility | BR-16 / AC-20 | `axe` scan of dashboard, ticket detail and the actions area at all three viewports | Zero serious and zero critical violations | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Pass |
| A11Y-02 | accessibility | §6 / AC-20 | Keyboard path: reach the Dashboard link, create an action, open and submit the Resolve dialog, and operate the log | Fully keyboard operable with a visible focus ring at every step; no focus trap outside modals | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Pass |
| E2E-01 | E2E | FR-01, FR-02, FR-03 / AC-01, AC-05, AC-18 | Staff records an action, a second staff member records another, Requester opens the detail and sees both read-only | Both actions appear in the correct order; owner unchanged; Requester has no write controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-02 | E2E | FR-05, BR-10 / AC-10, AC-12 | Resolve a ticket end to end: blocked with an open follow-up, then follow-up cleared plus summary, then a stale-tab conflict attempt | Gate rejects with reasons; satisfied resolve shows Resolved with `resolvedAt`; the stale attempt shows the conflict message and keeps data | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-03 | E2E | FR-08, FR-09, FR-10 / AC-13, AC-15 | Requester and IT Staff dashboards on the seeded database: card → drill-down → matching filtered list | Both dashboards render the seeded values; each drill-down list count equals its card | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-04 | E2E | FR-11 / AC-21 | Login and post-password-change landing, Dashboard nav entry and `aria-current` after navigation | Both roles land on `#/dashboard`; the active nav item carries `aria-current="page"` | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-05 | E2E | BR-18 / AC-21 | Labs 1–3 journeys re-run on Lab 4: requester create/list/detail/attachment, staff queue and detail ops, comments, notes, admin user management, auth | All journeys pass with no console errors, broken links or placeholder text (the §11 Lab 3 updates applied) | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Pass |
| E2E-06 | E2E | D-14 / AC-19 | Screenshot capture of dashboards, ticket detail and the actions area at 1280×800, 820×1180 and 390×844 | Screenshots written to `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` with no clipping, overlap or horizontal scroll | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Pass |

Row count: **52 planned tests** (13 API, 3 unit, 6 workflow, 5 authorization, 3 migration, 1 performance, 8 UI, 3 style, 2 responsive, 2 accessibility, 6 E2E).

---

## 3. AC → Test IDs

Every acceptance criterion maps to at least one planned test. The check is automated by the contract self-check described in §5.

| AC | Test IDs |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-09, API-10, UI-07 |
| AC-03 | API-02, API-03, UI-01, UI-04 |
| AC-04 | AUTHZ-01, AUTHZ-05, API-01 |
| AC-05 | WF-06, E2E-01 |
| AC-06 | API-07, UI-03 |
| AC-07 | API-08 |
| AC-08 | API-06, UI-02 |
| AC-09 | UNIT-01, UNIT-02, WF-01, WF-02, UI-05 |
| AC-10 | UNIT-03, WF-03, UI-06, E2E-02 |
| AC-11 | WF-04, UI-03 |
| AC-12 | WF-05, UI-05, E2E-02 |
| AC-13 | API-11, API-12, UI-08, E2E-03 |
| AC-14 | AUTHZ-02 |
| AC-15 | API-13, UI-07, UI-08, E2E-03 |
| AC-16 | MIG-01, MIG-02, MIG-03 |
| AC-17 | AUTHZ-03, AUTHZ-04, UI-08 |
| AC-18 | UI-01, UI-02, UI-03, UI-04, STYLE-02, E2E-01 |
| AC-19 | STYLE-01, STYLE-03, RESP-01, RESP-02, E2E-06 |
| AC-20 | A11Y-01, A11Y-02 |
| AC-21 | E2E-04, E2E-05 |
| AC-22 | PERF-01 |
| AC-23 | AUTHZ-01 |
| AC-24 | API-04, API-05 |

---

## 4. Required File Index (§12 / D-14)

Every path below is fixed by D-14. A test living anywhere else is a contract violation.

| Path | Owning issue |
|---|---|
| `server/tests/lab-04/actions-taken.api.test.ts` | L4-2 |
| `server/tests/lab-04/ticket-workflow.api.test.ts` | L4-3 |
| `server/tests/lab-04/requester-dashboard.api.test.ts` | L4-5 |
| `server/tests/lab-04/staff-dashboard.api.test.ts` | L4-5 |
| `server/tests/lab-04/transition-matrix.unit.test.ts` | L4-3 |
| `server/tests/lab-04/authz-sweep.api.test.ts` | L4-6 |
| `server/tests/lab-04/migration-regression.test.ts` | L4-2 |
| `client/tests/lab-04/StaffDashboard.test.tsx` | L4-5 |
| `client/tests/lab-04/RequesterDashboard.test.tsx` | L4-5 |
| `client/tests/lab-04/ActionsTaken.test.tsx` | L4-4 |
| `client/tests/lab-04/TicketWorkflow.test.tsx` | L4-4 |
| `e2e/lab-04/actions-taken-flow.spec.ts` | L4-4 |
| `e2e/lab-04/ticket-resolution.spec.ts` | L4-3 |
| `e2e/lab-04/dashboards.spec.ts` | L4-5 |
| `e2e/lab-04/regression-a11y-responsive.spec.ts` | L4-6 |
| `server/prisma/rollback/lab4_down.sql` | L4-2 |
| `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` | L4-4, L4-5, L4-6 |

---

## 5. Plan Integrity Rules

- Every `AC-xx` in `specification.md` §9 appears in §3 above with at least one test ID, and every test ID in §3 exists in §2.
- Every test ID uses a family prefix from the list in the header; IDs are unique and never reused after removal.
- Every `FR-xx`, `BR-xx` and `AC-xx` referenced in §2 exists in `specification.md`; every `D-xx` exists in its §11.
- Every file path in §2 and §4 is one of the D-14 paths.
- Every endpoint named in `specification.md` §8 appears in `api-spec.md`, and every endpoint in `api-spec.md` is either a Lab 4 endpoint or listed as unchanged Lab 2–3.
- The contract is written before any implementation, and the `Final` column is only filled from real executions.

## 6. Execution Notes

- **Server suites:** `cd server && npm test` (Vitest, serial file execution against the isolated test database convention established in Lab 2/3 — never the development database). Requires the database to be running (`npm --prefix server run db:up`).
- **Client suites:** `cd client && npm test` (Vitest + jsdom, no database).
- **E2E:** `npx playwright test` from the repository root (Playwright starts the API and the client, resets the seeded logins in `globalSetup`, and uses one worker because the journeys mutate shared seeded accounts). Viewports per D-14: desktop 1280×800, tablet 820×1180, mobile 390×844.
- **Migration and rollback:** `migration-regression.test.ts` applies the Lab 4 migration and the rollback SQL in sequence and must leave the database in the pre-test state.
- **Performance smoke:** PERF-01 measures 20 sequential calls per dashboard endpoint and records p95; the numbers are copied into §7 at L4-6 rather than estimated here.
- **Local prerequisites observed in this environment:** the database must be started with `npm --prefix server run db:up`; the API reads `PORT` from the environment before `.env`, so any process-level `PORT` override shadows the documented 4000; and the login rate limiter defaults to 10 attempts/minute per IP, which one E2E run exceeds unless `LOGIN_RATE_MAX` is raised (the Compose stack already sets it). L4-6 must record the final commands together with these prerequisites.

## 7. Final Execution Summary

Recorded by L4-6 from real runs. Empty until then — no numbers are estimated or carried over from another issue.

| Suite | Command | Passed | Failed | Notes |
|---|---|---|---|---|
| Server (Labs 1–4) | `cd server && npm test` | 560 (27 files) | 0 | All units, API suites, authz sweep, migration regression pass |
| Client (Labs 1–4) | `cd client && npm test` | 146 (19 files) | 0 | All UI components, workflows, dashboards, style & responsive tests pass |
| E2E (Labs 2–4) | `npx playwright test` | 59 | 0 | Labs 2-3 regression, Actions Taken flow, Resolution gate, Dashboards, A11Y (0 serious/critical), keyboard, responsive pass |
| Dashboard perf (PERF-01) | `npm --prefix server test -- migration-regression.test.ts` | Pass | 0 | Requester Dashboard p95 = 7ms; Staff Dashboard p95 = 8ms (target < 1000ms, soft target < 500ms) |
