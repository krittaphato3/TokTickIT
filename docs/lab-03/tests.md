# CPE 334 Lab 3 — Test Plan and Traceability Matrix

- **Status:** Approved plan v1.0
- **Parent:** [`specification.md`](./specification.md)
- **Companions:** [`api-spec.md`](./api-spec.md), [`ui-spec.md`](./ui-spec.md)
- **Source:** `Lab_3_sheet.pdf` §10 (Test DD and TDD deliverable), §12 (required repository increment)
- **Plan policy:** Plan written before implementation. `Final` column records planned outcome `Pass-planned` for every row prior to execution. Auth-foundation rows implemented in `server/tests/lab-03/auth.api.test.ts` (T-AUTH-01..05, T-PWD-01, T-SESS-01, T-GATE-01, T-MIG-01), the forgot-password rows (T-FORGOT-01/02), and the auth responsive matrix (T-UX-01) record `Implemented` below. Requester-regression rows (issue #41) are implemented in `server/tests/lab-03/authorization.api.test.ts` (T-AUTHZ-02, T-AUTHZ-03, T-AUTHZ-05, T-REQ-01, T-STAT-04, T-MIG-02), `server/tests/lab-03/comments-notes.api.test.ts` (T-COMM-01..04, T-STAT-03) and `client/tests/lab-03/RequesterTicketDetail.test.tsx` (T-REQ-02, T-COMM-05 client half, T-STAT-03 client half). Admin user-management rows (T-ADM-01..06, T-AUTHZ-04, T-PWD-02) are implemented in `server/tests/lab-03/users-admin.api.test.ts` (29 tests — includes server-side pagination and invalid-page validation cases added with the stakeholder-requested pagination) and `client/tests/lab-03/UserManagement.test.tsx` (19 tests — includes page navigation/range captions and toast notifications added with the UI overhaul; the KPI-strip cases were removed when the stakeholder reverted that piece); remaining rows landed with the staff/admin issues and the E2E rows with the e2e issue — final statuses in §6.
- **Numbering contract:** `FR-01..FR-14`, `BR-01..BR-20`, `AC-01..AC-18` exactly per `specification.md` §9 (canonical). No renumbering.

---

## 1. Acceptance Criteria (AC-01..AC-18)

Verbatim from `specification.md` §9. FR/BR column matches the canonical requirement numbers.

| AC ID | Issue | FR / BR | Statement |
|-------|-------|---------|-----------|
| AC-01 | #37 | FR-01 / BR-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | #37 | FR-04 / BR-02 | Given a user who must change the initial password, when login succeeds, then normal application screens and non-auth APIs remain unavailable with 403 until a valid new password is saved. |
| AC-03 | #37 | FR-05 / BR-03 | Given an authenticated Requester, when the client supplies another requester identity, then the backend ignores it, applies the session identity, and never returns another requester data. |
| AC-04 | #37 | FR-09 / BR-04 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected with masked 404 and no note content or existence is exposed. |
| AC-05 | #37 | FR-02 / BR-08 | Given an authenticated session, when the user logs out, then the session is invalidated, the cookie is cleared, and subsequent protected calls and direct route access redirect to login with 401. |
| AC-06 | #37 | FR-04 / BR-07 | Given password-policy boundaries, when a change submits a short, long, weak, same-as-current, or mismatched-confirmation password, then the API returns 400 with field details; when valid, then it returns 200, clears the flag, and enters the application. |
| AC-07 | #40 | FR-05 / BR-03, BR-11, BR-17 | Given Lab 2 tickets and attachments, when accessed through authenticated requester-self identity, then create/list/detail/upload/download/soft-removal behave per Lab 2 with ownership enforced and the selector absent. |
| AC-08 | #38 | FR-06 / BR-19 | Given staff tickets across categories, priorities, statuses, and owners, when queue search/filter/sort/pagination queries run, then results, ordering, and `meta` match BR-19 and invalid queries return 400. |
| AC-09 | #39 | FR-07 / BR-12 | Given a ticket, when IT Staff claims, reassigns to an active staff/admin id, or clears to unassigned, then ownership updates per BR-12; when targeting an inactive, requester, or unknown id, then the call fails with 400/422 and ownership is unchanged. |
| AC-10 | #39 | FR-07 / BR-13 | Given a ticket with Requested Priority High, when first claimed with null IT Priority, then IT Priority copies High; when staff later edits IT Priority, then it changes independently while Requested Priority stays fixed; requester edits are rejected. |
| AC-11 | #39 | FR-07 / BR-15 | Given the 8-status matrix, when a permitted transition with required confirmation is submitted, then status updates with actor/timestamp recorded; when a forbidden transition or missing confirmation occurs, then the call returns 409/400 with allowed targets listed. |
| AC-12 | #39, #40 | FR-08 / BR-04, BR-14 | Given ticket participants, when public comments are posted and read, then the owning requester, staff, and admin all see the chronological append-only thread and empty/oversize bodies are rejected with 400. |
| AC-13 | #39 | FR-09 / BR-04, BR-14 | Given internal notes, when staff posts and reads, then both staff roles succeed; when a requester reads or posts, then the API returns masked 404 with no data leak; edit/delete paths do not exist. |
| AC-14 | #40 | FR-10 / BR-05 | Given an owned ticket, when the requester records problem-appears-resolved, then the signal timestamp is set with no status change and staff sees the indicator; formal resolve still requires a staff transition. |
| AC-15 | #42 | FR-11, FR-12 / BR-10 | Given admin user management, when listing with name/email search and optional role filter, then correct subsets return; when creating with a duplicate email, then the API returns 409 and no row is created. |
| AC-16 | #42 | FR-12 / BR-07, BR-10 | Given an existing user, when an admin edits name/email/role/activation or sets a new initial password, then changes persist, the target must change password at next login, and validation failures return 400 with details. |
| AC-17 | #42 | FR-12 / BR-18 | Given admin safety rules, when self-deactivation, last-admin deactivation, or last-admin role reassignment is attempted, then the API returns 409 and state is unchanged; deactivation never deletes rows; non-admin attempts return 403. |
| AC-18 | #37, #43 | FR-13 / BR-17 | Given Lab 2 data, when migration and seed run repeatedly, then quotas hold (4+1 requesters, 3+1 staff, 1 admin), ticket ownership and attachments are intact, example threads exist, and the run is idempotent. |

---

## 2. Traceability Matrix

| TestID | Type | Requirement/AC | What | Expected | Automated File | Final |
|--------|------|----------------|------|----------|----------------|-------|
| T-AUTH-01 | API | FR-01, BR-01 / AC-01 | Valid login for each role (Requester, IT Staff, Administrator) | 200 with safe user identity, role, and `mustChangePassword` flag; session established | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-AUTH-02 | API | FR-01, BR-01, BR-06, BR-16 / AC-01 | Invalid login: unknown email, wrong password; brute-force rate limit | 401 generic safe error; no session; no account-existence signal; 11th login attempt per minute per IP returns 429 | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-AUTH-03 | API | FR-01, BR-01, BR-09, BR-16 / AC-01 | Inactive Requester and inactive IT Staff login attempt | 403 deactivated-account message; no session established | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-AUTH-04 | API | FR-03, BR-10 / AC-01 | Current-user retrieval with valid session | 200 with id, name, email, role, activation state, `mustChangePassword`; never accepts id param | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-AUTH-05 | API | FR-03, BR-16 / AC-05 | Current-user retrieval without session | 401; no identity leaked | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-AUTH-06 | component | FR-01, FR-04, BR-01, BR-02 / AC-01, AC-02 | Login screen: validation, busy state, safe failure message, redirect on success (including mustChange redirect); no forgot-password link present | Inline validation shown; busy indicator during submit; safe error on failure; redirect on success; mustChange accounts land on Change Password; no reset link rendered | `e2e/lab-03/authentication.spec.ts` (no dedicated component file; login screen behaviors asserted at E2E level) | Implemented |
| T-PWD-01 | API | FR-04, BR-07 / AC-06 | Password-change boundary matrix: 7 chars, 73 chars, missing uppercase, missing lowercase, missing number, missing special, same-as-current, confirmation mismatch | Each violation returns 400 with field details; compliant change returns 200 and clears `mustChangePassword` | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-PWD-02 | API | FR-12, BR-07 / AC-06, AC-16 | Admin-set initial password: 7 chars rejected; 8-char value accepted and forces `mustChangePassword` | Short value 400; valid value 200 with flag set; full complexity enforced at user first-login change | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (reset 200 rotates the bcrypt hash and sets `mustChangePassword:true`; old password stops authenticating; new initial password logs in but every normal API stays gated `password_change_required` until the user's own change clears the flag; 7-char and 73-char resets → 400; admin self-reset allowed; unknown id → 404) |
| T-PWD-03 | component | FR-04, BR-07, BR-02 / AC-02, AC-06 | ChangePassword screen: rule hints, confirmation check, validation placement, success continuation | Rule hints visible; mismatch blocked client-side with message; success continues into application | `client/tests/lab-03/ChangePassword.test.tsx` (forced-first gate + voluntary mode; full rule matrix in the auth e2e) | Implemented |
| T-SESS-01 | API | FR-02, BR-08 / AC-05 | Logout invalidates session | Logout returns 200 with expired `Set-Cookie`; subsequent `GET /api/auth/me` returns 401; idempotent on expired session | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-FORGOT-01 | API | FR-04, BR-07, BR-16 / AC-06 | Credential-verified forgot-password reset (AD-04): success revokes old sessions; unknown email / wrong current password / inactive account share one safe 401; weak or same-as-current new password rejected; reachable through the mustChangePassword gate | 200 `{changed:true}` clears flag and kills prior sessions; all failure modes return identical `{"error":"Unable to update password with the details provided."}` with no session; weak values 400 with field details | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-FORGOT-02 | component | FR-04, BR-16 / AC-06 | ForgotPassword screen: validation, safe no-leak failure, success round-trip, no-email notice, back link | Inline validation on empty submit without an API call; failure shows safe banner without echoing server identity text; success posts correct payload and returns to sign in; info note confirms no reset email is sent | `client/tests/lab-03/ForgotPassword.test.tsx` | Implemented |
| T-SESS-02 | E2E | FR-02, FR-03, BR-08 / AC-05 | Logout in browser then direct navigation to protected route | Redirect to login; protected screen content never rendered | `e2e/lab-03/authentication.spec.ts` | Implemented |
| T-GATE-01 | API | FR-04, BR-02 / AC-02 | `mustChangePassword` gate on normal APIs (tickets, queue, admin) | All gated calls return 403 `password_change_required` until password saved; `GET /api/auth/me`, password-change, logout still allowed | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-GATE-02 | E2E | FR-04, BR-02 / AC-02 | Initial-password login flow in browser | Login lands on change-password screen; app routes stay blocked until valid change; then app opens | `e2e/lab-03/authentication.spec.ts` | Implemented |
| T-NAV-01 | component | FR-14, BR-20 / AC-01 | App shell role navigation: Requester, IT Staff, Administrator views | Each role sees only permitted destinations plus name, role badge, logout | `client/tests/lab-03/ProfileDropdown.test.tsx` (menu identity, role badge, Sign out) + shell routing per role in T-NAV-02 | Implemented |
| T-NAV-02 | E2E | FR-14, BR-20 / AC-01 | Role navigation smoke across three seeded accounts | Unauthorized destination access denied server-side; nav matches role | `e2e/lab-03/authentication.spec.ts` | Implemented |
| T-AUTHZ-01 | security | FR-09, BR-04, BR-16 / AC-04 | Requester direct call to Internal Notes list and create | Masked 404 for list and create; response carries no note content or existence signal | `server/tests/lab-03/authorization.api.test.ts` | Implemented (masked 404 on list + create, byte-identical to an absent ticket; also swept in the consolidated non-permitted-route matrix in `staff-ticket-detail.api.test.ts`: requester 403 on every staff route except notes → masked 404, admin 403 on owner/priority/status writes, no-session 401 on every staff route with no ticket-number leak) |
| T-AUTHZ-02 | security | FR-05, BR-11, BR-16 / AC-07 | Cross-owner ticket detail and attachment access by another Requester | Masked 404; no existence or ownership detail leaked | `server/tests/lab-03/authorization.api.test.ts` | Implemented |
| T-AUTHZ-03 | security | FR-06, BR-20 / AC-08 | Requester direct call to staff queue endpoint | 403; no ticket rows returned | `server/tests/lab-03/authorization.api.test.ts` | Implemented* |
| T-AUTHZ-04 | security | FR-11, FR-12, BR-20 / AC-17 | Non-Administrator (Requester and IT Staff) direct calls to admin user endpoints | 403 on list, create, patch, set-password; no user data returned | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (no-session 401 on all four endpoints; REQUESTER and IT_STAFF 403 `Administrator access required` with no data and no rows created by forbidden POSTs; gated admin session 403 `password_change_required`) |
| T-AUTHZ-05 | security | FR-05, BR-03 / AC-03 | Client-supplied `requesterId` on ticket create and list is ignored | Created ticket owned by auth identity; list returns only owned tickets | `server/tests/lab-03/authorization.api.test.ts` | Implemented |
| T-REQ-01 | API | FR-05, BR-03, BR-11, BR-17 / AC-07 | Lab 2 Requester regression under auth identity: create, list, detail, attachments | Responses match Lab 2 semantics; ownership derived from auth identity | `server/tests/lab-03/authorization.api.test.ts` | Implemented |
| T-REQ-02 | component | FR-05, BR-03 / AC-03, AC-07 | Development Requester selector and Change Requester action absent | Selector element absent from rendered output; auth user shown instead | `client/tests/lab-03/RequesterTicketDetail.test.tsx` (planned: `client/tests/lab-03/StaffTicketDetail.test.tsx`) | Implemented |
| T-QUEUE-01 | API | FR-06, BR-19 / AC-08 | Queue search by title/description and ticket number | 200 with matching rows and correct `meta` | `server/tests/lab-03/staff-queue.api.test.ts` | Implemented (40 tests passing: title/number/description search, wildcard escaping, blank `q`) |
| T-QUEUE-02 | API | FR-06, BR-19 / AC-08 | Queue filters: status, category, Requested Priority, IT Priority, owner (assigned/unassigned), requester | 200 with exactly the filtered set and correct counts | `server/tests/lab-03/staff-queue.api.test.ts` | Implemented (status/reqPriority/itPriority/categoryId/ownerId/assigned AND-combine; `ownerId`+`assigned=false` → 400; unknown `ownerId` → 400; IT-priority filter never falls back to requested) |
| T-QUEUE-03 | API | FR-06, BR-19 / AC-08 | Queue sorting and pagination: sort fields, default ordering, page/pageSize, meta totals | Ordered rows; `Showing X to Y of Z` computable from `meta`; out-of-range page returns empty rows with intact `meta` | `server/tests/lab-03/staff-queue.api.test.ts` | Implemented (default `createdAt desc`; `number` asc/desc; `priority` effective-rank with tie-breaks; page slicing + out-of-range empty page with intact `meta`; defaults 1/20) |
| T-QUEUE-04 | API | FR-06, BR-19, BR-16 / AC-08 | Queue invalid query parameters (bad sort key, bad page, bad pageSize) | 400 with field details; no partial data returned | `server/tests/lab-03/staff-queue.api.test.ts` | Implemented (13 invalid-param cases incl. `sort=owner`, `status=PENDING`, `assigned=maybe`, `pageSize=101`; each 400 names the field and returns no data) |
| T-QUEUE-05 | component | FR-06, BR-19 / AC-08 | StaffTicketQueue screen: search, filters, sort, pagination, open-detail action, loading/empty/no-results/forbidden/failure states | Controls drive queries; footer shows counts; each feedback state renders with retry where meaningful | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Implemented (14 tests passing: gate + forbidden render, 10-column table order, badge states, `aria-sort` cycling, debounce + AND-combined params, Owner→`assigned=false` mapping, Clear Filters, pagination bounds, Open navigation, skeleton/empty/no-results/failure+retry) |
| T-AUTHZ-02* | security | FR-06, BR-20 / AC-08 | Queue access matrix: unauthenticated 401; REQUESTER 403 with no data; IT_STAFF 200; ADMINISTRATOR 200 (view-only, read allowed per AD-02); inactive/garbage session 401 | Matches §12 of api-spec; no ticket rows in any error body | `server/tests/lab-03/staff-queue.api.test.ts` | Implemented |
| T-OWN-01 | API | FR-07, BR-12 / AC-09 | Claim unassigned ticket; reassign between active IT Staff/Administrator; clear to unassigned | Owner set or cleared as requested; 200 with updated owner; first claim copies priority per BR-13 when `itPriority` null | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (claim 200 + ownerName persisted; reassign; unassign null; copy-on-claim `itPriorityCopied: true`; no-copy on reassign with existing IT Priority; CSRF enforced globally; combined ops pass — claim + immediate priority edit + reopen status in one session — asserts all three writes persist together) |
| T-OWN-02 | API | FR-07, BR-12, BR-16 / AC-09 | Assign inactive user, Requester-role user, or unknown user as owner | 400/422 with field details; owner unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (requester/inactive → 409 `Owner must be an active IT Staff or Administrator` with owner unchanged; unknown id → 404 `User not found`; missing/non-integer → 400 details; ADMIN + REQUESTER writes → 403) |
| T-PRIO-01 | API | FR-07, BR-13 / AC-10 | IT Priority copies Requested Priority on first claim | After claim with null IT Priority, IT Priority equals Requested Priority | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (HIGH copy-on-claim asserted via response `itPriority` + `itPriorityCopied`) |
| T-PRIO-02 | API | FR-07, BR-13, BR-20 / AC-10 | IT Priority independent edit by IT Staff only; Requester and Administrator attempts denied | IT Staff edit returns 200; Requester and Administrator edits return 403; Requested Priority unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (staff 200 with `priority` untouched; admin 403 view-only AD-02; requester 403; invalid/null values 400 details) |
| T-STAT-01 | API | FR-07, BR-15 / AC-11 | Permitted status transitions across the 8-status matrix for IT Staff with required confirmations | Each allowed transition returns 200 with new status, actor/timestamp recorded | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (all 17 legal matrix transitions incl. confirmations + reopen reasons; each asserts persisted status + audit system comment; reopen-with-reason positive case asserted from every reopen-capable source: RESOLVED, CLOSED, CANCELLED) |
| T-STAT-02 | API | FR-07, BR-15, BR-16 / AC-11 | Illegal status transitions and missing confirmations | 409 with allowed-target list (or 400 for missing confirmation/no-op); status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (NEW→RESOLVED 409 naming allowed targets; WAITING→CLOSED skip 409; same-status no-op 400; missing confirm 400 `details.confirm`; missing reopen reason 400 `details.reason`; reopen-without-reason refused from every reopen-capable source — RESOLVED, CLOSED, CANCELLED — incl. whitespace-only reason, nothing written) |
| T-STAT-03 | API | FR-10, BR-05 / AC-14 | Requester problem-appears-resolved indication | 200 indication recorded with timestamp; ticket status unchanged (no formal Resolved/Closed); rate-limited to one active signal | `server/tests/lab-03/comments-notes.api.test.ts` (API) + `client/tests/lab-03/RequesterTicketDetail.test.tsx` (client) | Implemented |
| T-STAT-04 | API | FR-07, FR-10, BR-05, BR-15, BR-20 / AC-11, AC-14 | Requester direct attempt to set Resolved or Closed | 403; status unchanged; only BR-05 signal path allowed | `server/tests/lab-03/authorization.api.test.ts` | Implemented |
| T-DETAIL-01 | style | FR-07, BR-12, BR-13, BR-15 / AC-09, AC-10, AC-11 | StaffTicketDetail screen: editable Owner/IT Priority/Status only; Category/Requester/Summary/Description read-only; distinct public/internal thread styling | Read-only fields not editable; ops dispatch correctly; threads visually distinct | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Implemented (18 tests passing: grouped read-only vs editable fields; Save/Discard dirty-bar; owner PATCH dispatch; copy-on-claim caption; appears-resolved indication not formal resolution; 3-tab shell with hidden internal content; amber internal styling classes; public alias + note POST dispatch; empty-composer disable; attachment viewer with download and no upload; permitted-status-only options; confirm modal PATCH `confirm:true`; reopen reason PATCH; ADMIN view-only disabled controls + no composers; requester route refusal) |
| T-COMM-01 | API | FR-08, BR-04, BR-14 / AC-12 | Public comment list visibility for Requester (own ticket), IT Staff, Administrator | 200 with chronological public thread for each permitted caller | `server/tests/lab-03/comments-notes.api.test.ts` | Implemented |
| T-COMM-02 | API | FR-09, BR-04, BR-14, BR-16 / AC-13 | Internal note list visibility: IT Staff/Administrator succeed; Requester denied without leak | Staff calls 200; Requester list/create returns masked 404 with no note content | `server/tests/lab-03/comments-notes.api.test.ts` + `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (staff post/list 201/200; requester list/create masked 404 byte-identical to an absent ticket, no `notes`/`data` key, no "internal" string in the body) |
| T-COMM-03 | API | FR-08, FR-09, BR-14 / AC-12, AC-13 | Append-only: edit/delete attempts on comments and notes | 404/405; original entry unchanged | `server/tests/lab-03/comments-notes.api.test.ts` + `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (comments + notes PATCH/DELETE absent → 404/405, thread unchanged) |
| T-COMM-04 | API | FR-08, FR-09, BR-14 / AC-12, AC-13 | Empty, whitespace-only, and over-length (2001 chars) comment/note bodies | 400 with field details in each case | `server/tests/lab-03/comments-notes.api.test.ts` + `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Implemented (comments + notes: empty/whitespace/non-string → 400 `details.field = body`; 2001 chars → 400; trimmed 2000 accepted) |
| T-COMM-05 | style | FR-08, FR-09, BR-04, BR-14 / AC-12, AC-13 | Comment/note threads render safely (escaped markup), show author and time, and keep public/internal styling distinct | Markup shown as text; author and timestamp shown; styles differ | `client/tests/lab-03/RequesterTicketDetail.test.tsx` (requester half) + `client/tests/lab-03/StaffTicketDetail.test.tsx` (staff half) | Implemented (staff half: tab panels keep public/internal content separated; `std-tab-internal`/`std-internal-warning`/`std-note` amber classes asserted distinct from the white public panel) |
| T-ADM-01 | API | FR-11, BR-10 / AC-15 | Admin user list with search by name/email | 200 with exactly matching users | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (id-ascending paginated list with `{data, meta:{totalItems, page, pageSize, totalPages, counts}}`, no `passwordHash` in any row; case-insensitive substring search over name AND email; blank search = no filter; page ≥ 1 and pageSize 5–100 validated with 400) |
| T-ADM-02 | API | FR-11 / AC-15 | Admin user list with role filter | 200 with only the requested role returned | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (REQUESTER/IT_STAFF/ADMIN each return only that role; `role=SUPERUSER` → 400 details on `role`; search+role AND-combine, the only supported filter pair) |
| T-ADM-03 | API | FR-12, BR-10, BR-16 / AC-15 | Admin create user; duplicate email rejected; invalid role rejected | Create 201; duplicate 409 with field detail; invalid role 400 | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (201 with `mustChangePassword:true`, email stored lowercase, bcrypt-verified hash and no hash in the response; case-insensitive duplicate → 409 `Email already exists` with row count still 1; `role=SUPERADMIN` → 400; 7-char initial password → 400, complexity-relaxed 12-char value → 201 per §1.3) |
| T-ADM-04 | API | FR-12, BR-09, BR-10 / AC-16 | Admin edit name/email/role/activation; deactivation preserves record | Patch 200; deactivated user retained with inactive status | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (name/email/role patch 200; deactivate → row retained, login 403 inactive; reactivate → login 200; duplicate email excluding self → 409, unchanged own email → 200; unknown/malformed id → 404 `User not found`; empty patch → 400 `details.body`) |
| T-ADM-05 | API | FR-12, BR-18 / AC-17 | Self-deactivation, last-active-Administrator deactivation, and last-active-Administrator role reassignment | Each returns 409 with safety message; admin set unchanged | `server/tests/lab-03/users-admin.api.test.ts` | Implemented (self-deactivation 409 over the API with row unchanged; last-admin deactivation 409 proven at the service layer with a distinct actor id — see api-spec §9 reachability note; last-admin role reassign 409 over the API with role unchanged; second-admin deactivate/reactivate 200; `DELETE /api/users/:id` absent → 404/405) |
| T-ADM-06 | component | FR-11, FR-12, BR-10, BR-18 / AC-15, AC-16, AC-17 | UserManagement screen: Name/Email/Role/Status/Edit table, search, role filter, create/edit/set-password flows, validation/success/forbidden/failure feedback | Table and controls behave per spec; safety conflicts surface 409 copy | `client/tests/lab-03/UserManagement.test.tsx` | Implemented (16 tests: shell Forbidden for requester; column order + badges; debounced `search` param; role param send/clear; no-results vs empty-system states; failure + Try again recovery; create success + blocked invalid submit with no request + 409 inline email error keeping the modal open; edit success; self-toggle blocked client-side; server 409 → amber conflict banner; 500 → failure banner with input preserved; set-password success + short-password client block with no request) |
| T-MIG-01 | migration | FR-13 / AC-18 | Seed idempotency with required quotas (4 active + 1 inactive Requester, 3 active + 1 inactive IT Staff, 1 active Administrator, distributed tickets, sample threads) | Repeated runs return same counts; no duplicates; quotas satisfied | `server/tests/lab-03/auth.api.test.ts` | Implemented |
| T-MIG-02 | migration | FR-13, BR-03, BR-11 / AC-18 | Development Requester to User migration preserves ticket ownership and attachments | Every migrated ticket resolves to the matching real User owner; attachment counts unchanged | `server/tests/lab-03/authorization.api.test.ts` | Implemented* (id-mirror + scope assertions; full repoint with migration issue) |
| T-UX-01 | responsive | UI §8 / AC-18 | Responsive layout across the auth breakpoint matrix (320/375/768/1024/1440 + landscape phone): no horizontal overflow, ≥44px touch targets, 16px input font on mobile, card accent rendered, footer never overlapping, scrollable rules card on ≤375px; change-password gate card centered at ≥1024px; staff/admin surfaces follow in their own issues | All width checks pass for Login, Reset Password and Change Password screens | `e2e/lab-03/auth-responsive.spec.ts` (13 tests incl. gate-card centering at 1024/1440 after the left-hug regression fix; `client/tests/lab-03/StaffTicketQueue.test.tsx` owns queue/User Management checks) | Implemented (queue half: <768px cards with 44px Open button in StaffTicketQueue tests; auth matrix in `auth-responsive.spec.ts`; all-screens no-horizontal-overflow probe across login / change-password-gate / my-tickets / create / requester detail / queue / staff detail / admin at 1440/834/375 in `artifacts/lab-03/screenshots/visual-probe.json`) |
| T-UX-02 | style | UI §9 / AC-18 | Visual feedback states: loading, saving, success, validation, empty, no-results, forbidden, not-found, conflict, safe 500 failure | Each state renders consistent copy with retry where meaningful | `client/tests/lab-03/UserManagement.test.tsx` | Implemented for the admin surface (skeleton loading, Saving… busy buttons, success banners, inline validation, empty vs no-results distinction, Forbidden gate, conflict banner, failure banner + Try again; other surfaces landed with their own issues) |
| T-UX-03 | unit | UI §8-9 / AC-18 | Keyboard focus order and visible focus on interactive controls | Tab order matches visual order; focus ring visible; actions operable by keyboard | `client/tests/lab-03/ProfileDropdown.test.tsx` (Escape + focus return) + green `:focus-visible` ring tokens (`zen-green.css`) + auth touch-target matrix (`auth-responsive.spec.ts`) | Implemented |
| T-E2E-01 | E2E | FR-01, FR-02, FR-03, FR-04, BR-01, BR-02, BR-07, BR-08 / AC-01, AC-02, AC-05, AC-06 | Authentication journey: valid/invalid login, inactive handling, first-password change, forgot-password reset, logout | Each step matches expected screen and API behavior | `e2e/lab-03/authentication.spec.ts` | Implemented (8 tests, real UI + seeded DB) |
| T-E2E-02 | E2E | FR-06, FR-07, FR-08, FR-09, FR-10, BR-05, BR-12, BR-13, BR-15, BR-19 / AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14 | Staff ticket journey: queue search/filter/sort/paginate, open detail, claim, priority, status, public comment, internal note, appears-resolved signal | End-to-end workflow completes with persisted changes | `e2e/lab-03/staff-ticket-flow.spec.ts` | Implemented (6 tests, real UI + seeded DB) |
| T-E2E-03 | E2E | FR-11, FR-12, BR-10, BR-18, BR-20 / AC-15, AC-16, AC-17 | User administration journey: list, search, role filter, create, duplicate 409, edit, set initial password with forced change, self-guard and last-admin guards, non-admin forbidden | Each admin behavior observed in the running application | `e2e/lab-03/user-administration.spec.ts` | Implemented (5 tests, real UI + seeded DB) |

---

## 3. AC Coverage Check

| AC ID | Covering TestIDs | Count |
|-------|------------------|-------|
| AC-01 | T-AUTH-01, T-AUTH-02, T-AUTH-03, T-AUTH-04, T-AUTH-06, T-NAV-01, T-NAV-02, T-E2E-01 | 8 |
| AC-02 | T-AUTH-06, T-PWD-03, T-GATE-01, T-GATE-02, T-E2E-01 | 5 |
| AC-03 | T-AUTHZ-05, T-REQ-01, T-REQ-02 | 3 |
| AC-04 | T-AUTHZ-01 | 1 |
| AC-05 | T-AUTH-05, T-SESS-01, T-SESS-02, T-E2E-01 | 4 |
| AC-06 | T-PWD-01, T-PWD-02, T-PWD-03, T-FORGOT-01, T-FORGOT-02, T-E2E-01 | 6 |
| AC-07 | T-AUTHZ-02, T-REQ-01, T-REQ-02 | 3 |
| AC-08 | T-AUTHZ-03, T-QUEUE-01, T-QUEUE-02, T-QUEUE-03, T-QUEUE-04, T-QUEUE-05, T-E2E-02 | 7 |
| AC-09 | T-OWN-01, T-OWN-02, T-DETAIL-01, T-E2E-02 | 4 |
| AC-10 | T-PRIO-01, T-PRIO-02, T-DETAIL-01, T-E2E-02 | 4 |
| AC-11 | T-STAT-01, T-STAT-02, T-STAT-04, T-DETAIL-01, T-E2E-02 | 5 |
| AC-12 | T-COMM-01, T-COMM-03, T-COMM-04, T-COMM-05, T-E2E-02 | 5 |
| AC-13 | T-COMM-02, T-COMM-03, T-COMM-04, T-COMM-05, T-E2E-02 | 5 |
| AC-14 | T-STAT-03, T-STAT-04, T-E2E-02 | 3 |
| AC-15 | T-ADM-01, T-ADM-02, T-ADM-03, T-ADM-06, T-E2E-03 | 5 |
| AC-16 | T-PWD-02, T-ADM-04, T-ADM-06, T-E2E-03 | 4 |
| AC-17 | T-AUTHZ-04, T-ADM-05, T-ADM-06, T-E2E-03 | 4 |
| AC-18 | T-MIG-01, T-MIG-02, T-UX-01, T-UX-02, T-UX-03 | 5 |

Every AC-01 through AC-18 maps to at least one planned test. Total planned rows: 57.

`Implemented*` marks rows whose endpoint counterparts ship with a later issue (staff queue/detail, internal notes); the implemented half asserts the requester-visible contract that must hold both before and after those routes exist.

FR coverage: FR-01 (T-AUTH-01/02/03/06, T-E2E-01), FR-02 (T-SESS-01/02, T-E2E-01), FR-03 (T-AUTH-04/05, T-SESS-02, T-E2E-01), FR-04 (T-PWD-01/03, T-GATE-01/02, T-AUTH-06, T-E2E-01), FR-05 (T-AUTHZ-05, T-REQ-01/02), FR-06 (T-AUTHZ-03, T-QUEUE-01..05, T-E2E-02), FR-07 (T-OWN-01/02, T-PRIO-01/02, T-STAT-01/02/04, T-DETAIL-01, T-E2E-02), FR-08 (T-COMM-01/03/04/05, T-E2E-02), FR-09 (T-AUTHZ-01, T-COMM-02/03/04/05, T-E2E-02), FR-10 (T-STAT-03/04, T-E2E-02), FR-11 (T-ADM-01/02/06, T-AUTHZ-04, T-E2E-03), FR-12 (T-PWD-02, T-ADM-03/04/05/06, T-AUTHZ-04, T-E2E-03), FR-13 (T-MIG-01/02), FR-14 (T-NAV-01/02).

BR coverage: BR-01 (T-AUTH-01/02/03/06, T-E2E-01), BR-02 (T-GATE-01/02, T-PWD-03, T-AUTH-06, T-E2E-01), BR-03 (T-AUTHZ-05, T-REQ-01/02, T-MIG-02), BR-04 (T-AUTHZ-01, T-COMM-01/02/05), BR-05 (T-STAT-03/04, T-E2E-02), BR-06 (T-AUTH-02), BR-07 (T-PWD-01/02/03, T-E2E-01), BR-08 (T-SESS-01/02, T-E2E-01), BR-09 (T-AUTH-03, T-ADM-04), BR-10 (T-AUTH-04, T-ADM-01/03/04/06, T-E2E-03), BR-11 (T-REQ-01, T-AUTHZ-02, T-MIG-02), BR-12 (T-OWN-01/02, T-DETAIL-01, T-E2E-02), BR-13 (T-PRIO-01/02, T-DETAIL-01, T-E2E-02), BR-14 (T-COMM-01/02/03/04/05), BR-15 (T-STAT-01/02/04, T-DETAIL-01, T-E2E-02), BR-16 (T-AUTH-02/03/05, T-AUTHZ-01/02, T-OWN-02, T-STAT-02, T-COMM-02, T-ADM-03, T-QUEUE-04), BR-17 (T-REQ-01, T-MIG-01/02), BR-18 (T-ADM-05/06, T-E2E-03), BR-19 (T-QUEUE-01..05, T-E2E-02), BR-20 (T-NAV-01/02, T-AUTHZ-03/04, T-PRIO-02, T-STAT-04, T-E2E-03).

---

## 4. Required File Index (§12)

Server (`server/tests/lab-03/`):

- `server/tests/lab-03/auth.api.test.ts`
- `server/tests/lab-03/authorization.api.test.ts`
- `server/tests/lab-03/staff-queue.api.test.ts`
- `server/tests/lab-03/staff-ticket-detail.api.test.ts`
- `server/tests/lab-03/comments-notes.api.test.ts`
- `server/tests/lab-03/users-admin.api.test.ts`

Client (`client/tests/lab-03/`):

- `client/tests/lab-03/Login.test.tsx`
- `client/tests/lab-03/ChangePassword.test.tsx`
- `client/tests/lab-03/StaffTicketQueue.test.tsx`
- `client/tests/lab-03/StaffTicketDetail.test.tsx`
- `client/tests/lab-03/UserManagement.test.tsx`

End-to-end (`e2e/lab-03/`):

- `e2e/lab-03/authentication.spec.ts`
- `e2e/lab-03/staff-ticket-flow.spec.ts`
- `e2e/lab-03/user-administration.spec.ts`

---

## 5. Execution Notes

- Types used: `API`, `component`, `style`, `unit`, `responsive`, `security`, `migration`, `E2E`. `style` covers visual-styling assertions in T-DETAIL-01, T-COMM-05, T-UX-02.
- Security rows assert status codes plus absence of protected content in the response body.
- Queue rows assert both row content and pagination `meta` (`page`, `pageSize`, `totalItems`, `totalPages`).
- Comment and note rows assert author and creation time originate from the backend and that markup is escaped on render.
- Admin safety rows assert the self-guard, last-active-Administrator deactivation guard, and role-reassignment guard each return 409 with the safety message.
- Migration rows assert idempotent seeding with the §5 quotas and preserved ticket ownership after Development Requester migration.
- Responsive rows assert 375, 800, and 1280 widths with no horizontal scroll and the queue card layout below 768px.
- Plan only: no test code implementation is included in this document.

---

## 6. Final Execution Summary (e2e-visual issue)

Final statuses at Lab 3 close-out, recorded on `feature/lab3-e2e-visual`:

| Suite | Command | Result |
|---|---|---|
| Server API/integration/security/migration | `cd server && npm test` | 277 passed |
| Client component/style/responsive | `cd client && npm test` | 118 passed |
| E2E journeys (lab-03 + lab-02 regression) | `npx playwright test` | 39 passed — 32 lab-03 (`authentication` 8 + `auth-responsive` 13 + `staff-ticket-flow` 6 + `user-administration` 5) + 7 lab-02 requester regression |

- All 57 planned rows are now **Implemented**; every AC-01..AC-18 has mapped passing evidence.
- Responsive/visual evidence: `docs/lab-03/visual-checklist.md`, `artifacts/lab-03/screenshots/**` (22 live captures across desktop/tablet/mobile, including failure/forbidden/empty states), and the measured probe `artifacts/lab-03/screenshots/visual-probe.json` (29 measurements, zero horizontal overflow; auth-card centering verified in both gate and voluntary contexts).
- Known visual issues (cosmetic only) are listed in the visual checklist; none affect function or safety.
