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
