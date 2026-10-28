# CPE 334 Lab 4 — TokTickIT Actions Taken, Ticket Lifecycle and Dashboards: UI Specification (Zen Green Theme)

- **Status:** Approved v1.0 — engineering contract
- **Foundation:** React 19 + TypeScript + Vite + Bootstrap 5.3.8. Zen Green theme applied by overriding Bootstrap CSS custom properties. No new UI framework, no new component library.
- **Companion documents:** [`specification.md`](./specification.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)
- **Parent theme:** [`docs/lab-03/ui-spec.md`](../lab-03/ui-spec.md) — all Lab 2/3 tokens, cards, badges, forms, feedback, responsive and accessibility conventions remain in force unless this document overrides one explicitly (§2 nav, §3 landing, §14 viewports).
- **Traceability tags** in each section follow the frozen numbering `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-24`, `D-01..D-14`.

---

## 1. Design tokens (Zen Green — inherited, unchanged)

No new token is introduced in Lab 4. Everything below is the Lab 2/3 set that Lab 4 must use; ad-hoc colours are a defect.

| Token | Value | Usage in Lab 4 |
|---|---|---|
| `--tok-primary` | `#006B3C` | Primary buttons (Create action, Save, Resolve), links, active nav, focus ring |
| `--tok-secondary` | `#0B7A46` | Hovers, selected states |
| `--tok-primary-soft` | `#EAF6EF` | Active nav pill, resolved-success tints, dashboard card accents |
| `--tok-page-bg` | `#F5F7F6` | Page background outside cards |
| `--tok-surface` | `#FFFFFF` | Cards, dashboard tiles, modals, editable fields |
| `--tok-text` | `#1E2A25` | Body text, headings, metric values |
| `--tok-text-muted` | `#5C6B64` | Captions, labels, "no data" hints |
| `--tok-border` | `#C9D4CE` | Card and control borders |
| `--tok-field-editable` | `#FFFFFF` | Editable action fields and the resolution summary |
| `--tok-field-readonly` | `#F0F3F1` | Read-only action fields (Requester view, staff view mode) |
| `--tok-field-readonly-warm` | `#FAF6EF` | Read-only description/result text blocks in view mode |
| `--tok-error` | `#B3261E` | Validation text, gate reasons, conflict notices, required asterisk |
| `--tok-error-soft` | `#FDECEA` | Error banners, gate-failure panel background |
| `--tok-warning` | `#B26A00` | Follow-up-required marker and the open-follow-up gate reason |
| `--tok-warning-soft` | `#FFF4E5` | Follow-up warning chips and banners |
| `--tok-success` | `#1E7A46` | Success banners and the Resolved confirmation |
| `--tok-success-soft` | `#EAF6EF` | Success banner background |
| `--tok-info` / `--tok-info-soft` | `#1D5FBF` / `#E9F0FB` | Open-status badge, informational hints |
| `--tok-internal-bg` / `--tok-internal-border` | `#FFF8E6` / `#E8D9A8` | Internal Notes thread (unchanged from Lab 3) |

Typography, spacing, radius, shadow, monospace stack (ticket numbers, dates, counts) and the focus ring `0 0 0 3px rgba(0,107,60,.28)` are inherited unchanged. Touch targets remain ≥44×44px below 768px.

---

## 2. Application shell and navigation

> Traceability: FR-11 | BR-14, BR-15 | AC-21 | D-12.

- Navbar, brand, user cluster, Profile menu, Logout and the minimal forced-password-change header are unchanged from Lab 3 (`ui-spec.md` §2.1–2.2).
- **Dashboard is the first navigation item for every role** and routes to `#/dashboard`.
  - Requester: **Dashboard** (`#/dashboard`), **My Tickets** (`#/my`), **New Ticket** (`#/new`).
  - IT Staff: **Dashboard** (`#/dashboard`), **Ticket Queue** (`#/staff/queue`).
  - Admin: **Dashboard** (`#/dashboard`), **Ticket Queue** (`#/staff/queue`), **User Management** (`#/admin/users`).
