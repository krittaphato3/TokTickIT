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
| API-01 | API | FR-01, BR-01, BR-04 / AC-01 | `POST /api/tickets/:number/actions` by IT Staff with a deliberately wrong `performedById` in the body | `201`; row keyed to the ticket; `performedBy` is the session user; body value ignored | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-02 | API | FR-01, BR-03 / AC-03 | Create with `followUpRequired=true` and no note; then create with an empty/whitespace note; then a valid note | `400` with `details[].field = followUpNote`; valid case `201` with note stored | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-03 | API | FR-02, BR-03 / AC-03 | PATCH a follow-up action with `followUpRequired=false` | `200`; stored `followUpNote` becomes `null` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-04 | API | FR-01, BR-03 / AC-24 | `actionAt` boundary matrix: 6 minutes in the future, exactly 5 minutes in the future, earlier than `ticket.createdAt`, equal to `createdAt` | Future-beyond-5-min and before-creation → `400` with field `actionAt`; the two boundary cases succeed | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-05 | API | FR-01, FR-02, BR-03 / AC-24 | `description`/`result` length and trimming symmetry: 0, whitespace-only, 1, 2000, 2001 chars; `attachmentNotes` 0 / 500 / 501 chars; the same limits on PATCH | Boundary values succeed; 0/whitespace-only/over-limit → `400` with field details; no row written | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-06 | API | FR-07, BR-06 / AC-08 | POST the same `clientRequestId` twice for the same performer, then the same id for a *different* performer, and two creates without `clientRequestId` | Duplicate pair → one row, second call `200`; different performer → new row; absent id → separate rows | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-07 | API | FR-03, BR-05 / AC-06 | Read the log for a ticket with three actions sharing one timestamp and for a legacy ticket with none | Stable `actionAt desc, id desc` order across repeated reads; legacy ticket `200 []` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-08 | API | FR-02, BR-07 / AC-07 | PATCH with `expectedVersion` one behind, equal, and absent | Stale → `409` with current version and unchanged stored fields; correct → `200` and version+1; absent → `400` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-09 | API | FR-08, BR-12, BR-13 / AC-02 | `GET /api/dashboard/requester` for a requester with mixed-status tickets and one with no tickets at all | Counts and both five-item lists match an independent DB query for that user only; zero-state returns `0`s and `[]` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-10 | API | FR-08, BR-13 / AC-02 | Requester dashboard with a client-supplied `userId`/`requesterId` query or body value pointing at another requester | Ignored; response stays scoped to the session user | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-11 | API | FR-09, BR-12 / AC-13 | `GET /api/dashboard/staff` compared field by field with independent `groupBy`/`count` queries over the seeded data | `countsByStatus` (all 8), `unassignedActiveCount`, `myActiveOwnedCount`, `countsByItPriority`, `recentlyUpdated[5]` (active only), `myRecentActions[5]` all match | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-12 | API | FR-09, BR-13 / AC-13, AC-17 | Staff dashboard for Admin vs IT Staff, and the zero-state variant on a dataset with no active tickets | `userCounts` present for Admin with correct active/inactive split, absent for IT Staff; zero state returns `0`/`[]` with no error | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-13 | API | BR-12, A-04 / AC-15 | The one added list filter `active=true|false` on `GET /api/tickets` and `GET /api/staff/tickets`, combined with `status`, `ownerId`, `assigned` and `itPriority`, plus an invalid value | `active=true` returns exactly the five BR-12 active statuses; combined filters AND correctly; each filtered `meta.totalItems` equals the corresponding dashboard metric; invalid value → `400` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| UNIT-01 | unit | FR-04, BR-09 / AC-09 | Transition matrix module: every `from × to` pair of the 8 statuses, including all self-transitions and the terminal Cancelled row | Exactly the BR-09 matrix is permitted; every other pair is rejected; Cancelled has no targets | `server/tests/lab-04/transition-matrix.unit.test.ts` | Planned |
| UNIT-02 | unit | FR-04 / AC-09 | `allowedTransitions` derivation from the matrix for a fixture ticket in each of the 8 statuses and for requester/admin roles | Matches the matrix for staff/admin; empty for Requester | `server/tests/lab-04/transition-matrix.unit.test.ts` | Planned |
| UNIT-03 | unit | FR-05, BR-10 / AC-10 | Resolution-gate evaluator with combinations of action count, follow-up flag and summary presence/whitespace | Returns every applicable `reasons[]` from `NO_ACTIONS`/`OPEN_FOLLOW_UP`/`MISSING_SUMMARY`; empty only when all three conditions hold | `server/tests/lab-04/transition-matrix.unit.test.ts` | Planned |
| WF-01 | API | FR-04, BR-09 / AC-09 | Every permitted transition over the API by IT Staff, including confirmation-required ones and the no-op self case | Permitted → `200` with new status; self → `400`; timestamp updated | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-02 | API | FR-04, BR-09 / AC-09 | Invalid targets submitted directly to the API (UI bypass) plus a Requester attempt through both status routes | Invalid → `422 INVALID_TRANSITION` naming the permitted set; Requester → `403`; stored status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-03 | API | FR-05, BR-10 / AC-10 | Resolve attempts: no actions, open follow-up, whitespace summary, all three broken at once, then all conditions satisfied | `422 RESOLUTION_GATE` with the matching `reasons[]` each time; final attempt → `200`, `resolvedAt` set, summary persisted | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-04 | API | FR-05, BR-11 / AC-10 | Legacy ticket already Resolved without actions: read it, re-open it, then resolve it again via the gate | Reads and re-open succeed; the second resolve is gated; no invented history is created | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-05 | API | FR-06, BR-07 / AC-12 | Stale `expectedVersion` on owner, IT-priority and status writes; missing `expectedVersion` on each | Stale → `409` with the current version and unchanged rows; missing → `400`; success → `200` with version+1 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-06 | API | BR-02 / AC-05 | Staff member B records an action and performs a status change on a ticket owned by staff member A | Both accepted; `ownerId` stays A throughout | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| AUTHZ-01 | API | BR-14 / AC-04 | Actions Taken write sweep: unauthenticated, Requester on own ticket, Requester on a foreign ticket, inactive staff | `401`; `403`; masked `404`; `403` — no row created in any case | `server/tests/lab-04/authz-sweep.api.test.ts` | Planned |
| AUTHZ-02 | API | BR-14 / AC-04, AC-14 | Dashboard route sweep across all three roles | Requester dashboard `200` for Requester only (`403` for staff/admin); staff dashboard `200` for staff and Admin, `403` for Requester | `server/tests/lab-04/authz-sweep.api.test.ts` | Planned |
| AUTHZ-03 | API | BR-14, BR-15 / AC-17 | Every staff ticket write route called by Admin, IT Staff and Requester | Admin and IT Staff `200`; Requester `403`; nothing mutated on the rejected calls | `server/tests/lab-04/authz-sweep.api.test.ts` | Planned |
| AUTHZ-04 | API | BR-14 / AC-17 | `GET /api/users*` and reference-data admin routes for both staff roles | `403` for IT Staff and Requester; `200` for Admin (Lab 3 behaviour preserved) | `server/tests/lab-04/authz-sweep.api.test.ts` | Planned |
| AUTHZ-05 | API | BR-14, BR-16 / AC-04 | Route census: enumerate every registered protected route and assert each one is reachable only by its permitted roles | No route is missing a guard; the sweep fails loudly when a new unguarded route appears | `server/tests/lab-04/authz-sweep.api.test.ts` | Planned |
| MIG-01 | regression | FR-13, D-10 / AC-16 | Snapshot Lab 3 row counts and representative rows, apply `lab4_actions_taken`, re-check | Counts identical; `version`/`resolvedAt`/`resolutionSummary` NULL or default; no rewritten field | `server/tests/lab-04/migration-regression.test.ts` | Planned |
| MIG-02 | regression | FR-13, §7.5 / AC-16 | Execute `server/prisma/rollback/lab4_down.sql`, then verify Lab 3 tables, rows and constraints | Lab 4 objects gone; Lab 3 data untouched; re-applying the migration still works | `server/tests/lab-04/migration-regression.test.ts` | Planned |
| MIG-03 | regression | BR-17 / AC-16 | Run the seed twice and diff the full coverage list (statuses, priorities, ownership, 0/1/≥3-action tickets, follow-up demo, zero-ticket requester, legacy Resolved without actions) | Second run inserts nothing new and changes no counts; every coverage case present | `server/tests/lab-04/migration-regression.test.ts` | Planned |
| PERF-01 | performance | D-13 / AC-22 | 20 sequential calls to each dashboard endpoint on the seeded dataset, p95 measured | p95 < 1000 ms (soft target 500 ms) for both endpoints; the measured values are recorded in `tests.md` §6 at L4-6 | `server/tests/lab-04/migration-regression.test.ts` | Planned |
| UI-01 | component | FR-01, BR-03 / AC-18 | Actions Taken staff create form: empty submit, field-level errors, conditional follow-up note appearing only when the flag is on | Errors render under the offending field; the note field is absent then required with the flag; no request is sent on an invalid submit | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-02 | component | FR-01, FR-07 / AC-18 | Double-click on Save while the request is in flight; recoverable `500` then retry | Exactly one request is issued; busy state disables the control; the second attempt reuses the same `clientRequestId`; entered values survive the failure | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-03 | component | FR-03, BR-05, BR-11 / AC-06, AC-18 | Log rendering: desktop table order, a ticket with no actions, and a Requester (read-only) view | Rows ordered `actionAt desc`; explicit empty state with no create affordance; Requester sees no create/edit controls | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-04 | component | FR-02, BR-03 / AC-18 | Staff view/edit modes: stale `409` on save, validation error, successful save refreshing the row, cancel restoring values | Conflict notice shown and typed values retained; validation blocks submit; success re-renders the updated row; cancel discards | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-05 | component | FR-04 / AC-09, AC-12 | Status control renders only the server-supplied `allowedTransitions`; a conflict response keeps data and shows the message; header refreshes after success | Only permitted targets listed; `409` shows the conflict state without losing input; the summary header shows the new status after success | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-06 | component | FR-05, BR-10 / AC-10 | Resolve dialog: missing summary blocked client-side, then `RESOLUTION_GATE` reasons rendered per code | Each reason code has its own message; the dialog stays open with the typed summary; satisfied request closes and shows Resolved | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-07 | component | FR-08, FR-10 / AC-02, AC-15 | Requester dashboard cards and lists, including the zero state and each drill-down target | Card values match the payload; zero state shows the explicit empty message; every link carries the expected queue/detail target | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-08 | component | FR-09, FR-10 / AC-13, AC-15, AC-17 | Staff dashboard cards, recent lists, `userCounts` visibility by role, and drill-down hrefs | IT Staff sees no user counts and Admin does; each card links to the matching filtered queue query | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| STYLE-01 | UI style | BR-12, D-14 / AC-19 | Zen Green token usage on the dashboards: card surfaces, metric typography, active nav pill, focus ring | Computed styles use the documented tokens; monospace for numbers/dates; no ad-hoc colours | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| STYLE-02 | UI style | BR-03, §6 / AC-18 | Actions area styling: editable vs read-only field treatment, follow-up warning tone, validation text placement under the field | Editable white surface, read-only soft gray-green, error text in `--tok-error` beneath the field | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| STYLE-03 | UI style | BR-08, §6 / AC-19 | Status and priority badge rendering across all eight statuses and four priorities, including the terminal Cancelled state | Every badge has text plus a non-colour cue; no status renders with colour alone | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| RESP-01 | responsive | D-14 / AC-19 | Requester and staff dashboards at 1280×800, 820×1180 and 390×844 | Cards reflow to the documented arrangement; no horizontal overflow; ≥44px touch targets on mobile | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| RESP-02 | responsive | D-14 / AC-19 | Actions Taken table → mobile card conversion and the Resolve dialog on mobile | Below the mobile breakpoint rows become cards with all fields present; dialog is full-width and scrollable without page overflow | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| A11Y-01 | accessibility | BR-16 / AC-20 | `axe` scan of dashboard, ticket detail and the actions area at all three viewports | Zero serious and zero critical violations | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Planned |
| A11Y-02 | accessibility | §6 / AC-20 | Keyboard path: reach the Dashboard link, create an action, open and submit the Resolve dialog, and operate the log | Fully keyboard operable with a visible focus ring at every step; no focus trap outside modals | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Planned |
| E2E-01 | E2E | FR-01, FR-02, FR-03 / AC-01, AC-05, AC-18 | Staff records an action, a second staff member records another, Requester opens the detail and sees both read-only | Both actions appear in the correct order; owner unchanged; Requester has no write controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-02 | E2E | FR-05, BR-10 / AC-10, AC-12 | Resolve a ticket end to end: blocked with an open follow-up, then follow-up cleared plus summary, then a stale-tab conflict attempt | Gate rejects with reasons; satisfied resolve shows Resolved with `resolvedAt`; the stale attempt shows the conflict message and keeps data | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-03 | E2E | FR-08, FR-09, FR-10 / AC-13, AC-15 | Requester and IT Staff dashboards on the seeded database: card → drill-down → matching filtered list | Both dashboards render the seeded values; each drill-down list count equals its card | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-04 | E2E | FR-11 / AC-21 | Login and post-password-change landing, Dashboard nav entry and `aria-current` after navigation | Both roles land on `#/dashboard`; the active nav item carries `aria-current="page"` | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-05 | E2E | BR-18 / AC-21 | Labs 1–3 journeys re-run on Lab 4: requester create/list/detail/attachment, staff queue and detail ops, comments, notes, admin user management, auth | All journeys pass with no console errors, broken links or placeholder text (the §11 Lab 3 updates applied) | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Planned |
| E2E-06 | E2E | D-14 / AC-19 | Screenshot capture of dashboards, ticket detail and the actions area at 1280×800, 820×1180 and 390×844 | Screenshots written to `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` with no clipping, overlap or horizontal scroll | `e2e/lab-04/regression-a11y-responsive.spec.ts` | Planned |

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
| Server (Labs 1–4) | `cd server && npm test` | — | — | pending L4-6 |
| Client (Labs 1–4) | `cd client && npm test` | — | — | pending L4-6 |
| E2E (Labs 2–4) | `npx playwright test` | — | — | pending L4-6 |
| Dashboard perf (PERF-01) | part of the server suite | — | — | p95 per endpoint recorded here |
