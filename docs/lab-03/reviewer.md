# Lab 3 Peer Review Record

- **Status:** Pending peer review, to be completed before merge to lab3-staging/main
- **Scope:** Sprint 3 engineering contract (`specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`) — Lab_3_sheet.pdf §14 Part 1
- **Branch:** `feature/lab3-engineering-contract` (Issue #45)

---

## 1. Reviewer Identity

| Field | Value |
|-------|-------|
| Name | Pending — TBD pending peer assignment |
| Student ID | Pending — TBD pending peer assignment |
| GitHub | Pending — TBD pending peer assignment |

> Pending peer review, to be completed before merge to lab3-staging/main. Reviewer fields stay marked Pending until a peer is assigned; no review comments or approvals have been recorded yet.

## 2. PR Links

| PR | Link | Scope |
|----|------|-------|
| Contract PR | Pending — contract PR URL to be added when opened from `feature/lab3-engineering-contract` | specification.md, api-spec.md, ui-spec.md, tests.md, ai-use.md, reviewer.md |
| Staging PR | Pending — lab3-staging integration PR URL to be added | Sprint 3 contract + implementation |
| Main PR | Pending — main release PR URL to be added | Final Lab 3 increment |

## 3. Review Comments → Responses

| # | Comment | Response | Status |
|---|---------|----------|--------|
| — | (No comments recorded yet — rows will be appended as review proceeds) | — | Pending |

## 4. Approvals

| Reviewer | Decision | Date |
|----------|----------|------|
| Pending | Pending | Pending |

### Approval checklist

- [ ] Contract covers Lab_3_sheet.pdf §4 (auth, roles, migration, queue/detail, admin, data, API, UI, tests, Definition of Done)
- [ ] FR/BR/AC/AD numbering is frozen and consistent across spec, API, UI, and test docs
- [ ] Authorization matrix (BR-20 / api-spec §12) enforced server-side, safe errors verified
- [ ] Acceptance criteria each map to at least one planned test
- [ ] No scope-creep items from the excluded list are present
- [ ] Reviewer identity filled in and approval recorded before merge to lab3-staging/main

## 5. Final Review Status

Pending peer review, to be completed before merge to lab3-staging/main. This scaffold is intentionally empty-ready: PR links, comment threads, and approvals will be filled in once a peer reviewer is assigned.

## 6. Auth-foundation increment (`feature/lab3-auth`)

- **Scope:** auth foundation only — FR-01..FR-04, BR-01, BR-02, BR-06..BR-09, AC-01, AC-02, AC-05, AC-06, AC-18. Staff queue/detail and admin screens stay placeholder references owned by other issues.
- **Docs changed:** `specification.md` §7.7, `api-spec.md` §1.1 gate `code` + §11, `tests.md` Final column for T-AUTH-01..05, T-PWD-01, T-SESS-01, T-GATE-01, T-MIG-01 → `Implemented` (`server/tests/lab-03/auth.api.test.ts`).
- **Review ask:** confirm auth decisions (cookie, 24 h sliding+absolute, CSRF double-submit, bcrypt-12), incremental migration (Requester kept, User mirrored, repoint deferred), and safe-error shapes before merge.

## 7. Requester-regression increment (`feature/lab3-requester-regression`, issue #41)

- **Scope:** requester identity regression + Public Comments + appears-resolved signal — FR-05, FR-08, FR-09 (masked half), FR-10; BR-03, BR-04, BR-05, BR-11, BR-14, BR-17; AC-03, AC-04 (masked half), AC-07, AC-12, AC-13 (masked half), AC-14.
- **Code changed:** `PublicComment` model + migration `20260914143757_lab3_public_comments`; `server/src/services/comment.service.ts` + `server/src/controllers/comments.controller.ts`; comment/status routes in `server/src/routes/tickets.ts`; `GET /api/requesters` removed in `server/src/app.ts`; `appearsResolvedAt` added to the requester ticket-detail projection; client `api.ts` comment functions; requester `TicketDetailPage` rewritten (live thread, signal modal, Lab 2 mock tabs/Resolution Summary removed per ui-spec §5); `ticket-detail.css` additions.
- **Tests:** `server/tests/lab-03/authorization.api.test.ts` (T-AUTHZ-02/03/05, T-REQ-01, T-STAT-04, T-MIG-02), `server/tests/lab-03/comments-notes.api.test.ts` (T-COMM-01..04, T-STAT-03, requester-masked notes probe), `client/tests/lab-03/RequesterTicketDetail.test.tsx` (T-REQ-02, T-COMM-05 requester half, T-STAT-03 client half); Lab 2 suites kept green (`npm test` 143/143 server, 67/67 client); `server/tests/lab-02/api/requesters.test.ts` re-pinned to the documented §10 removal.
- **Docs changed:** `api-spec.md` §7 implemented mechanics + §7.3 status note, `tests.md` Final column + policy note, this file, `ai-use.md` §6.
- **Review ask:** confirm the masked-404 comment surface for requesters, the one-active-signal 409 rule, requester REOPEN-only status route (no UI caller this issue), and that no requester-facing Internal Notes surface exists.

## 8. Staff-detail increment (`feature/lab3-staff-ticket-detail`)

- **Scope:** IT Staff Ticket Detail operations — FR-07, FR-08 (staff aliases), FR-09 (full), FR-10 (staff visibility + episode clear); BR-12, BR-13, BR-14, BR-15, BR-04, BR-20; AC-04, AC-09, AC-10, AC-11, AC-12 (staff half), AC-13, AC-14 (staff half).
- **Code changed:** `InternalNote` model + migration `20260916120000_lab3_staff_detail_ops` (additive; no Ticket/Attachment data touched); `server/src/services/staff-ticket.service.ts` (detail projection, BR-12 owner validation, BR-13 copy-on-claim, BR-15 matrix + confirmations + reason comments + owner-presence guard + FR-10 episode clear); `server/src/services/internal-note.service.ts` + controller (masked requester 404, trimmed 1–2000 validation); `server/src/controllers/staff-attachments.controller.ts` (staff read-only download with audit ledger events); `server/src/controllers/staff-ticket.controller.ts`; routes in `server/src/routes/staff.ts` (per-route gates; notes deliberately not router-gated so requesters get the masked 404, never a 403 existence leak); client `api.ts` staff-detail/owner/it-priority/status/comments/notes/attachment functions; `client/src/components/StaffTicketDetail.tsx` + `staff-ticket-detail.css` + route wiring in `App.tsx`.
- **Tests:** `server/tests/lab-03/staff-ticket-detail.api.test.ts` (54 tests: §12 matrix rows, T-OWN-01/02, T-PRIO-01/02, all 17 legal BR-15 transitions + illegal/skip/no-op/missing-confirm/missing-reason, attachment continuity incl. staff download + removed-404, staff comment aliases, notes visibility/validation/append-only, masked-404 byte-equality vs absent ticket); `server/tests/lab-03/comments-notes.api.test.ts` T-COMM-02 notes half completed (staff 200/201 + requester masked 404); `client/tests/lab-03/StaffTicketDetail.test.tsx` (18 tests, T-DETAIL-01); `client/tests/lab-03/StaffTicketQueue.test.tsx` stub extended with a valid detail payload behind the Open-navigation assertion.
- **Suite evidence:** server `npx vitest run` 237/237 (19 files, incl. all Lab 2 regression suites), client `npx vitest run` 99/99 (14 files); `tsc --noEmit` clean on server and client; `vite build` + `tsc` production builds clean.
- **Docs changed:** `api-spec.md` §5/§6/§7/§8 implementation-status notes, `tests.md` Final column (T-OWN-01/02, T-PRIO-01/02, T-STAT-01/02, T-DETAIL-01, T-COMM-02..05), `specification.md` §7.7 InternalNote model + comment-surface update, this file, `ai-use.md`.
- **Documented decisions for review:** (1) invalid owner candidates are 409 conflicts per the §6.2 error table (supersedes the BR-12 "422/400" phrasing); unknown ids are 404 `User not found`; (2) staff status change out of RESOLVED/CLOSED clears a stale `appearsResolvedAt` (FR-10 one-active-signal-per-episode, applied to the §6.4 wording "not cleared by a staff status change"); (3) BR-15 audit comment lands on the public thread with actor/from→to/timestamp, and reopen transitions embed the required reason in that comment; (4) internal-notes routes are intentionally not `requireStaffRole`-gated at the router — the handler throws the masked 404 so requesters never learn the surface exists (§1.5); (5) ADMIN is read-only on the staff surface server-side (service re-check fails writes closed with 403) and the UI renders composers only for IT_STAFF per ui-spec §8.1; (6) staff attachment download is added on the staff surface (read-only viewer per ui-spec §7.3) and writes DOWNLOAD rows to the shared audit ledger.
- **Review ask:** confirm decisions (1)–(6), the masked-404 routing choice (4), and that no excluded feature (Actions Taken, SLA, notifications, comment/note edit-delete) crept in.

## 9. Admin user-management increment (`feature/lab3-admin-users`, issue #42)

- **Scope:** Administrator User Management API + screen — FR-11, FR-12; BR-09, BR-10, BR-16 (admin relaxation), BR-18, BR-20; AC-15, AC-16, AC-17. No schema change (the auth-foundation `User` model already carries `role`/`isActive`/`mustChangePassword`/`passwordHash`).
- **Code changed:** `server/src/middleware/auth.ts` (`requireAdminRole`); `server/src/services/users.service.ts` (list/search/filter, create, guarded update, set-initial-password); `server/src/controllers/users.controller.ts`; `server/src/routes/users.ts` (per-route `requireAuth` + `requireAdminRole`, no DELETE route); router mount in `server/src/app.ts`; client `api.ts` user-management functions; `client/src/components/UserManagement.tsx` + `client/src/styles/admin-users.css`; `App.tsx` route wiring (placeholder removed).
- **Tests:** `server/tests/lab-03/users-admin.api.test.ts` (27 tests — T-AUTHZ-04, T-ADM-01..05, T-PWD-02 incl. gated-until-change end-to-end), `client/tests/lab-03/UserManagement.test.tsx` (16 tests — T-ADM-06 + T-UX-02 admin half).
- **Suite evidence:** server `npx vitest run` 275/275 (20 files, all Lab 2 regression suites included), client `npx vitest run` 115/115 (15 files); `tsc --noEmit` clean server + client; `oxlint` clean on touched files.
- **Docs changed:** `api-spec.md` §9 implementation-status note, `tests.md` plan-policy + Final column (T-ADM-01..06, T-AUTHZ-04, T-PWD-02, T-UX-02 admin half), `specification.md` §7.9, `ui-spec.md` §8 implementation note, this file, `ai-use.md`.
- **Documented decisions for review:** (1) wire role value for Administrator is `ADMIN` per api-spec §9 (DB enum `ADMINISTRATOR`, mapped in the service); (2) the self-deactivation guard reads the actor id from the server-side session only — a client-supplied actor field cannot bypass it (BR-03); (3) guard reachability: an API actor must be an active Administrator, so a pure-API "deactivate the last active admin" always coincides with the self rule (checked first per §9.3); the distinct last-admin-deactivation branch is proven at the service layer with a separate actor id and the role-reassign 409 is proven over the API (documented in api-spec §9 and tests.md T-ADM-05); (4) create-success banner copy is "User saved." (ui-spec §8 deviation, recorded there); (5) load failure renders inside the list card (single §10 failure surface), not as a duplicate banner; (6) invalid `:id` path segments and unknown ids are both 404 `User not found` (never leak whether an id was ever valid); (7) empty update body is 400 `details[0].field === "body"`.
  (9) The stakeholder-requested overhaul adds server-side pagination (page/pageSize; invalid
  values 400; page size FIXED at 10 with no rows-per-page selector), bottom-right toast
  notifications for save outcomes, and a client-side password strength meter (hint only — the
  §1.3 length-only server contract for admin-set initial passwords is unchanged). Sorting now
  applies to the current page client-side (pages arrive id-ascending). A meta.counts-driven
  KPI stats strip was built for this iteration and then removed at the stakeholder's request;
  meta.counts was dropped from the API response with it. Safety rules are untouched: guards,
  CSRF, and role gating are identical to decisions (1)–(8).
  (8) The list header adds single-column sorting (Name/Email/Role/Status, stakeholder request) on
  the unpaginated list — sorted client-side for both the table and the mobile card list; this
  respects the §8.1 exclusions, which bar pagination and multi-column sorting only.
- **Review ask:** confirm decisions (1)–(7), that the admin gate cannot be bypassed by any route ordering, and that no excluded feature (user deletion, bulk ops, import/export, pagination, email delivery) crept in.
