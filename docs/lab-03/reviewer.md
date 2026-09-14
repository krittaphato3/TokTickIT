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
