# CPE 334 Lab 3 — Test Plan Traceability (Skeleton)

- **Status:** Draft v0.1 (TODO skeleton)
- **Parent:** [`specification.md`](./specification.md)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---------|------|----------------|---------------|-----------------|---------------------|--------------|
| T-AUTH-01 | API | FR-01/AC-01-01, AC-01-07 | Login success/failure; password-policy 400 cases + 200 success | TODO | `server/tests/lab-03/auth.api.test.ts` | TODO |
| T-AUTH-02 | UI | FR-01/AC-01-07 | Login + ChangePassword validation, busy, rule hints, redirect | TODO | `client/tests/lab-03/Login.test.tsx`, `client/tests/lab-03/ChangePassword.test.tsx` | TODO |
| T-AUTHZ-01 | API | BR-01/BR-02/BR-03 | Role gates, mustChangePassword gate, ownership from auth identity | TODO | `server/tests/lab-03/authorization.api.test.ts` | TODO |
| T-REQ-01 | API/UI | FR-05 | Requester regression on auth identity; ignored requesterId; masked 404 | TODO | `server/tests/lab-03/authorization.api.test.ts`, `client/tests/lab-03/RequesterTicketDetail.test.tsx` | TODO |
| T-QUEUE-01 | API/UI | FR-06 | Staff queue search/filter/sort/pagination + invalid-query 400 | TODO | `server/tests/lab-03/staff-queue.api.test.ts`, `client/tests/lab-03/StaffTicketQueue.test.tsx` | TODO |
| T-DETAIL-01 | API/UI | FR-07 | Staff detail owner/priority/status ops + matrix 409s | TODO | `server/tests/lab-03/staff-ticket-detail.api.test.ts`, `client/tests/lab-03/StaffTicketDetail.test.tsx` | TODO |
| T-COMM-01 | API/UI | FR-08/FR-09 | Public comments vs internal notes visibility; append-only; limits | TODO | `server/tests/lab-03/comments-notes.api.test.ts` | TODO |
| T-ADMIN-01 | API/UI | FR-10 | Admin user mgmt; duplicate 409; self/last-admin deactivation + role-reassignment 409 | TODO | `server/tests/lab-03/users-admin.api.test.ts`, `client/tests/lab-03/UserManagement.test.tsx` | TODO |
| T-MIG-01 | Migration | FR-12 | Seed/migration quotas + Lab 2 regression (additional beyond §12 minimum) | TODO | `server/tests/lab-03/migration.regression.test.ts` | TODO |
| T-E2E-01 | E2E | ACs | Auth flow; staff ticket flow; user administration flow | TODO | `e2e/lab-03/authentication.spec.ts`, `e2e/lab-03/staff-ticket-flow.spec.ts`, `e2e/lab-03/user-administration.spec.ts` | TODO |
| T-UX-01 | UI/A11y | UI spec §8-9 | Responsive 375/800/1280, keyboard, feedback states, no horizontal scroll | TODO | client/tests/lab-03 screen suites + responsive checks | TODO |
