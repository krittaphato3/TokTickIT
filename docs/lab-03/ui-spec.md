# CPE 334 Lab 3 — TokTickIT Real Auth + Staff/Admin Workflows: UI Specification (Zen Green Theme)

- **Status:** Final v1.0 — approved engineering contract
- **Foundation:** React 19 + TypeScript + Vite + Bootstrap 5.3.8. Zen Green theme applied by overriding Bootstrap CSS custom properties. No new UI framework.
- **Companion documents:** [`specification.md`](./specification.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)
- **Parent theme:** [`docs/lab-02/ui-spec.md`](../lab-02/ui-spec.md) — all Lab 2 tokens, cards, badges, forms, and feedback conventions remain in force. This document extends them for authentication, staff, and administration.

---

## 1. Design tokens (Zen Green — inherited + Lab 3 additions)

### 1.1 Color tokens

| Token | Value | Usage |
|---|---|---|
| `--tok-primary` | `#006B3C` | Primary green — primary buttons, links, active nav, focus ring |
| `--tok-secondary` | `#0B7A46` | Secondary green — hovers, selected states |
| `--tok-primary-soft` | `#EAF6EF` | Pale green — New badge bg, active nav pill, success-tinted surfaces |
| `--tok-page-bg` | `#F5F7F6` | Page background outside cards |
| `--tok-surface` | `#FFFFFF` | Cards, editable fields, modals |
| `--tok-text` | `#1E2A25` | Body text, headings |
| `--tok-text-muted` | `#5C6B64` | Secondary text, captions, hint text |
| `--tok-border` | `#C9D4CE` | Card and control borders |
| `--tok-field-editable` | `#FFFFFF` | Editable field background |
| `--tok-field-readonly` | `#F0F3F1` | Soft gray-green — read-only field background |
| `--tok-field-readonly-warm` | `#FAF6EF` | Warm ivory — read-only text blocks (description, internal-note warning context) |
| `--tok-error` | `#B3261E` | Error text, invalid borders, destructive actions, required asterisk |
| `--tok-error-soft` | `#FDECEA` | Error banner and High-priority badge background |
| `--tok-warning` | `#B26A00` | Warning text and icons |
| `--tok-warning-soft` | `#FFF4E5` | Warning banner background |
| `--tok-success` | `#1E7A46` | Success messages and checks |
| `--tok-success-soft` | `#EAF6EF` | Success banner background |
| `--tok-info` | `#1D5FBF` | Open-status badge text and info accents |
| `--tok-info-soft` | `#E9F0FB` | Open-status badge background |
| `--tok-internal-bg` | `#FFF8E6` | Internal Notes thread background (amber-tinted, distinct from public) |
| `--tok-internal-border` | `#E8D9A8` | Internal Notes thread border |

### 1.2 Typography

- Font stack: Bootstrap default (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif`).
- Base 16px / 1.5. Headings weight 600. Scale: page title 1.5rem, section title 1.25rem, body 1rem, small/caption 0.875rem, label/micro 0.8125rem.
- Ticket numbers (`TTK-2026-000017`), dates, and counts render in monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`).

### 1.3 Spacing, radius, shadow

- Spacing scale (rem): 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3. Content max-width 1200px, gutters 16px (24px desktop).
- Radius: controls 0.375rem, cards 0.75rem, chips/badges 999px, modals 0.75rem.
- Shadow: cards `0 1px 3px rgba(30,42,37,0.08)`; modals `0 8px 28px rgba(30,42,37,0.22)`; focus ring `0 0 0 3px rgba(0,107,60,0.28)`.
- Touch targets: minimum 44×44px on all interactive elements below 768px.

---

## 2. Application shell and role-based navigation

> Traceability: FR-02, FR-03, FR-13, FR-14 | BR-02, BR-08, BR-10, BR-20 | AC-02, AC-05, AC-18.

### 2.1 Shell layout

- Sticky top navbar: white surface, bottom border `--tok-border`, min-height 56px. Left: brand "TokTickIT" in `--tok-primary` with ticket glyph; brand link routes to the role home (Requester → `#/my`, Staff → `#/staff/queue`, Administrator → `#/admin/users`). Center/left: role nav (§2.2). Right: authenticated-user cluster + Logout.
- Below navbar: full-width `main` with `.tok-main` container (max-width 1200px). Footer: "TokTickIT — Real Auth + Staff/Admin" left, "Zen Green Theme · Lab 3" right, muted 0.8125rem.
- The Lab 2 Development Requester selector, `RequesterSelector`, `RequesterSelection` screen, `DevRequesterProvider`, and the "Testing only — not real authentication" caption are removed entirely. No screen renders a requester-switching control.

### 2.2 Authenticated-user cluster

- Right cluster shows: circular avatar with user initials (pale-green bg, primary text), full name (body 1rem, weight 600, truncated at 160px with `title` attribute), role badge (§11.3), and a Logout button (secondary outline style).
- Cluster is present on every authenticated screen at every breakpoint; on mobile it compacts to avatar + role badge + Logout icon-button with `aria-label="Log out"`.

### 2.3 Role routes and navigation

Hash-based routing is retained (`#/…`). Canonical Lab 3 routes:

