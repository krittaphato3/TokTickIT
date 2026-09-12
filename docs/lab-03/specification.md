# CPE 334 Lab 3 — TokTickIT Real Auth + Staff/Admin Workflows: Engineering Specification

- **Status:** Approved v1.0 — engineering contract (implements Lab_3_sheet.pdf §4)
- **Sprint:** Lab 3 — Real auth, IT Staff queue/detail, Admin user management
- **Base:** `feature/lab3-engineering-contract` from `e532be5` (issue #45)
- **Companion documents:** [`ui-spec.md`](./ui-spec.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)
- **Lab 2 baseline:** [`../lab-02/specification.md`](../lab-02/specification.md) — regression surface preserved unchanged in behavior
- **Numbering contract (frozen across Lab 3 docs):** `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-18`. The `api-spec.md`, `ui-spec.md`, and `tests.md` writers use these exact IDs. No renumbering without a contract amendment.

---

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real authentication (Requester, IT Staff, Administrator roles), deliver the IT Staff queue/detail workflow and Administrator user management with mandatory first-login password change, while preserving the full Lab 2 Requester regression surface unchanged in behavior.

## 2. Stakeholder Request Interpretation

Stakeholders want identity enforced server-side through login instead of a client-side selector. Staff triage all tickets through a shared queue with explicit ownership, priority control, and a governed status workflow. Admins manage the user lifecycle through one minimal screen with safe deactivation rather than deletion. Requesters keep every Lab 2 capability on their authenticated identity, gain a public comment thread, and can signal that a problem looks resolved without resolving it themselves. The boundary between public communication and internal staff notes is a security property, not a UI hint. All Lab 2 data survives migration and every Lab 2 flow keeps working on auth identity.

## 3. Scope

### IN SCOPE

- Real auth: login with email + password, logout, current-user retrieval, mandatory first-login password change plus voluntary change.
- Role-based app shell and navigation: Requester, IT Staff, Administrator; server-side authorization on every endpoint and screen.
- Requester regression on authenticated identity: selector removed; create, My Tickets list (search/filter/sort/pagination), read-only detail fields, attachment upload/download/soft-removal, ownership enforced from auth identity.
- Public Comments thread on tickets; Requester problem-appears-resolved indication.
- IT Staff Ticket Queue: cross-ticket search, filters, sorting, pagination with metadata.
- IT Staff Ticket Detail ops: claim/assign/reassign owner, set IT Priority, permitted status transitions with confirmations, public comments, internal notes, attachment continuity (read/download only for staff).
- Admin User Management: list with name/email search + optional role filter, create with one role + initial password, edit name/email/role/activation, set new initial password, activation control with safety guards.
- Ticket Owner zero-or-one active IT Staff/Administrator; unassigned allowed.
- 8 ticket statuses: New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled.
- Requested Priority vs IT Priority: copy-on-claim, then independently editable by staff only.
- Data migration: Development Requester rows become User rows; existing ticket ownership preserved; selector and its client state removed.
- Idempotent seed: quotas plus realistic tickets, comments, and notes with non-sensitive content.

### OUT OF SCOPE (explicitly EXCLUDED)

No implementation, endpoint, UI control, or test in Lab 3 covers the following. Any reference to them is a rejection path or a documented non-goal:

- Email invitations and email delivery of initial passwords or reset links.
- Password-reset email, reset flow, and any "Forgot your password?" link or "Send password reset email" checkbox.
- Multi-factor authentication, social login, single sign-on.
- Self-registration and Requester-created accounts.
- Actions Taken by IT Staff; Service Actions tab; Resolution Summary field.
- Formal SLA calculation, escalation rules, notification services.
- Dashboards and KPI analytics beyond simple queue counts and pagination totals.
- Multi-tenant organizations, departments, customer administration.
- Production-grade deployment and cloud infrastructure changes.
- Multiple roles assigned to one user; one user has exactly one role.
- User deletion, bulk user operations, user import or export, account-history screens, role history, account audit history.
- Department, organization, profile-photo, and other extended user-profile management.
- Account unlocking, administrator approval workflows, advanced identity-management functions.
- Advanced user-list features: mandatory pagination, multi-column sorting, multiple simultaneous filters.

## 4. Functional Requirements

- **FR-01 — Login.** An unauthenticated visitor submits email + password on the Login screen. On success the backend establishes an authenticated session (AD-01), returns the safe user identity, and redirects by role and password-change state. On failure the backend returns a safe generic error with no account-enumeration leak beyond the documented inactive-account message.
- **FR-02 — Logout.** An authenticated user invokes Logout from the app shell. The backend invalidates the server-side session, clears the session cookie, and the client redirects to Login. Direct navigation to any protected route after logout is rejected and redirected to Login.
- **FR-03 — Current user.** Any authenticated session can retrieve its own identity via `GET /api/auth/me`, returning id, name, email, role, activation state, and the `mustChangePassword` flag. Unauthenticated callers receive 401.
- **FR-04 — Mandatory password change.** A user with `mustChangePassword=true` is gated after login: all application routes and all non-auth APIs except `POST /api/auth/change-password` and `POST /api/auth/logout` return 403 with a password-change-required code until a valid new password is saved. The Change Password screen enforces the full password policy, requires confirmation match, and on success clears the flag and enters the application.
- **FR-05 — Requester regression on auth identity.** An authenticated Requester (and any authenticated user acting as requester-self per AD-03) creates tickets, lists only owned tickets with Lab 2 search/filter/sort/pagination semantics, opens read-only detail of owned tickets, and manages attachments on owned tickets. The Development Requester selector, Change Requester action, `X-Dev-Requester-Id` header, and related localStorage state are removed.
- **FR-06 — Staff queue.** An authenticated IT Staff or Administrator (read-only for Administrator per AD-02) retrieves a cross-ticket queue with search (ticket number, title, description), filters (category, requested priority, IT priority, status, owner, requester), sorting (createdAt, updatedAt, priority, number), and pagination with `meta`. Invalid query values return 400.
- **FR-07 — Staff detail ops.** IT Staff performs ticket operations on any ticket: claim self, assign/reassign to one active IT Staff/Administrator or to unassigned, set IT Priority, and apply permitted status transitions per the BR-15 matrix with required confirmations. Category, Requester, Summary, and Description stay read-only. Only Owner, IT Priority, and Status are editable.
- **FR-08 — Public comments.** Requester (on owned tickets), IT Staff, and Administrator post and read public comments. The thread is chronological, append-only, author- and timestamp-stamped by the backend, and rendered distinctly from internal content.
- **FR-09 — Internal notes.** IT Staff and Administrator post and read internal notes. Requester access to any internal-note endpoint is rejected with a masked 404 that reveals no existence or content. Notes are append-only with backend-stamped author and time.
- **FR-10 — Problem-appears-resolved indication.** A Requester on an owned ticket records a one-way "problem appears resolved" signal with an optional comment. The signal does not change status, is visible to staff as triage input, and is rate-limited to one active signal per ticket until staff changes status.
- **FR-11 — Admin user list.** An Administrator lists users showing Name, Email, Role, Status, and Edit action, with substring search on name or email and an optional single role filter. Non-administrators receive 403.
- **FR-12 — Admin user create/edit/activation/password.** An Administrator creates a user with name, email, one role, activation state, and initial password; edits name, email, role, and activation state; and sets a new initial password that forces change at next login. Duplicate email returns 409. Safety guards in BR-18 apply.
- **FR-13 — Seed and migration.** A single Prisma migration plus idempotent seed converts all Lab 2 Development Requester rows to User rows, repoints ticket ownership, adds owner/IT-priority/status/comments/notes structures, and seeds the required account quotas with realistic tickets and threads.
- **FR-14 — Role navigation and app shell.** The authenticated shell shows the current user name + role badge, exposes only permitted navigation (Requester: New Ticket, My Tickets; IT Staff: Ticket Queue + requester-self creation; Administrator: User Management + read-only queue), provides Logout and password-change entry, and never presents unauthorized destinations. Hidden controls are feedback only; enforcement is server-side.

## 5. Business Rules

- **BR-01 — Active-user auth.** Only a user with `isActive=true` and valid credentials authenticates. Unknown email or wrong password returns generic 401. Inactive credentials return 403 with the documented deactivated-account message. No credential distinction leaks beyond this rule.
- **BR-02 — mustChangePassword gate.** A session with `mustChangePassword=true` can call only `GET /api/auth/me`, `POST /api/auth/change-password`, and `POST /api/auth/logout`. Every other authenticated endpoint and every application route except Login and Change Password returns 403 `password_change_required` until the flag clears.
- **BR-03 — Auth identity determines ownership.** `requesterId` is always derived server-side from the session. Any client-supplied requester identity field is ignored. All requester-scoped reads and writes filter by the session user id before any other predicate.
- **BR-04 — Public vs internal visibility.** Public Comments are readable by the owning Requester, IT Staff, and Administrator. Internal Notes are readable only by IT Staff and Administrator. Requester calls to internal-note endpoints return masked 404 regardless of whether the ticket or note exists.
- **BR-05 — Requester-indication vs formal resolve.** The problem-appears-resolved signal is a boolean plus timestamp on the ticket, not a status value. Only IT Staff through the BR-15 matrix sets Resolved or Closed, except a Requester may transition Closed->Reopened (and Resolved->Reopened where allowed) via PATCH per BR-15; all other Requester status writes return 403/409. The `appearsResolved` signal does not change status. Staff sees the signal as "Requester indicates resolved" input to triage.
- **BR-06 — Login-attempt handling.** Failed logins return safe messages and are logged without passwords. No progressive account lockout exists in Lab 3 because account unlocking is excluded. Brute-force protection is IP rate limiting on `POST /api/auth/login` (10 attempts per minute per IP, then 429). Legitimate users are never locked by failed attempts.
- **BR-07 — Password policy and hashing.** New or changed passwords: length 8–72 characters (72 is the bcrypt input limit), must contain uppercase + lowercase + number + special character, must differ from the current password, confirmation must match exactly. Admin-set initial passwords require minimum 8 characters and set `mustChangePassword=true`; full complexity is enforced at the user-owned change. Violations return 400 with field-level `details`. Storage is bcrypt cost 12; plaintext is never stored, logged, or returned (AD-01).
- **BR-08 — Logout invalidation.** Logout deletes the server-side session row and clears the cookie with an expired `Set-Cookie`. The old session token is rejected with 401 thereafter. Logout succeeds idempotently even with an already-expired session.
- **BR-09 — Inactive-user behavior.** Inactive users cannot log in (403). An active session whose account is deactivated mid-session is rejected on the next request with 403. Inactive accounts remain in the database with their tickets, comments, and notes intact.
- **BR-10 — Duplicate email and current-user behavior.** Email uniqueness is case-insensitive and enforced at both validation and database unique-constraint layers; duplicates return 409 with field detail on `email`. `GET /api/auth/me` returns the session user or 401; it never accepts an id parameter and never returns another user.
- **BR-11 — Requester ownership.** Every Lab 2 ticket and attachment operation is scoped to the session user. Cross-owner list, detail, comment post, attachment upload/download/removal returns 403 (or masked 404 where BR-04/BR-16 requires it). Ownership checks run before existence disclosure for other owners.
- **BR-12 — Assignment (zero-or-one owner).** Each ticket has zero or one primary owner. Valid owner values: `null` (unassigned) or the id of an active user with role IT Staff or Administrator. Inactive users, Requesters, and unknown ids return 422/400 with field detail. Deactivation of an owner does not auto-reassign; the ticket keeps its owner id but queue badges render "Deactivated owner — reassign" and reassignment is required before further status progress except Cancelled.
- **BR-13 — IT Priority copy and edit rule.** `priority` (Requested Priority) is set by the Requester at creation and is immutable thereafter. `itPriority` is nullable; on first claim (transition from unassigned to assigned) the backend copies `priority` into `itPriority` when `itPriority` is still null. After that only IT Staff (Administrator is read-only per AD-02) edits `itPriority` independently. Requesters cannot set or edit either priority field after creation.
- **BR-14 — Comment and note integrity.** Both threads are append-only; edit and delete endpoints do not exist. Each entry records `authorId` and `createdAt` from the backend clock. Empty or whitespace-only bodies are rejected with 400. Length limit is 1–2000 characters. Rendering escapes HTML and linkifies only safe protocols; script content is never executed.
- **BR-15 — Eight-status transition matrix.** Required statuses with enum values: New (`NEW`), Open (`OPEN`), In Progress (`IN_PROGRESS`), Waiting for Requester (`WAITING_FOR_REQUESTER`), Resolved (`RESOLVED`), Closed (`CLOSED`), Reopened (`REOPENED`), Cancelled (`CANCELLED`). Allowed transitions:

  | From → To | Permitted roles | Confirmation required |
  |---|---|---|
  | New → Open, Cancelled | IT Staff | None for Open; confirm for Cancelled |
  | Open → In Progress, Waiting for Requester, Cancelled | IT Staff | Confirm for Cancelled |
  | In Progress → Waiting for Requester, Resolved, Cancelled | IT Staff | Confirm for Resolved and Cancelled |
  | Waiting for Requester → In Progress, Resolved, Cancelled | IT Staff | Confirm for Resolved and Cancelled |
| Resolved → Closed, Reopened | IT Staff for Close; IT Staff, plus Requester for Resolved→Reopened via PATCH (own ticket only) | Confirm for Closed; Reopened requires reason comment |
| Closed → Reopened | IT Staff, plus Requester via PATCH (own ticket only) | Requires reason comment + confirm |
  | Reopened → Open, In Progress | IT Staff | None |
  | Cancelled → Reopened | IT Staff | Requires reason comment + confirm |
  | Any → same status | — | Rejected as no-op with 400 |

  All other transitions return 409 with the allowed-target list. Requester may ONLY transition Closed->Reopened (and Resolved->Reopened where allowed) via PATCH on owned tickets; all other Requester status writes return 403/409. The `appearsResolved` signal does not change status. Every transition writes `updatedAt`, validates owner presence where required (Resolved and Closed require a non-deactivated owner), and appends an audit-visible system comment recording actor, from/to, and timestamp.
- **BR-16 — Validation, safe errors, and anti-enumeration.** Request validation failures return 400 with `details` per field. Unauthenticated returns 401. Authenticated-but-forbidden returns 403 except internal-note access for Requesters which returns masked 404. Conflicts return 409 (duplicate email, admin safety, illegal transition, owner conflict). Unexpected failures return generic 500 with no stack trace. Error envelope is `{ error: string, code?: string, details?: [{ field, message }] }`. Ticket, attachment, and note existence for unauthorized callers is never confirmed through timing or message differences beyond the specified 404 masking.
- **BR-17 — Lab 2 regression.** Requester create/list/detail/attachment semantics, Lab 2 validation limits (title 1–120, description ≤4000, 5 active attachments per ticket, 5 MB per file, MIME allowlist), search (now extended to ticket number per Lab 2 v2 FR-18), filter, sort, and pagination behavior are preserved. The only behavioral deltas are auth identity replacing the dev header and the additive display of `itPriority`, owner, and extended status.
- **BR-18 — Admin safety rules.** One role per user enforced by enum. Self-deactivation is rejected with 409. Deactivation or role-reassignment of the last active Administrator is rejected with 409 `last active Administrator`. Deactivation sets `isActive=false` and preserves all rows; deletion endpoints do not exist. Any admin-set password sets `mustChangePassword=true` and follows local-lab behavior with no email. Duplicate email returns 409.
- **BR-19 — Queue query semantics.** Queue search is trimmed case-insensitive substring (ILIKE) over ticket number, title, and description. Filters are exact matches on category, requested priority, IT priority, status, owner id (plus `unassigned` sentinel), and requester id; combined with AND. Sort keys: `createdAt`, `updatedAt`, `priority` (rank Critical > High > Medium > Low), `number`; direction `asc`/`desc`; default `createdAt desc`. Pagination: `page >= 1` default 1, `pageSize` 1–100 default 20, response includes `page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, `hasPrevPage`. Invalid query values return 400.
- **BR-20 — Server-side authorization matrix.** Every protected operation is enforced by backend middleware and service checks. The matrix below is normative; frontend hiding is not enforcement:

  | Operation | Requester | IT Staff | Administrator |
  |---|---|---|---|
  | Login, logout, me, own password change | Yes | Yes | Yes |
  | Create ticket as requester-self (AD-03) | Yes (own) | Yes (own) | Yes (own) |
  | List/detail/attachments on owned tickets | Yes (own only) | Own only as requester-self | Own only as requester-self |
  | Staff queue list, staff ticket read, public comment read | Own tickets only | Yes (all) | Yes read-only (all) |
  | Claim/assign/reassign owner, set IT priority, set status | No (403), except Closed->Reopened (and Resolved->Reopened where allowed) via PATCH on own ticket per BR-05/BR-15 | Yes | No 403 (view-only per AD-02; may view queue/detail/comments/notes) |
  | Post public comment (own ticket for Requester, any for staff) | Yes (own) | Yes | Yes |
  | Post/read internal notes | No (masked 404) | Yes | Yes |
  | Problem-appears-resolved signal | Yes (own) | No (reads signal) | No (reads signal) |
  | User list/create/edit/set-password/deactivate | No (403) | No (403) | Yes |

## 6. UI Specification Summary

Full layout, component, state, and accessibility rules live in [`ui-spec.md`](./ui-spec.md). This section summarizes the contract the UI implements:

- **App shell:** authenticated user name + role badge replacing the Development Requester display; role-filtered navigation; Logout; password-change entry; Zen Green tokens, badges for status/requested priority/IT priority/role, and read-only vs editable field styling.
- **Login:** email + password form with inline validation, busy state, safe failure message, inactive-account message, redirect on success. No password-reset link exists.
- **Mandatory password change:** first-login gate blocking all other routes; rule hints, confirmation field, validation, success continuation. Voluntary change reuses the same form with current-password verification.
- **Requester views (regression):** New Ticket, My Tickets, Ticket Detail with identical Lab 2 layout plus Public Comments thread and problem-appears-resolved control; selector removed.
- **IT Staff queue:** desktop 9-column table (Ticket Number, Created, Summary, Category, Requested Priority, IT Priority, Status, Owner, Updated) with sortable headers; mobile cards below 768px; search, filters, sort, pagination with "Showing X to Y of Z" footer; loading, empty, no-results, forbidden, and failure states; no horizontal scroll.
- **IT Staff detail:** grouped read-only ticket information; editable Owner, IT Priority, and Status controls with confirmations; visually distinct Public Comments vs Internal Notes threads; Attachments tab (existing files downloadable, no new upload from staff view); no Service Actions tab and no Resolution Summary field.
- **Admin user management:** Name/Email/Role/Status/Edit table; name/email search; single optional role filter; create/edit/set-password modals with validation; activate/deactivate with safety confirmations; forbidden and conflict feedback; no email-delivery controls.
- **Feedback and responsive:** loading, saving, success, validation, empty, no-results, forbidden (403), not-found (404), conflict (409), and safe failure (500) states with consistent copy and retry. Breakpoints desktop ≥992px, tablet 768–991px, mobile <768px with stacked cards and touch targets ≥44px. Keyboard operability, visible focus, labeled controls, and non-color-only signaling throughout.

## 7. Data Changes

Prisma + PostgreSQL evolve the Lab 2 schema without discarding ticket or attachment data. Field tables below are normative for the migration; code is the final schema.

### 7.1 User model (replaces Requester)

| Field | Type | Constraints |
|---|---|---|
| `id` | Int PK autoincrement | Preserves migrated Requester ids so existing `Ticket.requesterId` values stay valid through the repoint |
| `name` | String (1–100, trimmed) | Required |
| `email` | String (max 255, lowercased, trimmed) | Unique case-insensitive; duplicate returns 409 |
| `passwordHash` | String (60, bcrypt) | Required; never selected for API output |
| `role` | Enum `Role { REQUESTER, IT_STAFF, ADMINISTRATOR }` | Required; exactly one per user |
| `isActive` | Boolean | Default true; deactivation is soft |
| `mustChangePassword` | Boolean | Default true for migrated and admin-created rows; false after valid change |
| `createdAt` | DateTime | Default now(), UTC |
| `updatedAt` | DateTime | Auto-update on write, UTC |

Indexes: `email` unique (lower expression index); `(role, isActive)`; `(createdAt desc)`.

### 7.2 Ticket changes

| Field | Type | Constraints |
|---|---|---|
| `requesterId` | Int FK → `User.id` | Required, `onDelete: Restrict`; repointed from `Requester.id` during migration; always server-derived |
| `ownerId` | Int nullable FK → `User.id` | Null means unassigned; when set must reference active IT Staff or Administrator; `onDelete: SetNull`; index |
| `priority` | Enum `Priority` | Requested Priority, immutable after creation |
| `itPriority` | Enum `Priority` nullable | Null until first claim copies `priority`; staff-only edits after |
| `status` | Enum `Status` extended | Default `NEW`; values `NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED` |
| `appearsResolvedAt` | DateTime nullable | BR-05 signal timestamp; null when no active signal |
| `ownerName` (removed) | — | Lab 2 display column dropped in favor of `owner` relation + `owner.name` projection |

Retained: `ticketNumber` unique, title, description, `categoryId`, `relatedSystemId`, `createdAt`, `updatedAt`, existing composite index `(requesterId, createdAt desc)`. Added indexes: `(status, createdAt desc)` for queue, `(ownerId)`, `(itPriority)`, `(updatedAt desc)`. Enum migration maps legacy `PENDING` rows to `WAITING_FOR_REQUESTER` before the old value is removed.

### 7.3 Comment and note models (append-only)

| Model | Fields | Visibility |
|---|---|---|
| `PublicComment` | `id` Int PK; `ticketId` Int FK → Ticket Cascade; `authorId` Int FK → User Restrict; `body` Text 1–2000; `createdAt` DateTime default now() | Owning Requester + IT Staff + Administrator |
| `InternalNote` | Same shape as `PublicComment` on its own table | IT Staff + Administrator only; Requester gets masked 404 |

No `updatedAt`, no edit/delete columns. Indexes: `(ticketId, createdAt)`, `(authorId)`. Bodies stored raw; rendering escapes HTML.

### 7.4 Session model (AD-01)

| Field | Type | Notes |
|---|---|---|
| `id` | String (32-byte random hex, primary key) | Opaque token; stored hashed with SHA-256 |
| `userId` | Int FK → User Cascade | Session owner |
| `expiresAt` | DateTime | 24-hour sliding expiry refreshed on activity, plus 24-hour absolute lifetime |
| `absoluteExpiresAt` | DateTime | 24-hour absolute expiry from creation; session rejected after this regardless of activity |
| `createdAt` | DateTime | Default now() |
| `ipHash` | String nullable | Operational logging only |

Cookie `toktickit.sid` carries the raw token with `httpOnly`, `SameSite=Lax`, `Secure` in production; the database stores only its SHA-256 hash. Mutating requests (`POST`/`PATCH`/`DELETE`) require `X-CSRF-Token` double-submit validation.

### 7.5 Migration steps

1. Create `Role` enum, extended `Status` enum values, `User`, `PublicComment`, `InternalNote`, `Session` tables, and `Ticket.ownerId` / `appearsResolvedAt` columns in one Prisma migration.
2. Copy every `Requester` row to `User` with the same `id`, `name`, `email`, `isActive`, `createdAt`, role `REQUESTER`, a generated bcrypt hash for a documented local-lab initial password, and `mustChangePassword=true`.
3. Repoint `Ticket.requesterId` FK from `Requester` to `User`, backfill `itPriority` null and `ownerId` null, map `PENDING` to `WAITING_FOR_REQUESTER`, drop the denormalized `ownerName` column after backfill verification.
4. Drop the `Requester` table and remove all `X-Dev-Requester-Id` server handling in the same release.
5. Verify row counts (tickets, attachments unchanged), ownership joins intact, and rollback script tested on a staging copy before merge.

### 7.6 Seed quotas (idempotent upsert on `email`)

- Requester: at least 4 active + 1 inactive.
- IT Staff: at least 3 active + 1 inactive.
- Administrator: at least 1 active with documented local-lab credentials.
- Tickets: realistic volume distributed across requesters, all 8 statuses (post-migration), mixed requested/IT priorities, and mixed assigned/unassigned ownership including one ticket with a deactivated owner for badge coverage.
- Threads: example public comments and internal notes on representative tickets with no sensitive or personal content. Seeded credentials are local-development only and documented in the seed script header.

## 8. API Contract

Full paths, shapes, validation tables, and examples live in [`api-spec.md`](./api-spec.md). Summary of the normative surface:

- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` (mandatory and voluntary modes).
- Requester regression: `GET /api/tickets`, `POST /api/tickets` (AD-03 requester-self for any active role), `GET /api/tickets/:ticketNumber`, attachment endpoints — all scoped to session identity with Lab 2 semantics plus additive `itPriority`/`owner`/`status` display.
- Staff queue: `GET /api/staff/tickets` with search/filter/sort/pagination per BR-19 and uniform `meta`.
- Staff ops: `PATCH /api/staff/tickets/:ticketNumber/owner`, `/it-priority`, `/status` with matrix enforcement, confirmations reflected as explicit `confirmed: true` flags, and conflict responses.
- Comments: `GET|POST /api/tickets/:ticketNumber/comments` (public); `GET|POST /api/tickets/:ticketNumber/notes` (internal, masked 404 for requesters); problem signal `POST /api/tickets/:ticketNumber/appears-resolved`.
- Admin users: `GET /api/users?search=&role=`, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/set-initial-password` with 409 safety conflicts and no email delivery. Supersedes legacy `/api/admin/users` and `/password-change` naming.
- Ticket Detail tabs are limited to Public Comments, Internal Notes, and Attachments. No Service Actions and no Resolution Summary exist.
- Errors use the BR-16 envelope and status codes 200/201/400/401/403/404/409/422/429/500 as specified per endpoint.

## 9. Acceptance Criteria

Each criterion is Given/When/Then and machine-verifiable. Traceability to planned tests is in [`tests.md`](./tests.md). Canonical Issue mapping uses #37, #38, #39, #40, #42 only in the Issue column. #36 is history only. #43 is release re-check only (see AC-18 note).

| AC ID | Issue | Criterion |
|---|---|---|
| AC-01 | #37 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | #37 | Given a user who must change the initial password, when login succeeds, then normal application screens and non-auth APIs remain unavailable with 403 until a valid new password is saved. |
| AC-03 | #37 | Given an authenticated Requester, when the client supplies another requester identity, then the backend ignores it, applies the session identity, and never returns another requester data. |
| AC-04 | #37 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected with masked 404 and no note content or existence is exposed. |
| AC-05 | #37 | Given an authenticated session, when the user logs out, then the session is invalidated, the cookie is cleared, and subsequent protected calls and direct route access redirect to login with 401. |
| AC-06 | #37 | Given password-policy boundaries, when a change submits a short, long, weak, same-as-current, or mismatched-confirmation password, then the API returns 400 with field details; when valid, then it returns 200, clears the flag, and enters the application. |
| AC-07 | #40 | Given Lab 2 tickets and attachments, when accessed through authenticated requester-self identity, then create/list/detail/upload/download/soft-removal behave per Lab 2 with ownership enforced and the selector absent. |
| AC-08 | #38 | Given staff tickets across categories, priorities, statuses, and owners, when queue search/filter/sort/pagination queries run, then results, ordering, and `meta` match BR-19 and invalid queries return 400. |
| AC-09 | #39 | Given a ticket, when IT Staff claims, reassigns to an active staff/admin id, or clears to unassigned, then ownership updates per BR-12; when targeting an inactive, requester, or unknown id, then the call fails with 400/422 and ownership is unchanged. |
| AC-10 | #39 | Given a ticket with Requested Priority High, when first claimed with null IT Priority, then IT Priority copies High; when staff later edits IT Priority, then it changes independently while Requested Priority stays fixed; requester edits are rejected. |
| AC-11 | #39 | Given the 8-status matrix, when a permitted transition with required confirmation is submitted, then status updates with actor/timestamp recorded; when a forbidden transition or missing confirmation occurs, then the call returns 409/400 with allowed targets listed. |
| AC-12 | #39+#40 | Given ticket participants, when public comments are posted and read, then the owning requester, staff, and admin all see the chronological append-only thread and empty/oversize bodies are rejected with 400. |
| AC-13 | #39 | Given internal notes, when staff posts and reads, then both staff roles succeed; when a requester reads or posts, then the API returns masked 404 with no data leak; edit/delete paths do not exist. |
| AC-14 | #40 | Given an owned ticket, when the requester records problem-appears-resolved, then the signal timestamp is set with no status change and staff sees the indicator; formal resolve still requires a staff transition. |
| AC-15 | #42 | Given admin user management, when listing with name/email search and optional role filter, then correct subsets return; when creating with a duplicate email, then the API returns 409 and no row is created. |
| AC-16 | #42 | Given an existing user, when an admin edits name/email/role/activation or sets a new initial password, then changes persist, the target must change password at next login, and validation failures return 400 with details. |
| AC-17 | #42 | Given admin safety rules, when self-deactivation, last-admin deactivation, or last-admin role reassignment is attempted, then the API returns 409 and state is unchanged; deactivation never deletes rows; non-admin attempts return 403. |
| AC-18 | #37, #43 | Given Lab 2 data, when migration and seed run repeatedly, then quotas hold (4+1 requesters, 3+1 staff, 1 admin), ticket ownership and attachments are intact, example threads exist, and the run is idempotent. Release re-check tracked in #43. |

## 10. Definition of Done

The sprint is done when all of the following hold:

- [ ] All FR-01 through FR-14 are implemented and demonstrable end-to-end on the feature branch set.
- [ ] All AC-01 through AC-18 pass; every AC maps to at least one passing automated test in `tests.md`.
- [ ] Server builds (`server` typecheck + build) and client builds (`client` build) complete without errors; lint is clean.
- [ ] Planned suites are green: server unit + API, client component, E2E, authorization/security, migration/regression, responsive and accessibility checks.
- [ ] Lab 2 regression suite passes unchanged in behavior except auth identity replacing the dev header.
- [ ] Seed and migration verified idempotent with required quotas; row-count and ownership-join checks recorded.
- [ ] Authorization matrix verified by direct API tests: hidden controls plus forced-call coverage for 401/403/masked-404/409 paths.
- [ ] Password policy, session handling, and safe-error behavior verified including 400/401/403/404/409/429/500 paths.
- [ ] Reviewer record completed with PR links, comments, responses, and approvals.
- [ ] All four Lab 3 documents reflect final behavior with no open items.

## 11. Assumptions and Decisions

| ID | Decision | Rationale | Status |
|---|---|---|---|
| AD-01 | Session authentication with opaque token in cookie `toktickit.sid` (`httpOnly`, `SameSite=Lax`, `Secure` in production); server-side `Session` table; 24-hour sliding expiry refreshed on activity plus 24-hour absolute lifetime; `X-CSRF-Token` double-submit on `POST`/`PATCH`/`DELETE`; bcrypt cost 12 for passwords. JWT in localStorage rejected. | `httpOnly` blocks JavaScript theft via XSS; `SameSite=Lax` plus `X-CSRF-Token` double-submit gives CSRF protection on all mutating requests; server-side sessions allow immediate logout invalidation and mid-session deactivation enforcement, which stateless JWT cannot do without a denylist. Bcrypt 12 balances local test speed with production hash strength on this stack. Secrets live in environment variables, never in code. | Accepted |
| AD-02 | Administrator and IT Staff ticket duties stay separate. Administrator ticket writes = No 403 (view-only; may view queue/detail/comments/notes). All staff ticket mutations (owner, IT priority, status) require IT Staff and return 403 for Administrator. | The stakeholder sheet keeps the duties conceptually separate and states an Administrator does not automatically perform staff operations. Separate duties reduce accidental public disclosure, keep the authorization matrix testable, and match the minimalist admin screen. The `ownerId` FK still permits Administrator ids for future flexibility, but Lab 3 policy rejects Administrator as the actor on staff write endpoints. | Accepted |
| AD-03 | Any active authenticated user (including IT Staff and Administrator) may `POST /api/tickets` as requester-self; `requesterId` is always server-derived; no separate staff ticket-creation endpoint exists. | Staff members also experience outages and file requests as requesters; a single creation path keeps ownership semantics uniform, avoids endpoint duplication, and appears explicitly in the BR-20 matrix and API authorization tables. | Accepted |
| AD-04 | `PENDING` maps to `WAITING_FOR_REQUESTER` during enum migration; no dual status columns. | One status axis keeps filtering, badges, and the transition matrix coherent and avoids a parallel-field migration with backfill risk. | Accepted |
| AD-05 | Denormalized Lab 2 `ownerName` column is removed in favor of the `owner` relation. | A relation guarantees name freshness, enforces FK integrity for the zero-or-one rule, and removes sync bugs between a string column and the user table. | Accepted |