- **Active indication:** the current item renders the pale-green active pill *and* carries `aria-current="page"`. Colour alone is never the only indicator — the item also gains a left accent bar and bold weight.
- **Deep links:** the dashboard drill-downs link into the existing list screens with query parameters in the hash (`#/my?active=true`, `#/staff/queue?status=NEW&page=1`). A target screen initializes its filter state from that query on first render, keeps the applied filters visible in its own controls, and re-issues the filtered request — so the list a user lands on shows exactly the rows its card counted (AC-15).
- **Landing rules (D-12, changed from Lab 3):** after a successful login and after a completed mandatory password change, every role lands on `#/dashboard`. The brand link in the navbar also routes to `#/dashboard`. Unauthorized destinations still redirect or render Forbidden exactly as in Lab 3.
- Hidden navigation is feedback only; every destination is enforced server-side (BR-14).

---

## 3. Role dashboards

> Traceability: FR-08, FR-09, FR-10 | BR-12, BR-13, BR-16 | AC-02, AC-13, AC-14, AC-15, AC-19, AC-22 | D-09.

### 3.1 Shared layout

- Page title (`Dashboard`), a muted subtitle naming the role's scope (`Your tickets` for Requester, `Service desk overview` for IT Staff/Admin), then a responsive grid of **metric cards** followed by **list cards**.
- **Metric card:** large monospace value, short label, muted caption naming the underlying query in plain language (for example "Open, In Progress, Waiting for Requester, Reopened"). The whole card is a link (or contains one primary link) to its drill-down destination; the value itself is not a button so screen-reader navigation stays predictable.
- **List card:** title, up to five rows, and a "View all" link. Each row shows the ticket number, a truncated summary, the status badge, and a relative timestamp with the absolute Asia/Bangkok value available as the `title`/`aria-label`.
- No card renders a whole ticket collection, a chart, or an export control (excluded scope).
- Numbers are monospace; dates use the monospace stack at 0.875rem; every value renders `0` rather than blank.

### 3.2 Requester dashboard (`GET /api/dashboard/requester`)

| Card | Value | Drill-down |
|---|---|---|
| Open tickets | `activeCount` | `#/my?active=true` (active status set per BR-12) |
| Waiting for me | `waitingForRequesterCount` | `#/my?status=WAITING_FOR_REQUESTER` |
| Resolved | `resolvedCount` | `#/my?status=RESOLVED` |
| Closed | `closedCount` | `#/my?status=CLOSED` |
| Recently updated | `recentlyUpdated[5]` rows | row → `#/tickets/:number`; "View all" → `#/my` |
| Recently resolved | `recentlyResolved[5]` rows | row → `#/tickets/:number`; "View all" → `#/my?status=RESOLVED` |

### 3.3 IT Staff / Admin dashboard (`GET /api/dashboard/staff`)

| Card | Value | Drill-down |
|---|---|---|
| By status | `countsByStatus` (all eight, each a labelled count) | one link per status → `#/staff/queue?status=<STATUS>` |
| Unassigned (active) | `unassignedActiveCount` | `#/staff/queue?assigned=false&active=true` |
| Owned by me (active) | `myActiveOwnedCount` | `#/staff/queue?ownerId=<me>&active=true` |
| By IT priority | `countsByItPriority` (active tickets) | `#/staff/queue?itPriority=<PRIORITY>&active=true` |
| Recently updated | `recentlyUpdated[5]` (active) rows | row → `#/staff/tickets/:number`; "View all" → `#/staff/queue` |
| My recent actions | `myRecentActions[5]` rows: ticket number, description excerpt, action date/time | row → `#/staff/tickets/:number` |
| Users (Admin only) | `userCounts` active/inactive split with role breakdown | `#/admin/users` |

`userCounts` is rendered only for Admin; for IT Staff the card is absent, not empty (BR-13).

### 3.4 Dashboard states

- **Loading:** skeleton cards with the final grid geometry so the layout does not jump; `aria-live="polite"` announces "Loading dashboard".
- **Empty (zero data):** explicit message per surface — Requester with no tickets: "You have no tickets yet. Create your first ticket to see your dashboard." with a **New Ticket** button; staff with no tickets at all: "No tickets in the system yet." Metrics still render `0`.
- **Forbidden (`403`):** the Requester is blocked from the staff dashboard and vice versa by the backend; the screen renders the shared Forbidden panel with a link to the user's own dashboard.
- **Safe failure (`500`) / network error:** one error banner with a **Try again** button; previously loaded values are cleared rather than left stale, and the retry re-issues the same request.

---

## 4. Actions Taken area (Ticket Detail)