| Role | Home route | Routes in nav | Full route set permitted |
|---|---|---|---|
| Requester | `#/my` | My Tickets (`#/my`), New Ticket (`#/new`), Ticket Detail (`#/tickets/:number`, reached via list link, not in nav) | `#/my`, `#/new`, `#/tickets/:number`, `#/change-password` |
| IT Staff | `#/staff/queue` | Ticket Queue (`#/staff/queue`), Ticket Detail (`#/staff/tickets/:number`, reached via Open action, not a separate nav entry) | `#/staff/queue`, `#/staff/tickets/:number`, `#/change-password` |
| Administrator | `#/admin/users` | User Management (`#/admin/users`) | `#/admin/users`, `#/change-password` |
| All authenticated | — | Change Password entry under user menu (`#/change-password`) | — |
| Unauthenticated | `#/login` | None | `#/login` only |

- Nav behavior: each role sees only its own destinations. A Requester never sees Ticket Queue or User Management links; Staff never sees New Ticket, My Tickets, or User Management; Administrator sees only User Management (plus the user-menu Change Password). Rendering no link is the first layer; the router guard is the second: direct navigation to a non-permitted route renders the Forbidden state (§10) with a link back to the role home, and unauthenticated access to any authenticated route redirects to `#/login` with `?next=` preserved.
- Active nav item: pale-green pill (`--tok-primary-soft` bg, `--tok-primary` text, weight 600) with `aria-current="page"`. Inactive: muted text with hover to primary text.
- Legacy Lab 2 hashes (`#/tickets`, `#/new-ticket`, `#/select-requester`) redirect: `#/tickets` → `#/my` for Requesters; `#/new-ticket` → `#/new`; `#/select-requester` → role home. Unknown hashes render Not Found (§10).
- Logout: `POST /api/auth/logout`, clears client session state, redirects to `#/login` with confirmation banner "You have been signed out." Back-button use after logout re-checks `GET /api/auth/me` and redirects to login; no cached authenticated screen is usable.

---

## 3. Login (`#/login`)

> Traceability: FR-01 | BR-01, BR-06, BR-09, BR-16 | AC-01.

### 3.1 Layout

- Centered card (max-width 440px, white surface, 0.75rem radius, card shadow), page bg `--tok-page-bg`. Card head: brand mark + h1 "Sign in to TokTickIT" + muted subtitle "Use your work email and password."
- Fields: Email (type email, autocomplete username), Password (type password, autocomplete current-password, show/hide toggle button with eye icon and `aria-pressed`). Both fields have visible `<label>` elements; required asterisk in `--tok-error`.
- Primary submit button "Sign in" full-width; busy state shows spinner + "Signing in…" with `disabled` + `aria-busy="true"`. No secondary actions. There is deliberately no "Forgot your password?" link — password recovery via email is excluded from Lab 3 and the link must not be rendered.

### 3.2 Validation

- Client-side, on submit and on blur: Email required + must match email shape (`name@domain.tld`); Password required (non-empty; length and composition are not pre-validated here — the server is the authority).
- Invalid fields: red border, error icon + inline message directly below the field, `aria-invalid="true"` + `aria-describedby` pointing at the message id. Message copy: "Enter your email address." / "Enter a valid email address." / "Enter your password." On submit with errors the first invalid field receives focus and no request is sent.

### 3.3 Submission, busy, and feedback

- Submit disables both fields and the button, ignores double-clicks, and announces "Signing in…" via `aria-live="polite"`.
- Success: `GET /api/auth/me` resolves the role and `mustChangePassword`. If `mustChangePassword` is true → redirect to `#/change-password?first=1`. Otherwise redirect to role home or preserved `?next=` when permitted, else role home.
- Safe failure (401 invalid credentials): red alert banner at top of card (`role="alert"`), copy "Email or password is incorrect. Check your entries and try again." Field values preserved except password is cleared and focused. No indication of whether the email exists.
- Inactive account: identical banner and behavior to invalid credentials ("Email or password is incorrect."). The UI never reveals that an account exists but is deactivated; differentiation exists only in server logs, never in client copy or status codes surfaced to the user.
- Server failure (500 / network): amber-tinted error banner "We could not sign you in. Check your connection and try again." + tertiary "Try again" button that re-submits with preserved email. Validation errors and safe-failure copy are never combined in one banner.

---

## 4. Mandatory password change (`#/change-password`)

> Traceability: FR-04 | BR-02, BR-07, BR-16 | AC-02, AC-06.

### 4.1 Gate behavior

- Any authenticated response with `mustChangePassword: true` forces the gate: every route except `#/change-password` and logout redirects to `#/change-password?first=1`. The shell renders only the minimal gated chrome (brand + user cluster + Logout); role nav is hidden until the change succeeds. Direct hash manipulation cannot bypass the gate because the guard re-checks `GET /api/auth/me` on each navigation.
- First-login variant (`?first=1`): page head h1 "Choose a new password", info banner (pale-green, lock icon) "Your administrator set an initial password. Choose a new password to continue." Voluntary variant (reached from user menu): h1 "Change password", no banner, includes a Current Password field.

### 4.2 Fields and rules

