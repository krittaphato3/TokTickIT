# CPE 334 Lab 2 — TokTickIT Requester Ticketing MVP: UI Specification (Zen Green Theme)

- **Status:** Draft v1.0
- **Foundation:** React 19 + TypeScript + Vite + **Bootstrap 5.3.8** (existing Lab 1 client). The Zen Green theme is applied by overriding Bootstrap CSS custom properties; no new UI framework is introduced.
- **Companion documents:** [`specification.md`](./specification.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)

---

## 1. Design tokens

### 1.1 Color tokens

| Token | Value | Usage |
|---|---|---|
| `--tok-primary` | `#006B3C` | Primary green — primary buttons, links, active nav, focus ring |
| `--tok-secondary` | `#0B7A46` | Secondary green — hovers, selected states, secondary accents |
| `--tok-primary-soft` | `#EAF6EF` | Pale green — status "New" badge bg, active nav pill, success-tinted surfaces |
| `--tok-page-bg` | `#F5F7F6` | Page background (outside cards) |
| `--tok-surface` | `#FFFFFF` | Surface/cards, editable fields |
| `--tok-text` | `#1E2A25` | Dark charcoal-green — body text, headings |
| `--tok-text-muted` | `#5C6B64` | Secondary text, captions, placeholders |
| `--tok-border` | `#C9D4CE` | Default control/card borders |
| `--tok-field-editable` | `#FFFFFF` | Editable field background |
| `--tok-field-readonly` | `#F0F3F1` | Soft gray-green — read-only field background |
| `--tok-field-readonly-warm` | `#FAF6EF` | Warm ivory — read-only **text blocks** (e.g., ticket description) to visually separate them from inputs |
| `--tok-error` | `#B3261E` | Dark red — error text, borders, destructive actions, required asterisk |
| `--tok-warning` | `#B26A00` | Amber — warning text/icons |
| `--tok-success` | `#1E7A46` | Green — success messages/checks |

Derived/soft variants used for badge and banner backgrounds: error soft `#FDECEA`, warning soft `#FFF4E5`, success soft `#EAF6EF`.

### 1.2 Typography