> Traceability: FR-01, FR-02, FR-03 | BR-01, BR-02, BR-03, BR-04, BR-05, BR-06, BR-19 | AC-01, AC-03, AC-05, AC-06, AC-18, AC-19, AC-24 | D-02, D-05.

The area appears on **both** ticket detail screens: the staff screen (`#/staff/tickets/:number`) and the requester screen (`#/tickets/:number`). It is a labelled section (`<section aria-labelledby>`) titled **Actions Taken**, placed after the ticket's read-only information group and before the discussion threads on the staff screen.

### 4.1 Log presentation

- **Desktop ≥992px:** a table with columns **Action date/time**, **Description**, **Result**, **Performed by**, **Follow-up**, **Attachment notes**, and (staff only) **Actions**. Long text wraps inside the cell; the table never scrolls horizontally.
- **Tablet 768–991px:** the same table with reduced type (0.75rem) and padding; the attachment-notes column collapses under the description cell.
- **Mobile <768px:** each action becomes a card: date/time heading, description, result, performed-by, a follow-up chip when set, the follow-up note, the attachment notes, and the staff action buttons. Cards stack in the same order as the table.
- **Order:** `actionAt` descending, then `id` descending (BR-05). The area states the order in a caption so it is never ambiguous.
- **Follow-up indicator:** an action with `followUpRequired=true` renders an amber chip plus the follow-up note; an action whose follow-up has been cleared renders no chip. The resolution gate's `OPEN_FOLLOW_UP` reason points at exactly these rows.
- **Performed by** renders the recorded user's name (read-only). There is no performer selector anywhere, and no control that would let a client choose another user (BR-04).
- **Empty state:** "No actions recorded yet." For staff this is accompanied by the **Record action** button; for a Requester the message stands alone, plus the muted note "IT staff will record the work here."
- **Attachment notes** render as plain text with a paperclip glyph and the muted caption "File reference". It is never rendered as a download link and never creates an attachment (BR-03).

### 4.2 Staff create mode

- Entry point: **Record action** button in the section header. Opens an inline create panel (a modal on mobile) with a clear mode banner "New action".
- Fields, in order: **Action date/time** (datetime-local, prefilled with now, editable), **Description** (textarea, required), **Result** (textarea, required), **Follow-up required?** (switch), **Follow-up note** (textarea, rendered only when the switch is on, required then), **Attachment notes** (single-line text, optional, hint "Name the file or image to look for — for example `screenshot-login-error.png`").
- **Validation placement:** each error message renders directly beneath its own field in `--tok-error`, the control gets `aria-invalid="true"` and is wired to the message with `aria-describedby`; the first invalid field receives focus on a failed submit.
- **Busy state:** the submit button shows a spinner and its label becomes "Saving…", the button is disabled, and the panel's fields are disabled while the request is in flight — so a double-click cannot create a second action (AC-18). The client sends one `clientRequestId` per opened panel and reuses it for a retry (BR-06).
- **Success:** the panel closes, a success banner ("Action recorded.") appears in the section, and the new row is inserted in the correct position without a full page reload.
- **Recoverable failure (`409`/`500`/network):** the panel stays open with every entered value intact, the banner explains what happened, and the same `clientRequestId` is reused on retry so nothing duplicates.

### 4.3 Staff view / edit mode

- Rows render read-only with the **soft gray-green** treatment (`--tok-field-readonly`), long text on the warm ivory block (`--tok-field-readonly-warm`).
- **Edit** on a row switches that row into edit mode with the same field set as create, prefilled, plus a mode banner "Editing action" and **Save** / **Cancel**.
- **Save** sends `expectedVersion`. On `409` the row shows an inline conflict notice ("This action was changed by someone else. Your version is out of date — reload to continue."), keeps every typed value, and offers **Reload latest**. On `400` validation errors render per field. On success the row returns to read mode with the updated values and the incremented version held in client state.
- **Cancel** restores the stored values with no request.
- There is no Delete control and no bulk action anywhere (BR-19).

### 4.4 Requester (read-only) mode

- The log renders in view mode only: no create button, no edit buttons, no per-row action column. This is presentation convenience; the API returns `403` for a Requester write regardless (BR-14).
- The advisory **problem appears resolved** control from Lab 3 stays in the detail header, unchanged, with the helper text that it does not change the ticket's status (BR-11).