- First-login fields: New Password, Confirm New Password. Voluntary fields add Current Password on top.
- Password rules card (always visible, updates live with check/x icons, `aria-live="polite"`): minimum 8 characters, maximum 72 characters, contains uppercase letter, contains lowercase letter, contains number, contains special character (`!@#$%^&*` and peers), differs from current password (voluntary) or from the initial password (first-login verified server-side; client checks non-equality only when the current value is known), confirmation matches.
- Show/hide toggles on each password field. Required asterisks on all fields.

### 4.3 Validation and success

- Client validation mirrors the rules card; mismatched confirmation shows "Passwords do not match." below the confirmation field. Server 400 field errors map 1:1 into the same inline slots.
- Submit button copy: first-login "Save and continue", voluntary "Save new password". Busy: spinner + "Saving…" + disabled form.
- Success: green banner "Password saved. Continuing to your workspace…" then automatic redirect to role home within 800ms. The gate flag clears only after the server confirms `mustChangePassword: false`; the client never clears it optimistically.
- Failure: 400 → inline field errors preserved with entered values intact; 401 (wrong current password, voluntary) → inline error under Current Password "Current password is incorrect."; 500 → banner "We could not save your password. Try again." + retry preserving all input.

---

## 5. Requester regression (authenticated identity)

> Traceability: FR-05, FR-08, FR-10, FR-13 | BR-03, BR-04, BR-05, BR-11, BR-14, BR-17 | AC-03, AC-07, AC-12, AC-14.

### 5.1 Selector removal and ownership

- The Development Requester selector and Change Requester action are deleted from header, selection screen, context, and local storage. All Lab 2 requester APIs now scope by the authenticated identity server-side; the client never sends a requester identifier.
- My Tickets (`#/my`), New Ticket (`#/new`), and Ticket Detail (`#/tickets/:number`) retain Lab 2 layout, filter card, table/cards, create form, and attachment section behavior unchanged, except identity comes from the session. Switching users requires logout + login; there is no in-app identity switch.

### 5.2 My Tickets preserved surface

- Page head: h1 "My Tickets" + muted subtitle + actions Clear Filters (secondary) and Create Ticket (primary). Filter card: search (ticket number/summary/description, 300ms debounce, clear-× button), Category, Requested Priority, IT Priority, Current Status selects. Table ≥768px with sortable Ticket No./Created/Updated, pagination footer "Showing X to Y of Z tickets" with `aria-live="polite"`. Cards below 768px. Empty, no-results, loading-skeleton, and failure states identical to Lab 2.

### 5.3 Ticket Detail additions

- Header card unchanged (read-only grid: number, date, category, related system, requester name, requested priority badge, IT priority badge/Unset, status badge, owner/Unassigned, summary span 3, description full-width warm ivory). Breadcrumb `My Tickets / <number>` + Back button retained.
- Tab shell is now limited to Public Comments and Attachments only, plus the header signal button (Problem Appears Resolved below). The Lab 2 Service Actions tab and any Resolution Summary field are removed and must not be rendered. There is no Event Log tab and no event-log endpoint; system activity renders only as a ticket status line in the header when needed.
- Public Comments tab: thread of shared messages visible to requester and staff. Each entry shows author name, role badge, creation timestamp (local date + time), and safe-rendered body (plain text with wrapping; HTML escaped). Composer at bottom: multiline textarea with label "Add a public comment", hint "Visible to IT staff. Do not include secrets.", Post button (primary, disabled when empty/whitespace-only), 2000-character limit with live counter "1,842 characters remaining". Empty thread state: "No public comments yet. Start the conversation below."
- Problem Appears Resolved action: secondary button in the detail header row, copy "Problem appears resolved" with check-circle icon, visible only to the ticket owner while status is not Resolved/Closed/Cancelled. Clicking opens a confirm modal ("Mark this ticket as appearing resolved? IT staff will review and formally resolve it.") with Confirm (primary) and Cancel (secondary). Confirm posts the indication (append-only marker + optional public comment) and shows success banner "Thanks — IT staff have been notified that the problem appears resolved." The ticket status does not change; the indication renders as a pale-green banner with timestamp inside the Public Comments tab. The button disables after one indication per requester per ticket open episode with caption "Marked as appearing resolved ✓".
- Ownership enforcement display: a requester opening another requester's `#/tickets/:number` receives the Not Found state ("Ticket not found. It may have been removed or belongs to another account.") — never a forbidden hint that the ticket exists under another owner.

---

## 6. IT Staff Ticket Queue (`#/staff/queue`)

> Traceability: FR-06 | BR-13, BR-15, BR-19 | AC-08.

### 6.1 Page head and query controls

- Page head: h1 "Ticket Queue" + muted subtitle "Find, prioritize, and open tickets across all requesters." Right: result count (muted, `aria-live="polite"`) + Clear Filters (secondary).
- Filter card (white card, grid: search widest + Category + Requested Priority + IT Priority + Status + Owner selects; Owner options: All Owners, Unassigned, plus active staff names): Search input with magnifier icon and clear-×, hint "Search by ticket number or summary…", 300ms debounce. Category select ("All Categories" + seeded set). Requested/IT Priority ("All Priorities" + Low/Medium/High/Critical). Status ("All Statuses" + the 8 Lab 3 statuses). Owner ("All Owners" default). Any committed change resets page to 1.

### 6.2 Desktop table (≥768px)

