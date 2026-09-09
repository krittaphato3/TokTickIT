# CPE 334 Lab 3 — TokTickIT Real Auth + Staff/Admin Workflows: Engineering Specification

- **Status:** Draft v0.1 (contract skeleton — TODOs to be resolved)
- **Sprint:** Lab 3 — Real auth, IT Staff queue/detail, Admin user management
- **Companion documents:** [`ui-spec.md`](./ui-spec.md), [`api-spec.md`](./api-spec.md), [`tests.md`](./tests.md)

---

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real authentication (Requester, IT Staff, Administrator roles), deliver the IT Staff queue/detail workflow and Administrator user management with mandatory first-login password change, while preserving the full Lab 2 Requester regression surface unchanged in behavior.

## 2. Stakeholder Request Interpretation

TODO: Concise interpretation — stakeholders want identity enforced server-side via auth (not a client selector), staff triage of all tickets with ownership/priority/status control, admin lifecycle management of users with safe deactivation, and a strict public/internal communication boundary. Lab 2 flows must keep working on auth identity.

## 3. Scope

### IN SCOPE

- Real auth: login, logout, current user, mandatory first-login password change.
- Requester regression on auth identity (selector removed); public comments; problem-appears-resolved indication.
- IT Staff ticket queue (search/filter/sort/pagination) and ticket detail ops (owner, IT priority, status).
- Public Comments vs Internal Notes with role-gated visibility.
- Admin user management: list/search/filter, create, edit, set initial password; activation control.
- Ticket Owner zero-or-one active IT Staff/Administrator enforcement.
- 8 ticket statuses: New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled.
- Requested Priority vs IT Priority (copy-on-claim + independent edit).
- Seed/migration from Development Requesters to real users.

### OUT OF SCOPE (explicitly EXCLUDED)

- Email invitations
- Password-reset email
- MFA
- SSO
- Social login
- Self-registration
- User deletion
- Bulk ops
- Import/export
- Departments
- Profile photos
- Role history
- Audit history
- SLA
- Notifications
- Dashboards
- Actions Taken

## 4. Functional Requirements

- **FR-01 — Login.** TODO: credentials, session/token, active-user gate.
- **FR-02 — Logout.** TODO: session invalidation, client redirect.
- **FR-03 — Current user.** TODO: identity + role + mustChangePassword flag.
- **FR-04 — Mandatory password change.** TODO: first-login gate, change flow.
- **FR-05 — Requester regression on auth identity.** TODO: selector removed; scoping by auth identity.
- **FR-06 — Staff queue.** TODO: cross-ticket list with search/filter/sort/pagination.
- **FR-07 — Staff detail ops.** TODO: owner, IT priority, status transitions.
- **FR-08 — Public comments.** TODO: requester-visible thread.
- **FR-09 — Internal notes.** TODO: staff/admin-only thread.
- **FR-10 — Admin user management.** TODO: list/search/filter, create/edit/set-password, activate/deactivate.
- **FR-11 — Ownership enforcement.** TODO: zero-or-one active IT Staff/Administrator owner.
- **FR-12 — Seed/migration.** TODO: Development Requester migration; seed quotas.

## 5. Business Rules

- **BR-01 — Active-user auth.** TODO: only active users authenticate.
- **BR-02 — mustChangePassword gate.** TODO: block app access until changed.
- **BR-03 — Auth identity determines ownership.** TODO: no client-supplied identity.
- **BR-04 — Public vs internal visibility.** TODO: requesters see public only; staff/admin see both.
- **BR-05 — Requester-indication vs formal resolve.** TODO: problem-appears-resolved is an indication, not a status transition.
- **BR-06 — Owner must be active IT Staff/Administrator.** TODO: zero-or-one; deactivated owner handling.
- **BR-07 — IT Priority copy+edit rule.** TODO: initial copy from Requested Priority on claim; independently editable after.
- **BR-08 — 8-status transition matrix.** TODO: New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled — allowed transitions table.
- **BR-09 — Admin safety rules.** TODO: no self-deactivation; no last-admin removal; deactivation-not-deletion.
- **BR-10 — Password hashing.** TODO: hash algorithm, never store/return plaintext.
- **BR-11 — Lab 2 regression.** TODO: requester flows, ownership, attachments, list semantics preserved.
- **BR-12 — TODO.** TODO: reserved for authorization-matrix clarification (see §11).

## 6. UI Specification Summary

TODO screen list:

- Login; Mandatory password change; Requester views (regression); IT Staff queue; IT Staff detail; Admin user management; App shell with role nav.
- Full layout rules: [`ui-spec.md`](./ui-spec.md).

## 7. Data Changes

TODO tables — fields, constraints, and migration intent only; final schema in code.

### User model (TODO)

| Field | Type | Notes |
|-------|------|-------|
| TODO | TODO | TODO: email unique, name, role, status/active, passwordHash, mustChangePassword |

### Ticket owner FK (TODO)

| Field | Type | Notes |
|-------|------|-------|
| TODO | TODO | TODO: nullable FK to User; zero-or-one active IT Staff/Administrator |

### Comment / note models (TODO)

| Model | Visibility | Notes |
|-------|------------|-------|
| TODO Public Comment | Requester + Staff/Admin | TODO |
| TODO Internal Note | Staff/Admin only | TODO |

### Development Requester migration (TODO)

| Step | Notes |
|------|-------|
| TODO | TODO: migrate Lab 2 requesters to User rows; preserve ticket ownership |

### Seed quotas (TODO)

| Role | Quota |
|------|-------|
| Requester | TODO: 4+1 |
| IT Staff | TODO: 3+1 |
| Administrator | TODO: 1 |

## 8. API Contract

TODO endpoint placeholders. Full shapes in [`api-spec.md`](./api-spec.md):

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/password-change`
- Auth-scoped `GET /api/tickets`, ticket detail, attachments (regression)
- Staff queue `GET /api/staff/tickets` (TODO path; confirm in api-spec)
- Staff ops: owner, it-priority, status (TODO shapes)
- Public comments; Internal notes (role-gated)
- Admin users: list/create/patch/set-password (TODO shapes)

## 9. Acceptance Criteria

TODO: expand each AC with Given/When/Then during contract finalization.

| AC ID | Issue | Description |
|-------|-------|-------------|
| AC-00-01 | TODO | TODO: Lab 2 regression preserved |
| AC-00-02 | TODO | TODO: auth gates all access |
| AC-00-03 | TODO | TODO: role-based access enforced |
| AC-01-01 | #36 | TODO |
| AC-01-02 | #37 | TODO |
| AC-01-03 | #38 | TODO |
| AC-01-04 | #39 | TODO |
| AC-01-05 | #40 | TODO |
| AC-01-06 | #41 | TODO |
| AC-01-07 | #42 | TODO |
| AC-01-08 | #43 | TODO |

## 10. Definition of Done

- [ ] Contract finalized (all TODOs resolved, issues #36..#43 mapped)
- [ ] Code implements spec + api-spec + ui-spec
- [ ] Automated tests pass per tests.md traceability
- [ ] Lab 2 regression suite passes unchanged in behavior
- [ ] Seed/migration verified with required quotas
- [ ] Reviewer record completed

## 11. Assumptions and Decisions

| ID | Assumption / Decision | Status |
|----|----------------------|--------|
| AD-01 | Session/token mechanism TBD in api-spec. | TODO — decide in api-spec |
| AD-02 | Administrator ticket-operation permission must be explicitly recorded per authorization matrix. | TODO — record allowed/denied ops |