---

## 5. Status control and Resolve dialog

> Traceability: FR-04, FR-05, FR-06 | BR-07, BR-08, BR-09, BR-10 | AC-09, AC-10, AC-12, AC-18.

- **Transition control (staff/Admin only):** a select or button group listing **only** the targets in the ticket detail response's `allowedTransitions`. The UI never hard-codes the matrix; when `allowedTransitions` is empty the control renders a muted "No further status changes" note and is disabled.
- **Confirmation:** transitions flagged as confirmation-required ask before submitting (inline confirm in the control group, modal on mobile), with the action named explicitly ("Cancel this ticket?").
- **Resolution dialog:** choosing **Resolved** opens a dialog containing the **Resolution summary** field (textarea, required, 1–2000, counter shown), a read-only recap of the ticket number and requester, and the note "Resolution requires at least one recorded action, no outstanding follow-up, and a summary."
- **Gate feedback:** a `422 RESOLUTION_GATE` response renders one row per `reasons[]` entry inside the dialog, in `--tok-error-soft` with an icon and text (never colour alone):
  - `NO_ACTIONS` → "Record at least one action before resolving this ticket." with a **Record action** shortcut.
  - `OPEN_FOLLOW_UP` → "An action still has follow-up required." listing the offending action's date/time.
  - `MISSING_SUMMARY` → "Add a resolution summary."
  The dialog stays open and keeps the typed summary.
- **Invalid transition (`422 INVALID_TRANSITION`):** the control is refreshed from the server's permitted list and a banner names the permitted targets; the ticket's status is never shown as changed.
- **Conflict (`409`):** the ticket's stale version is replaced with the server's current version, a conflict banner appears ("This ticket changed while you were working. Review the latest values, then try again."), and any text the user typed into the dialog or the actions area is preserved (AC-12).
- **Success:** the header summary (status badge, owner, IT priority, `updatedAt`, and `resolvedAt` when present) refreshes immediately, and a success banner confirms the new status.
- **Requester:** no status control is rendered at all, and the `PATCH /api/tickets/:number/status` route rejects a Requester with `403` (D-06).

---

## 6. State catalogue

> Traceability: BR-16 | AC-18, AC-19, AC-21.

| State | Dashboard | Actions Taken | Status / Resolve |
|---|---|---|---|
| Loading | Skeleton cards, `aria-live="polite"` "Loading dashboard" | Row skeletons; button spinner with "Saving…" | Button spinner, control disabled |
| Validation | n/a | Message under the field, `aria-invalid`, first invalid focused | Summary-required message inside the dialog |
| Success | Values refreshed | "Action recorded." / "Action updated." banner, row re-rendered | "Status updated to <label>." banner, header refreshed |
| Empty | Per-surface message + primary action (§3.4) | "No actions recorded yet." | "No further status changes" when the target list is empty |
| No results | A drill-down target whose filters match nothing shows the Lab 3 no-results treatment ("No tickets match these filters") with a **Clear filters** action, while the originating card renders `0` with its empty treatment — the two are never confused | A ticket with no actions after receiving its first action is impossible; the unfiltered log therefore has no no-results variant | n/a |
| Forbidden (403) | Shared Forbidden panel + link to the user's own dashboard | Section replaced by the Forbidden panel | Control hidden and server-rejected |
| Conflict (409) | n/a | Inline conflict notice + **Reload latest**, values kept | Conflict banner, entered data kept, versions realigned |
| Not found (404) | n/a | Section renders the ticket-level Not Found state | Not Found state; no status control |
| Safe failure (5xx / network) | Error banner + **Try again** | Error banner in the section, form still open with values | Error banner, dialog open, values kept |

Retry is offered only where the operation is safely repeatable; every write path reuses its `clientRequestId` so a retry cannot duplicate an action (BR-06).

---

## 7. Editable versus read-only styling

> Traceability: BR-03, D-02 | AC-18.

| Treatment | Background | Border | Notes |
|---|---|---|---|
| Editable field | `--tok-field-editable` (`#FFFFFF`) | `--tok-border` | Focus ring on focus; label always visible |
| Read-only field | `--tok-field-readonly` (`#F0F3F1`) | `--tok-field-readonly-border` | Used for `performedBy`, `createdAt`, `version`, ticket owner, requester |
| Read-only text block | `--tok-field-readonly-warm` (`#FAF6EF`) | none | Description and result in view mode |
| Follow-up required | `--tok-warning-soft` chip + `--tok-warning` text | `--tok-warning` | Chips carry text ("Follow-up required"), never colour alone |