Nine columns in fixed order, plus a trailing Open action column:

| # | Column | Content | Sortable |
|---|---|---|---|
| 1 | Number | Monospace green link → `#/staff/tickets/:number` | yes |
| 2 | Created | Local date + time, muted 0.875rem | yes (default descending per BR-19) |
| 3 | Summary | Wrapping title, 2-line clamp | no |
| 4 | Category | Plain text | no |
| 5 | Req. Priority | Priority badge (§11.2) | no |
| 6 | IT Priority | Priority badge or "Unset" neutral pill | no |
| 7 | Status | 8-status badge (§11.1) | no |
| 8 | Owner | Plain text or muted "Unassigned" | no |
| 9 | Updated | Local date + time, muted 0.875rem | yes |
| 10 | Action | "Open" secondary small button → detail | no |

- Fluid table: 100% card width, `table-layout: auto`, header cells no-wrap, body cells wrap, compact padding (~0.69rem vertical). Sortable headers show stacked caret pair with active direction in `--tok-primary` and `aria-sort`. Row hover pale green. Ticket-number link and Open button share the same destination; both have visible focus rings.

### 6.3 Pagination, sorting, and query defaults

- Default ordering: Created descending per BR-19. Page size 20, pager `<nav>` with ‹ Previous, numbered window (`1 2 3 4 5 … last` collapsing per Lab 2 windowing), Next ›. Footer left "Showing X to Y of Z tickets". Sort, sort direction, and filter state follow BR-19. Page change scrolls list to top and announces via live region. Invalid query values from the URL fall back to defaults with a muted notice "Some filters were reset to valid values."

### 6.4 Small-screen cards and feedback states

- Below 768px the table becomes stacked cards: row 1 = number link + created date right-aligned muted; bold summary; badge row (Req. Priority · IT Priority · Status); meta "Category · Owner" and "Updated <date>"; full-width Open button (44px min height). No horizontal scroll at any width.
- Loading: three shimmer skeleton rows. Empty (zero tickets in system): "No tickets in the queue yet." + muted explanation. No-results (filters match nothing): "No tickets match these filters." + "Clear filters" secondary button. Forbidden (non-staff direct access): lock icon + "You do not have access to the staff queue." + link to role home. Failure (500/network): alert banner "We could not load the queue. Your filters are preserved." + tertiary "Try again"; filters, sort, and page survive and are reused verbatim on retry.

---

## 7. IT Staff Ticket Detail (`#/staff/tickets/:number`)

> Traceability: FR-07, FR-08, FR-09 | BR-04, BR-12, BR-13, BR-14, BR-15 | AC-04, AC-09, AC-10, AC-11, AC-12, AC-13.

### 7.1 Header and field grouping

- Breadcrumb row: `Ticket Queue / <number>` left (Queue is a link), Back to Queue secondary button right.
- Header card groups fields visually: Read-only group (gray-green `--tok-field-readonly` inputs, warm ivory for Description): Category, Requester (name + email muted), Summary (span 3), Description (full width, "No description provided." muted when empty). Editable group (white `--tok-field-editable` controls with green left accent border): Owner (select of active IT Staff/Administrator + Unassigned), IT Priority (select Low/Medium/High/Critical), Status (select limited to permitted transitions from current status per transition matrix; disallowed options omitted, not merely disabled).
- Each editable control has a visible label, inline save behavior: changing Owner/IT Priority/Status marks the card dirty, reveals Save Changes (primary) + Discard (secondary) bar, and validates before submit. Save shows busy "Saving…" with form disabled; success shows green banner "Ticket updated." + header re-render; 400 shows inline field error; 409 (stale transition or owner conflict) shows amber banner with "Reload" action; 500 shows safe-failure banner with retry preserving edits.

### 7.2 Ownership actions

- When Owner is Unassigned: primary button "Claim ticket" assigns the current staff user and copies Requested Priority into IT Priority when IT Priority is Unset (copy-on-claim rule surfaced as muted caption "Claiming copies Requested Priority into IT Priority when unset.").
- When owned by someone else: Owner select + "Reassign" flow — changing the select then Save opens a confirm modal ("Reassign this ticket from <old> to <new>? The previous owner loses ownership.") with Confirm/Cancel. Claim/Reassign require confirmation only when taking from another owner; claiming an unassigned ticket saves immediately.
- Owner select lists only active IT Staff and Administrator users; deactivated users never appear. Attempting to save a deactivated owner (race) surfaces 400 inline "Select an active staff member."

### 7.3 Tabs: Public / Internal / Attachments

Exactly three tabs (`role=tablist`, arrow-key navigation, `aria-selected`): Public Comments, Internal Notes, Attachments. No Service Actions tab and no Resolution Summary field exist on this screen.

