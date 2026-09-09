# CPE 334 Lab 3 — API Specification (Skeleton)

- **Status:** Draft v0.1 (TODO skeleton)
- **Parent:** [`specification.md`](./specification.md)

---

## 1. Authentication — TODO

| Method & Path | Auth | Request | Response | Notes |
|---------------|------|---------|----------|-------|
| TODO `POST /api/auth/login` | Public | TODO: email + password | TODO: user + mustChangePassword | TODO |
| TODO `POST /api/auth/logout` | Auth | — | TODO | TODO |

## 2. Current User — TODO

| Method & Path | Auth | Response | Notes |
|---------------|------|----------|-------|
| TODO `GET /api/auth/me` | Auth | TODO: id, email, name, role, mustChangePassword | TODO |

## 3. Password Change — TODO

| Method & Path | Auth | Request | Notes |
|---------------|------|---------|-------|
| TODO mandatory change | Auth | TODO: new password | TODO: required when mustChangePassword |
| TODO voluntary change | Auth | TODO: current + new password | TODO |

## 4. Requester Regression APIs — TODO

Intent: ticket list/detail/attachments scoped to auth identity (no dev header).

| Method & Path | Auth | Notes |
|---------------|------|-------|
| TODO `GET /api/tickets` | Requester auth | TODO: preserved Lab 2 semantics |
| TODO ticket detail + attachments | Requester auth | TODO: ownership by auth identity |

## 5. IT Staff Queue API — TODO

Intent: cross-ticket search/filter/sort/pagination with meta.

| Query Param | Notes |
|-------------|-------|
| TODO search/filter/sort/page/pageSize | TODO shapes |

| Meta Field | Notes |
|------------|-------|
| TODO page, pageSize, totalItems, totalPages | TODO |

## 6. IT Staff Ticket Operations API — TODO

| Method & Path | Auth | Notes |
|---------------|------|-------|
| TODO set owner | Staff/Admin per matrix | TODO: zero-or-one enforcement |
| TODO set it-priority | Staff/Admin per matrix | TODO: copy+edit rule |
| TODO set status | Staff/Admin per matrix | TODO: 8-status matrix |

## 7. Public Comments API — TODO

| Method & Path | Auth | Notes |
|---------------|------|-------|
| TODO list/create | Requester (own ticket) + Staff/Admin | TODO shapes |

## 8. Internal Notes API — TODO

Intent: role-gated; requester access masked as 404.

| Method & Path | Auth | Notes |
|---------------|------|-------|
| TODO list/create | Staff/Admin only | TODO: requester → masked 404 |

## 9. Administrator User Management API — TODO

| Method & Path | Auth | Success | Notes |
|---------------|------|---------|-------|
| TODO list + search/filter | Admin | 200 + meta | TODO |
| TODO create | Admin | 201 / 409 duplicate email | TODO |
| TODO patch | Admin | 200 / 409 safety conflict | TODO: no self-deactivation, no last-admin removal |
| TODO set-initial-password | Admin | 200 | TODO: sets mustChangePassword |

## 10. Safe Error Conventions — TODO

| Status | Meaning | Notes |
|--------|---------|-------|
| 401 | Unauthenticated | TODO |
| 403 | Forbidden (incl. mustChangePassword gate) | TODO |
| 400 | Invalid input | TODO: field details |
| 404 | Not found / masked missing | TODO: internal notes masked for requesters |
| 409 | Conflict | TODO: duplicate email, admin safety, owner conflict |
| 500 | Generic server error | TODO: safe message only |

Envelope: `{ error }` + optional `details`. TODO: confirm shape.