A field is only editable in create/edit mode; in view mode every field uses the read-only treatment so a user can tell at a glance what can be changed.

---

## 8. Badges

Status badges keep the Lab 3 eight-status set (New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled) with their existing colour pairs; **Cancelled is now terminal** and therefore never appears as a transition target, but its badge is unchanged. Priority badges keep the four levels plus the `Unset` IT-priority treatment. Every badge renders a text label alongside its colour (non-colour cue, AC-20).

---

## 9. Responsive rules (1280 / 820 / 390)

> Traceability: D-14 | AC-19.

| Viewport | Shell | Dashboards | Actions Taken | Status / Resolve |
|---|---|---|---|---|
| Desktop 1280×800 | Full inline navbar | Metric cards in a 4-up grid; list cards side by side | Full 7-column table | Inline control group; centred 560px dialog |
| Tablet 820×1180 | Full inline navbar, compact user name | Metric cards 2-up; list cards stacked | Table with 0.75rem type, attachment notes nested | Control group wraps; 520px dialog |
| Mobile 390×844 | Brand + avatar + Logout icon button, stacked nav links, 44px targets | Metric cards stacked full width; each card a full-width tap target | One card per action, all fields present, staff buttons ≥44px | Full-width sheet dialog, sticky primary action at the foot |

Global rules: no horizontal page scroll at any of the three viewports on any Lab 4 screen; long descriptions wrap with `overflow-wrap: anywhere`; monospace values never force page width. The 320–1440 auth matrix from Lab 3 (`e2e/lab-03/auth-responsive.spec.ts`) keeps its own viewports and is unchanged.

---

## 10. Accessibility

> Traceability: BR-16 | AC-20.

- Every field has a visible `<label>`; hint text and error text are linked with `aria-describedby`; invalid controls set `aria-invalid="true"`. Required fields show a red asterisk plus the word "required" in the accessible name.
- The dashboard grid uses a heading hierarchy (`h1` page title, `h2` per card group) so a screen reader can navigate card by card; metric values expose their label as part of the accessible name ("Open tickets: 4").
- Visible focus ring on every interactive element, logical tab order, and a skip-to-content link. The actions table is a real table with `<th scope="col">`; the mobile card list preserves the same field labels.
- The Resolve dialog and the mobile create panel trap focus, close on `Esc`, and return focus to the control that opened them. Gate reasons and conflict notices are announced (`role="alert"`).
- Live regions: loading and saving announce politely; success and failure banners use `role="status"` / `role="alert"`.
- Status, priority and follow-up state are never conveyed by colour alone; every badge and chip carries a text label.
- Bodies and notes render escaped; no raw HTML from any field is executed.
- Contrast: body text ≥4.5:1, white on `--tok-primary` ≥4.5:1, muted text on card surfaces ≥4.5:1, error text on `--tok-error-soft` ≥4.5:1. Verified by `axe` in A11Y-01.

---

## 11. Explicit exclusions (must not be rendered)

> Traceability: §3 of `specification.md`.

- No SLA clock, breach banner, countdown, escalation control or on-call information.
- No notification surface of any kind (email, SMS, LINE, push) and no "notify requester" checkbox.
- No inventory, parts, purchasing or cost field.
- No time-sheet, labour or payroll field.
- No approval chain, sign-off step or e-signature control.
- No report builder, ad-hoc filter builder, chart library or export/download button on any dashboard.
- No delete affordance for actions, comments, notes or tickets; no bulk operations.
- No assignee field and no status field on an Action Taken (D-02).
- No user deletion, import/export, multi-role assignment or profile-photo control.

---

## 12. Visual and Accessibility Checklist

Completion is required by L4-6 before release; every line is unchecked at contract time and is ticked against real evidence (screenshots in `artifacts/lab-04/screenshots/`, `axe` output, and the test IDs named in [`tests.md`](./tests.md)).