- Public Comments tab: white cards, green left border, author + role badge + timestamp header, safe-rendered body. Composer identical to requester side. Copy warns "Visible to the requester."
- Internal Notes tab: visually distinct — amber-tinted background (`--tok-internal-bg`), amber border, lock icon in tab label "Internal Notes (staff only)", persistent warning banner inside the tab (amber, lock icon): "Staff only — never visible to the requester. Do not paste requester-facing text here." Entries show author + timestamp; composer textarea labeled "Add an internal note" with hint "Visible only to IT staff and administrators." Post button primary. Empty state: "No internal notes yet."
- Attachments tab: read-only viewer (view/download with type/size chips and retry; no upload and no soft-remove/delete). Staff see all attachments on the ticket; requester-scoped visibility rules continue to be enforced server-side.
- Posting feedback: Post buttons disable on empty/whitespace content; over-limit (2000 chars comments, 2000 chars notes) shows inline "Keep this entry under 2000 characters." with counter; busy shows spinner; success appends the entry to the top of the thread with green flash + live-region announcement; 403/404/500 map to the feedback matrix (§10) with input preserved.

---

## 8. Administrator User Management (`#/admin/users`)

> Traceability: FR-11, FR-12, FR-13 | BR-09, BR-10, BR-18 | AC-15, AC-16, AC-17, AC-18.

### 8.1 User list

- Page head: h1 "User Management" + muted subtitle "Create accounts, assign roles, and control access." Right: "Create user" primary button (plus icon).
- Filter row (single white card): Search input (magnifier, clear-×, hint "Search by name or email…", 300ms debounce, case-insensitive across name + email) + Role filter (single-select: "All Roles", Requester, IT Staff, Administrator). Only one role filter at a time; no multi-filter, no pagination, no multi-column sorting — the list renders all matching users in fetched order (id ascending).
- Table columns exactly: Name (weight 600 + avatar initials), Email (muted, monospace for the local part), Role (role badge §11.3), Status (Active green pill / Inactive gray pill), Actions (Edit secondary small button opening the edit modal). Rows: hover pale green. Below 768px: stacked cards (name + status row, email line, role badge, full-width Edit button).
- Table caption with live-region count "Showing N users".
- Administrator ticket access is view-only: Administrators have no staff ticket actions (no claim, reassign, Owner/IT Priority/Status edits, and no comment/note composers on ticket screens). Ticket write attempts as Administrator are rejected with 403 and render the Forbidden state (§10).

### 8.2 Create and Edit modals

- Create User modal (dialog, focus-trapped, `aria-modal="true"`, labelled by modal title "Create user"): fields Name (required), Email (required, email shape), Role (required select: Requester / IT Staff / Administrator), Active toggle (switch, default on), Initial Password (required, min 8 chars, show/hide toggle, hint "The user must change this at next sign-in."). No "send password reset email" checkbox and no email-delivery control of any kind is rendered — initial passwords are communicated by the approved local-lab behavior only.
- Edit User modal (title "Edit user — <name>"): fields Name, Email, Role (same select), Active toggle. Initial password is not editable here; a separate "Set initial password" section at the modal foot contains a New Initial Password field + "Set initial password" secondary button.
- Validation: inline below each field with icon + `aria-describedby`. Name required ("Enter a name."); Email required + shape ("Enter a valid email address."); Role required ("Select a role."); Initial Password min 8 ("Use at least 8 characters."). First invalid field focused on submit; no request sent while invalid.
- Busy: submit button spinner + "Saving…" + modal fields disabled. Success: modal closes, green banner above list "User <email> created." / "Changes to <email> saved." / "Initial password set for <email>. They must change it at next sign-in." List refreshes preserving search + role filter.

### 8.3 Safety and conflict feedback

- Duplicate email (409): inline error under Email "An account with this email already exists." Values preserved; modal stays open.
- Invalid role (400): inline error under Role "Select a permitted role: Requester, IT Staff, or Administrator."
- Self-deactivation: when an administrator clears their own Active toggle, the toggle is blocked client-side with inline warning "You cannot deactivate your own account." and Save stays disabled for that change; server 409 is also surfaced as amber banner if raced.
- Last active Administrator: deactivating or re-roling the final active Administrator is blocked with amber banner "At least one active Administrator must remain. This change was not saved." plus inline toggle error. Server `last active Administrator` 409 maps to the same copy.
- Forbidden (non-admin direct access to `#/admin/users` or its APIs): lock-icon state "User management is restricted to administrators." + link to role home. Failure (500/network): banner "We could not save this user. Try again." with input preserved; list-load failure shows "We could not load users." + "Try again" preserving search/filter.

---

## 9. Screen modes (create / view / edit)

> Traceability (modes): FR-05, FR-06, FR-07, FR-11, FR-12 | BR-14, BR-18 | AC-07, AC-12, AC-13.

| Screen | Create mode | View mode | Edit mode |
|---|---|---|---|
| Login | — (single submit form) | — | — (email + password entry with validation) |
| Change Password | — | — | First-login (new + confirm) and voluntary (current + new + confirm) forms with live rules card |
| Requester New Ticket | Full create form (category, priority, summary, description, attachments) with busy Submit | — | — |
| Requester My Tickets | — (Clear Filters resets query) | List/table/cards with search/filter/sort/pagination | — |
| Requester Detail | Public-comment composer (append-only) + resolved-indication confirm modal | Read-only header + threads + attachments | — (no ticket-field editing for requesters) |
| Staff Queue | — | Cross-ticket table/cards with query controls | — |
| Staff Detail | Internal-note and public-comment composers (append-only) | Read-only group + three-tab thread shell + attachments | Owner / IT Priority / Status controls with Save/Discard bar + reassign confirm modal |
| Admin Users | Create User modal (name/email/role/active/initial password) | User table/cards with search + single role filter | Edit User modal (name/email/role/active) + set-initial-password section |