- Font stack: Bootstrap default (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif`).
- Base: 16px / line-height 1.5. Headings: 600 weight. Scale: page title 1.5rem, section title 1.25rem, body 1rem, small/caption 0.875rem, micro/label 0.8125rem.
- Numbers and the official ticket number (`TTK-2026-000017`) render in a monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) for legibility.

### 1.3 Spacing, radius, shadow

- Spacing scale (rem): 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 (4/8/12/16/24/32/48px). Page content max-width 1200px, gutters 16px (24px on desktop).
- Radius: controls 0.375rem (Bootstrap default), cards 0.75rem, chips/badges 999px.
- Shadow: cards `0 1px 3px rgba(30,42,37,0.08)`; focus ring `3px solid rgba(0,107,60,0.28)`.

---

## 2. Control states

All form controls share these rules (see §8 for the required-asterisk and error placement rules):

| State | Appearance |
|---|---|
| **Editable** | Background `--tok-field-editable` (white), 1px border `--tok-border`, text `--tok-text`. |
| **Read-only** | Background `--tok-field-readonly` (soft gray-green) — warm ivory for description text blocks; border `#D9E2DD`; cursor default; still selectable/copyable. Read-only fields are never focusable for editing. |
| **Invalid** | Border `--tok-error` (dark red); inline message with error icon below the field; `aria-invalid="true"`. |
| **Disabled** | Opacity 0.5, cursor `not-allowed`, no focus ring, `disabled` attribute. |
| **Focused** | Border switches to `--tok-primary`; 3px outer ring `rgba(0,107,60,0.28)`; visible on keyboard and mouse focus. |

---

## 3. Required fields and validation messages

- Required fields: label text followed by a red asterisk (`*`) in `--tok-error`. The asterisk is in the label (not hidden in placeholder).
- Validation messages are **inline, directly below the offending field**, with an error icon + text (never color-only). The message is wired with `aria-describedby` so screen readers announce it.
- On submit with errors, the first invalid field receives focus; the form never submits. The server's field errors map 1:1 to the same inline slots (same message text source of truth).

---

## 4. Button hierarchy

| Variant | Appearance | Use |
|---|---|---|
| **Primary** | Solid `--tok-primary`, white text; hover `--tok-secondary`; radius 0.375rem | Submit ticket, "Create your first ticket", "Apply" |
| **Secondary** | Outline/ghost: `--tok-primary` text + 1px border; hover pale-green bg | "Clear filters", "Cancel" |
| **Tertiary** | Text/link style in `--tok-primary` | "Try again", "View details", "Retry upload" |
| **Destructive** | Dark red (`--tok-error`) outline or solid (danger context) | "Remove attachment" (with inline confirmation) |
| **Disabled** | Any variant at opacity 0.5, `not-allowed`, no hover | While invalid, in flight, or limit reached |
| **Busy** | Primary button shows a spinner + "Submitting…", `disabled`, `aria-busy="true"` | During ticket creation / attachment upload |

---

## 5. Attachment selection and error presentation

- Attachment picker = drag-and-drop zone + "Browse files" button; accepts the 4 allowlisted types (JPG/JPEG, PNG, WEBP, PDF — §4 of api-spec.md).
- Selected files render as **chips**: file icon, original name, size (KB/MB), per-file remove (×) button.
- **Uploading:** per-file progress bar (determinate) + spinner; actions on that file disabled until done.
- **Invalid file (type or size):** chip gets a red border + error icon + inline message ("File too large — max 5 MB" / "File type not supported"), and the file is **not** uploaded. A "Remove" action clears the error.
- **Upload failure (network/500):** chip shows "Upload failed" + "Retry" (tertiary) + "Remove"; other files are unaffected.
- **Limit reached (5 active):** picker is disabled with the caption "Attachment limit reached (5 max)".
- Removed (soft-deleted) attachments render grayed out with strikethrough and a "Removed" badge (see §9).

---

## 6. Screen states

| State | Behavior |
|---|---|
| **Initial** | Form/list renders empty-but-ready; no spinners. |
| **Loading** | List: skeleton rows (3 shimmer bars per row). Detail: skeleton blocks. Buttons that trigger async work show busy state. |
| **Validation** | Inline field errors appear (§3); no request sent. |
| **Submitting** | Submit button busy; form fields disabled; double-clicks ignored (BR-12). |
| **Success** | Create → navigate to the new ticket detail (with ticket number). Upload → chip flips to success check + appears in the attachment list. Soft-remove → chip becomes "Removed". |
| **Failure** | Inline alert banner (soft error bg + icon + message) above the affected section + "Try again"/"Retry"; all user input preserved; no crash. |

---

## 7. Responsive rules

Breakpoints follow Bootstrap 5 (and match AC-19):

| Range | Layout rules |
|---|---|
| **Desktop ≥ 992px** | Ticket list = multi-column table (6 columns, see §10); Create form = two-column grid (category + priority side by side, related system full-width below); navbar shows all items inline. |
| **Tablet 768–991px** | Two-column layout retained for the form; list table kept but with reduced column set (Ticket #, Title, Priority, Status, Created — category moves into title row as a chip). |
| **Mobile < 768px** | Everything stacks vertically. Ticket list becomes **cards** (§10). Form fields stack full-width. Touch targets ≥ 44×44px. **No horizontal scroll** anywhere. Pagination collapses to Prev / Next + "Page X of Y". |

The Dev Requester selector stays visible at all breakpoints (compact on mobile).

---

## 8. Accessibility

- Every field has a visible `<label>`; errors use `aria-describedby`; invalid fields set `aria-invalid`.
- Visible focus ring on all interactive elements (keyboard and pointer); logical tab order; skip-to-content link.
- Errors, badges, and status never rely on color alone: always icon + text or text label (see §11 badge rules).
- Busy/loading regions announce via `aria-live="polite"`; form submit announces success/failure.
- All controls operable by keyboard (including drag-and-drop fallback: Browse button). Contrast: body text ≥ 4.5:1 against its background; primary button text white on `#006B3C` ≥ 4.5:1.

---

## 9. Application shell and navigation

- Sticky top navbar: white surface, bottom border `--tok-border`. Brand "TokTickIT" in `--tok-primary` with a ticket glyph; clicking returns to My Tickets.
- Nav items: **New Ticket**, **My Tickets**. Active item = pale-green pill (`--tok-primary-soft`, primary text); inactive = muted text with hover state.
- Top right: **Development Requester** selector (a labeled `<select>` of active requesters from `GET /api/requesters`) with the persistent caption **"Testing only — not real authentication"** (muted, 0.8125rem). Switching reloads the current screen scoped to the new requester and resets search/filters/sort/pagination (BR-05).

---

## 10. Ticket list (My Tickets v2)

The screen is a faithful port of the approved reference illustration [`docs/mockups/my-tickets-v032.html`](../mockups/my-tickets-v032.html). Structure, styling, badge colors, pagination window, state copy, and responsive behavior follow that file exactly; this section is the normative summary.

**Page head:** h1 "My Tickets", subtitle "View and track all of your support requests.", right side Clear Filters (secondary, refresh icon) + Create Ticket (primary, plus icon).

**Filter card (grid):**
- Search input with magnifier icon, placeholder "Search by ticket number or summary...", and a clear (×) button when non-empty. Debounced (300ms); matches ticket number OR title OR description.
- Labeled selects: **Category** ("All Categories" + 4 seeded), **Requested Priority**, **IT Priority**, **Current Status** — wired to `categoryId`, `priority`, `itPriority`, `status`. Any change resets page to 1.
- Top-right **Clear Filters** resets search, filters to defaults and re-requests page 1; an inline "Clear filters" secondary button also appears in the no-results state.

**Desktop ≥768px fluid table (zero horizontal scroll):** width 100%; thead cells nowrap; tbody cells wrap normally with compact paddings. Columns exactly (9): Ticket No. (monospace green link) · Created Date · Summary · Category · Requested Priority (badge) · IT Priority (badge) · Current Status (badge) · Ticket Owner · Last Updated. Sortable headers show stacked carets (▲/▼ SVG pair) on Ticket No., Created Date, Last Updated and set `aria-sort="ascending"/"descending"`; clicking cycles direction; switching columns resets to its sensible default (`ticketNumber asc`, dates `desc`). Hover row highlight pale green.

**Tablet 768–991px:** ALL nine columns remain visible with reduced paddings/type (thead/td 0.75rem); wrapping allowed; never hide a column, never scroll horizontally.

**Mobile < 768px cards:** table hidden; each ticket = card with row 1 (ticket link + created date), bold summary, a three-badge row (Requested Priority · IT Priority · Current Status), and meta rows "Category · Owner" and "Updated <date>". Touch targets ≥ 44px (card link min-height 44px, page buttons 44px, selects/inputs min-height 44px, stacked single-column filter card). No horizontal scroll.

**Pagination footer:** left "Showing X to Y of Z tickets" (`aria-live="polite"`); right ‹ Previous / numbered buttons (window 1–5 + ellipsis + last page when totalPages > 7; active page solid green with `aria-current="page"`; bounds disabled) / Next ›. Page change scrolls the list back to the top.

**Live states (distinct):**
- **Loading** — shimmer skeleton rows.
- **No tickets yet** (zero tickets, no filters) — heading + copy + "Create your first ticket" primary button.
- **No results match your filters** (filters match nothing) — heading + copy + "Clear filters" secondary button.
- **Failure** — alert banner "We couldn't load your tickets. Your filters are preserved." + tertiary "Try again"; all filter state is preserved across retry.

---

## 11. Priority and status badges

Badges are pill-shaped, always carry their **text label** (non-color indicator):

| Badge | Style |
|---|---|
| Priority Low | pale green: bg `--tok-success-soft` (#EAF6EF), text `--tok-success`, border #CBE7D4 |
| Priority Medium / Pending | amber: bg `--tok-warning-soft` (#FFF4E5), text #9A5B00, border #F0D9B5 |
| Priority High | pale red: bg `--tok-error-soft` (#FDECEA), text `--tok-error`, border #F3C4BE |
| Priority Critical | solid `--tok-error`, white text, with "! " glyph prefix |
| Status New | pale green: bg `--tok-primary-soft`, text `--tok-primary`, with dot glyph |
| Status Open | pale blue: bg `--tok-info-soft` (#E9F0FB), text `--tok-info` (#1D5FBF), border #C9DAF3 |
| Status In Progress | pale green: bg `--tok-success-soft`, text `--tok-success`, border #CBE7D4 |
| Status Resolved | teal-green: bg #E6F4EE, text `--tok-secondary`, border #C4E4D4 |
| Neutral Unset / Unassigned | muted text ("Unset" pill for null itPriority; muted plain text "Unassigned" for null ownerName) |

---

## 12. Ticket detail (read-only layout)

- **Header:** ticket number (monospace) + Status badge + Priority badge; page title = ticket title.
- **Metadata definition list** (read-only fields, §2 styling): Category, Priority, Status, Created, Updated, Requested by (requester name), Related System (chip, or "None" in muted text).
- **Description:** read-only block on warm ivory (`--tok-field-readonly-warm`) with the same border treatment; "No description provided" muted text when empty.
- **Attachments section:** "Attachments (n)" + "Add attachment" (picker, §5). Each active attachment = chip row: icon, file name (download link), size, upload date, "Remove" (destructive, with inline confirm: "Remove this attachment?" → Confirm/Cancel). Removed attachments render grayed + strikethrough + "Removed" badge and are not downloadable.
- **Navigation:** "Back to My Tickets" (tertiary).
- The page is fully read-only for ticket fields: no edit/delete actions exist for the ticket itself this sprint.

---

## 13. Attachment states (summary)

| State | Appearance | Actions |
|---|---|---|
| **Active** | Normal chip; green check once uploaded | Download, Remove |
| **Uploading** | Progress bar + spinner; disabled chip | Cancel not required; remove after completion |
| **Invalid** | Red border + error icon + message (type/size) | Remove (dismiss error) |
| **Removed** | Grayed, strikethrough, "Removed" badge | None |
| **Unavailable** | Download failed → inline "Download failed — Retry" | Retry (tertiary) |