**Design consistency**
- [x] Dashboard, Ticket Detail header, Actions Taken area, status control, dialog and banners all use the Zen Green tokens in §1 with no ad-hoc colour (STYLE-01).
- [x] Cards, radii, shadows, spacing and the monospace treatment for numbers/dates match the Lab 2/3 surfaces.
- [x] Editable vs read-only fields are visually unambiguous everywhere (§7, STYLE-02).
- [x] Badges for all eight statuses and four priorities render with text plus colour (§8, STYLE-03).
- [x] No obsolete or duplicated UI remains from Lab 3 (no second status control, no placeholder panels).

**Dashboards**
- [x] Every metric card value matches its payload and its drill-down list count (UI-07, UI-08, E2E-03).
- [x] Zero-state and empty-state copy renders for a requester with no tickets and on an empty dataset (API-09, API-12, UI-07).
- [x] Admin sees user counts; IT Staff does not (UI-08).
- [x] Forbidden and safe-failure states render with retry where appropriate (§3.4).
- [x] No dashboard renders a full ticket collection, chart or export control (§11).

**Actions Taken area**
- [x] Desktop table and mobile cards present the same fields for the same data (RESP-02, E2E-06).
- [x] Create mode validates per field, shows the conditional follow-up note, and cannot double-submit (UI-01, UI-02).
- [x] View/edit mode round-trips values; cancel restores; stale save keeps data and shows the conflict notice (UI-04).
- [x] Requester sees the log read-only with no write affordance (UI-03).
- [x] Follow-up chips and attachment notes render as specified, with no download link (UI-03).

**Status control and Resolve dialog**
- [x] Only server-permitted transitions are offered, and the control refreshes after a success or an invalid-transition response (UI-05).
- [x] Confirmation-required transitions ask before submitting (UI-05).
- [x] The Resolve dialog renders one message per `reasons[]` code and keeps the typed summary (UI-06).
- [x] A conflict keeps entered data and realigns the version (UI-05, E2E-02).

**Keyboard, focus and assistive technology**
- [x] Every new control is reachable and operable by keyboard with a visible focus ring (A11Y-02).
- [x] Dialogs trap focus, close on `Esc`, and return focus to the trigger (A11Y-02).
- [x] `axe` reports zero serious and zero critical violations on dashboards, ticket detail and the actions area at all three viewports (A11Y-01).
- [x] Status, priority and follow-up are conveyed by text as well as colour (STYLE-03).
- [x] Live regions announce loading, saving, success and failure (A11Y-01).

**Clipping, overlap and overflow**
- [x] No clipping, overlap or horizontal page scroll at 1280×800, 820×1180 and 390×844 on every Lab 4 screen (RESP-01, RESP-02, E2E-06).
- [x] Screenshots exist for staff dashboard, requester dashboard and the actions area at all three viewports (E2E-06).
- [x] Long descriptions, long summaries and 500-character attachment notes wrap without breaking layout (RESP-02).

---

## 13. Traceability — screen/section to FR / BR / AC

| UI section | FR | BR | AC |
|---|---|---|---|
| §2 Shell + Dashboard navigation (`#/dashboard`) | FR-11 | BR-14, BR-15 | AC-21 |
| §3 Role dashboards | FR-08, FR-09, FR-10 | BR-12, BR-13, BR-16 | AC-02, AC-13, AC-14, AC-15, AC-19, AC-22 |
| §4 Actions Taken area | FR-01, FR-02, FR-03 | BR-01, BR-02, BR-03, BR-04, BR-05, BR-06, BR-19 | AC-01, AC-03, AC-05, AC-06, AC-18, AC-19, AC-24 |
| §5 Status control + Resolve dialog | FR-04, FR-05, FR-06 | BR-07, BR-08, BR-09, BR-10 | AC-09, AC-10, AC-12, AC-18 |
| §6 State catalogue | — | BR-16 | AC-18, AC-19, AC-21 |
| §7 Editable vs read-only | — | BR-03 | AC-18 |
| §8 Badges | FR-04 | BR-08 | AC-19, AC-20 |
| §9 Responsive | — | — | AC-19 |
| §10 Accessibility | — | BR-16 | AC-20 |
| §11 Exclusions | — | — | — |
| §12 Visual and accessibility checklist | — | — | AC-19, AC-20, AC-21 |

### 13.1 Canonical ID index

- FR: FR-01..FR-14.
- BR: BR-01..BR-20.
- AC: AC-01..AC-24.
- D: D-01..D-14.