- Append-only rule: Public Comments and Internal Notes have no edit or delete affordances anywhere. Draft composer content is the only mutable text; posted entries render without action buttons.
- Deactivation replaces deletion everywhere: no Delete buttons exist for users, tickets, comments, or notes.

---

## 10. Visual feedback matrix (all Lab 3 screens)

> Traceability (cross-cutting feedback): FR-01, FR-04, FR-06, FR-11, FR-12 | BR-01, BR-04, BR-06, BR-09, BR-10, BR-12, BR-16, BR-18, BR-19, BR-20 | AC-01, AC-04, AC-06, AC-08, AC-09, AC-11, AC-15, AC-16, AC-17.

| Feedback | Appearance | Screens and copy |
|---|---|---|
| Loading | Skeleton shimmer rows/blocks; buttons show spinner | Queue/detail/lists: skeleton rows. Login/change-password: button spinner "Signing in…" / "Saving…". `aria-live="polite"`. |
| Saving | Form disabled, primary button spinner + "Saving…", `aria-busy="true"` | Staff detail Save bar, admin modals, comment/note Post buttons, password save. Double-submits ignored. |
| Success | Green banner (success-soft bg, check icon) + live announcement, auto-dismiss only for transient post confirmations | Login redirect; "Password saved. Continuing…"; "Ticket updated."; "User <email> created."; comment/note appended with flash. |
| Validation | Inline icon + message below field, red border, `aria-invalid`, first-invalid focused | All forms (§3–§8). Server 400 details map into identical slots. |
| Empty | Centered illustration-free state: heading + muted explanation + primary action | Queue "No tickets in the queue yet."; Public thread "No public comments yet."; Internal "No internal notes yet."; Users list "No users match." only when system truly empty (rare). |
| No-results | Distinct from empty: heading + filter-aware copy + "Clear filters" secondary | Queue "No tickets match these filters."; Admin "No users match this search." + "Clear search" button. Filters preserved. |
| Forbidden (403) | Lock icon + heading + link to role home; no protected data rendered | Staff queue/detail for requesters; internal-notes endpoints for requesters; admin screen/APIs for non-admins. Requester internal-notes access renders as Not Found to avoid leaking existence. |
| Not-found (404) | Heading "Ticket not found." / "User not found." + muted explanation + back link | Unknown ticket numbers, cross-owner requester detail access, stale admin edit targets. Never discloses other-owner content. |
| Conflict (409) | Amber banner + inline field context + preserved input | Duplicate email; self-deactivation; last-Administrator guard; stale status transition; owner race. Copy names the guard (e.g., "At least one active Administrator must remain."). |
| Failure (500 / network) | Soft-error banner (`--tok-error-soft`, icon, `role="alert"`) + tertiary "Try again" + preserved input/filters | All screens: "We could not load… Your filters are preserved." / "We could not save… Try again." Retry reuses identical parameters. |

---

## 11. Badges

> Traceability (badges): FR-06, FR-07, FR-14 | BR-13, BR-15 | AC-08, AC-11.

### 11.1 Ticket status badges (8, Lab 3 set)

All pills carry text labels plus icon/dot glyphs (never color-only):

| Status | Style |
|---|---|
| New | Pale green: bg `--tok-primary-soft`, text `--tok-primary`, dot glyph |
| Open | Pale blue: bg `--tok-info-soft`, text `--tok-info`, border `#C9DAF3` |
| In Progress | Pale green: bg `--tok-success-soft`, text `--tok-success`, border `#CBE7D4` |
| Waiting for Requester | Amber: bg `--tok-warning-soft`, text `#9A5B00`, border `#F0D9B5`, hourglass glyph |
| Resolved | Teal-green: bg `#E6F4EE`, text `--tok-secondary`, border `#C4E4D4`, check glyph |
| Closed | Gray: bg `#EEF1EF`, text `#4B5752`, border `#D4DBD6`, lock glyph |
| Reopened | Pale red: bg `--tok-error-soft`, text `--tok-error`, border `#F3C4BE`, reopen glyph |
| Cancelled | Outlined gray: white bg, text `#4B5752`, dashed border `#B9C4BE`, slash glyph |

### 11.2 Priority badges

| Badge | Style |
|---|---|
| Low | Pale green: bg `#EAF6EF`, text `--tok-success`, border `#CBE7D4` |
| Medium | Amber: bg `#FFF4E5`, text `#9A5B00`, border `#F0D9B5` |
| High | Pale red: bg `#FDECEA`, text `--tok-error`, border `#F3C4BE` |
| Critical | Solid `--tok-error`, white text, "! " prefix glyph |
| Unset (IT Priority null) | Neutral pill: bg `#EEF1EF`, text `#5C6B64`, copy "Unset" |

Requested Priority and IT Priority share the same badge scale; Unset appears only for IT Priority.

### 11.3 Role badges

| Role | Style |
|---|---|
| Requester | Pale-green pill: bg `--tok-primary-soft`, text `--tok-primary` |
| IT Staff | Pale-blue pill: bg `--tok-info-soft`, text `--tok-info` |
| Administrator | Deep-green solid: bg `--tok-primary`, white text |

Role badges appear in the shell user cluster, comment/note authorship headers, and the admin user table.

---

## 12. Editable versus read-only styling

> Traceability (styling): FR-01, FR-04, FR-07, FR-12 | BR-07, BR-16 | AC-01, AC-06, AC-16.

- Editable: white bg (`--tok-field-editable`), 1px `--tok-border`, text `--tok-text`. Focus: border `--tok-primary` + 3px ring. Applies to login fields, password fields, search inputs, selects in filter cards, Owner/IT Priority/Status controls, composers, and admin modal fields.
- Read-only: gray-green bg (`--tok-field-readonly`), border `#D9E2DD`, cursor default, selectable but not focusable for editing. Warm ivory (`--tok-field-readonly-warm`) for Description blocks and resolved-indication banners. Applies to staff-detail Category/Requester/Summary/Description group and requester-detail header card.
- Invalid: `--tok-error` border + inline message + icon + `aria-invalid="true"`. Disabled: opacity 0.5, `not-allowed`, no ring, `disabled` attribute. Busy: spinner + disabled + `aria-busy="true"`.
- Internal-notes surfaces always carry the amber tint + lock icon so authorship context is unmistakable before typing.

---

## 13. Responsive rules (1280 / 800 / 375)

> Traceability (responsive): FR-06, FR-11, FR-14 | BR-19 | AC-08, AC-15.

| Viewport | Shell | Content |
|---|---|---|
| Desktop 1280px | Full navbar inline (brand + role nav + user cluster). | Queue: full 9-column table + Open column. Staff detail: 2-column header grid (read-only group left, editable group right). Admin: full 5-column table. Modals centered 560px. No horizontal scroll; table fits 100% card width. |
| Tablet 800px | Navbar inline with compact user name (truncated). | Queue: table retained with 0.75rem type and reduced padding; badges shrink; long numbers may wrap — hiding columns or scrolling horizontally is a defect. Detail header stacks to 1 column with editable group below read-only group. Filter cards become 2 columns with search spanning both. Pagination shows full window. |
| Mobile 375px | Brand + avatar + Logout icon-button; role nav collapses to horizontal scroll-free wrap or hamburger-free stacked links (all links reachable, 44px targets). | All lists become stacked cards (§6.4, §8.1). All forms single-column full-width. Filter cards single column. Pagination collapses to Prev / Page X of Y / Next. Touch targets ≥44×44px. No horizontal scroll on any screen at 320–375px, verified with overflow-x checks. |

- Global rule: no horizontal scroll at any breakpoint. Tables use fluid `table-layout: auto` with wrapping body cells; code-like strings (ticket numbers, emails) wrap with `overflow-wrap: anywhere`.
- Modal behavior mobile: full-width sheet with 16px margins, stacked fields, primary action sticky at foot.

---

## 14. Accessibility

> Traceability (accessibility, cross-cutting): FR-01, FR-04, FR-05, FR-06, FR-07, FR-11, FR-12, FR-14 | BR-14, BR-16 | AC-06, AC-12.

- Every field has a visible `<label>`; hint text linked via `aria-describedby`; errors set `aria-invalid="true"` and share the describedby chain. Required fields show a red asterisk in the label.
- Visible focus ring (`3px rgba(0,107,60,0.28)`) on all interactive elements for keyboard and pointer focus; logical tab order; skip-to-content link before navbar.
- Badges, statuses, and errors never rely on color alone — always icon/dot glyph + text label.
- Live regions: loading/saving announce via `aria-live="polite"`; success/failure banners use `role="alert"` or `role="status"`; pagination counts and character counters are live. Tab shell uses `role=tablist`/`tab`/`tabpanel` with arrow-key navigation and `aria-selected`.
- Keyboard: all controls operable by keyboard including show/hide toggles, tab switching, modal focus trap with Esc to close and focus return, card links, and pager. Contrast: body text ≥4.5:1; white on `--tok-primary` ≥4.5:1; muted text on card surfaces ≥4.5:1; badge text pairs verified at ≥4.5:1 except large/bold decorative glyphs which carry redundant text.
- Safe rendering: comment/note bodies escaped; no raw HTML injection; wrapping preserves line breaks without breaking layout.

---

## 15. Explicit exclusions (must not be rendered)

> Traceability (exclusions enforce scope): FR-01, FR-04, FR-07, FR-12 | BR-06, BR-18 | AC-01, AC-06.

- No "Forgot your password?" link on Login and no password-recovery flow anywhere.
- No "send password reset email" checkbox and no email-delivery control on Create User, Edit User, or set-initial-password sections. Initial passwords are handled by the approved local-lab behavior only.
- No Service Actions tab and no Resolution Summary field on any ticket screen (requester or staff). No Event Log tab on any ticket screen and no event-log endpoint. Tab sets are fixed: requester detail shows Public Comments and Attachments only (plus the header signal button; system activity renders only as a ticket status line when needed); staff detail shows Public Comments, Internal Notes, Attachments.
- No user deletion affordance, no bulk operations, no import/export, no multi-role assignment, no department or profile-photo management, no SLA or dashboard widgets.

---

## 16. Visual consistency checklist (definition of done for this spec)

- Shell shows authenticated name + role badge + Logout on every screen; Development Requester selector absent at all breakpoints.
- Each role sees only its permitted nav; direct access to non-permitted routes shows Forbidden or redirects to login per §2.3.
- Login and Change Password implement validation placement, busy, safe-failure, and gate behavior per §3–§4 with none of the excluded recovery controls.
- Requester My Tickets, New Ticket, Detail, and Attachments behave per §5 with Public Comments and resolved-indication additions and ownership-preserving Not Found behavior.
- Staff Queue implements the 9-column desktop table, mobile cards, search/filter/sort/pagination, and loading/empty/no-results/forbidden/failure states per §6.
- Staff Detail groups read-only versus editable fields, enforces claim/reassign confirmations, and keeps Public versus Internal threads visually distinct per §7.
- Admin Users implements the Name/Email/Role/Status/Edit table, single search + single role filter, create/edit/set-password modals, and duplicate/self/last-administrator guards per §8.
- Feedback matrix (§10), badges (§11), editable/read-only styling (§12), responsive rules without horizontal scroll (§13), and accessibility (§14) hold on desktop, tablet, and mobile for every screen in §2–§8.

---

## 17. Traceability — screen/section to FR / BR / AC

Numbering contract (frozen per `specification.md` §4/§5/§9): FR-01..FR-14, BR-01..BR-20, AC-01..AC-18. Inline tags in §2–§15 summarize the same mapping; this section is normative for UI coverage. Zen Green tokens, responsive rules (§13), feedback matrix (§10), and accessibility (§14) are preserved unchanged.

| UI section | FR | BR | AC |
|---|---|---|---|
| §2 Shell + role navigation (`#/my`, `#/staff/queue`, `#/admin/users`, `#/login`, `#/change-password`) | FR-02, FR-03, FR-13, FR-14 | BR-02, BR-08, BR-10, BR-20 | AC-02, AC-05, AC-18 |
| §3 Login (`#/login`) | FR-01 | BR-01, BR-06, BR-09, BR-16 | AC-01 |
| §4 Mandatory + voluntary password change (`#/change-password`) | FR-04 | BR-02, BR-07, BR-16 | AC-02, AC-06 |
| §5 Requester regression: New Ticket (`#/new`), My Tickets (`#/my`), Ticket Detail (`#/tickets/:number`), Public Comments, problem-appears-resolved | FR-05, FR-08, FR-10, FR-13 | BR-03, BR-04, BR-05, BR-11, BR-14, BR-17 | AC-03, AC-07, AC-12, AC-14 |
| §6 Staff queue (`#/staff/queue`): 9-column table, mobile cards, search/filter/sort/pagination | FR-06 | BR-13, BR-15, BR-19 | AC-08 |
| §7 Staff detail (`#/staff/tickets/:number`): Owner, IT Priority, Status, Public Comments, Internal Notes, Attachments | FR-07, FR-08, FR-09 | BR-04, BR-12, BR-13, BR-14, BR-15 | AC-04, AC-09, AC-10, AC-11, AC-12, AC-13 |
| §8 Admin user management (`#/admin/users`): list, create/edit/set-password modals, safety guards | FR-11, FR-12, FR-13 | BR-09, BR-10, BR-18 | AC-15, AC-16, AC-17, AC-18 |
| §9 Screen modes (create / view / edit, append-only, deactivation replaces deletion) | FR-05, FR-06, FR-07, FR-11, FR-12 | BR-14, BR-18 | AC-07, AC-12, AC-13 |
| §10 Feedback matrix (loading, saving, success, validation, empty, no-results, forbidden 403, not-found 404, conflict 409, failure 500) | FR-01, FR-04, FR-06, FR-11, FR-12 | BR-01, BR-04, BR-06, BR-09, BR-10, BR-12, BR-16, BR-18, BR-19, BR-20 | AC-01, AC-04, AC-06, AC-08, AC-09, AC-11, AC-15, AC-16, AC-17 |
| §11 Badges (8 statuses, priorities + Unset, roles) | FR-06, FR-07, FR-14 | BR-13, BR-15 | AC-08, AC-11 |
| §12 Editable vs read-only styling | FR-01, FR-04, FR-07, FR-12 | BR-07, BR-16 | AC-01, AC-06, AC-16 |
| §13 Responsive (1280 / 800 / 375, no horizontal scroll, 44px targets) | FR-06, FR-11, FR-14 | BR-19 | AC-08, AC-15 |
| §14 Accessibility (labels, focus ring, live regions, keyboard, contrast, safe rendering) | FR-01, FR-04, FR-05, FR-06, FR-07, FR-11, FR-12, FR-14 | BR-14, BR-16 | AC-06, AC-12 |
| §15 Exclusions (no recovery link, no email controls, no Service Actions / Resolution Summary, no deletion) | FR-01, FR-04, FR-07, FR-12 | BR-06, BR-18 | AC-01, AC-06 |

### 17.1 Canonical ID index (exact IDs used in this document)

- FR: FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14.
- BR: BR-01, BR-02, BR-03, BR-04, BR-05, BR-06, BR-07, BR-08, BR-09, BR-10, BR-11, BR-12, BR-13, BR-14, BR-15, BR-16, BR-17, BR-18, BR-19, BR-20.
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18.
