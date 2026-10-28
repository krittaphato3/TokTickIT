# Lab 4 Peer Review Record

## Author

- Name: Krittaphat Panyasomphan
- Student ID: 67070501052
- GitHub username: `krittaphato3`
- Sprint: Lab 4 — Actions Taken, Ticket Lifecycle and Dashboards (`lab4-staging` → `feature/l4-*`)

## Reviewers

Carried over from `docs/lab-03/reviewer.md` (same review partners in this repository — confirm at the first Lab 4 PR if the pairing changed for Sprint 4):

- Name: NAPATR KASEMWEERASAN — Student ID: 67070501014 — GitHub username: `napatsun`
- Name: ALONGKORN KAEWPROM — Student ID: 67070501050 — GitHub username: `Alongkron1234`

## PR review record

One row per Lab 4 pull request. The PR link, reviewer, review comment and approval columns are filled from GitHub reviewer data on `PR n` / `FIX n` / `MERGE n`; the response column records what changed in the branch. Rows are added when the PR is opened, never in advance.

| PR link | Issue | Reviewer | Review comment | My response | Approved |
|---|---|---|---|---|---|
| [PR #61](https://github.com/krittaphato3/TokTickIT/pull/61) — base `lab4-staging`, head `feature/l4-1-contract` | [#54](https://github.com/krittaphato3/TokTickIT/issues/54) | `napatsun`, `Alongkron1234` (approved 2026-10-10) | napatsun: "ครบถ้วนเรียบร้อย พร้อมทำต่อได้เลยครับ"; Alongkron1234: "ทำออกมาได้ดีมากครับ ผ่าน" | — | **APPROVED (merged 2026-10-10)** |
| [PR #62](https://github.com/krittaphato3/TokTickIT/pull/62) — base `lab4-staging`, head `feature/l4-2-actions-taken-api` | [#55](https://github.com/krittaphato3/TokTickIT/issues/55) | `napatsun`, `Alongkron1234` (review requested 2026-10-11) | — | — | **Awaiting review** |
| [PR #63](https://github.com/krittaphato3/TokTickIT/pull/63) — base `lab4-staging`, head `feature/l4-3-ticket-workflow` | [#56](https://github.com/krittaphato3/TokTickIT/issues/56) | `napatsun`, `Alongkron1234` (review requested 2026-10-12) | — | — | **Awaiting review** |
| [PR #64](https://github.com/krittaphato3/TokTickIT/pull/64) — base `lab4-staging`, head `feature/l4-4-actions-taken-ui` | [#57](https://github.com/krittaphato3/TokTickIT/issues/57) | `atiwit` (approved 2026-10-28), `Alongkron1234` | Alongkron1234: "UI-03 มีการรวม assert หลายเคสมาก... ถ้าแยกเป็นเทสย่อยๆ น่าจะอ่านง่าย", "ตรงนี้ตอนเพิ่ม action ใหม่เข้ามา มีการเอา created ไปต่อไว้ข้างหน้าสุดเสมอ... ควรมีการ sort ใหม่ก่อนแสดงผลมั้ยครับ" | แยก UI-03 ออกเป็น UI-03a, UI-03b, UI-03c และ UI-03d; เพิ่ม sortActions() จัดเรียง actionAt desc, id desc ทั้ง create/edit ตาม BR-05 | **Awaiting review (atiwit approved)** |
| [PR #65](https://github.com/krittaphato3/TokTickIT/pull/65) — base `lab4-staging`, head `feature/l4-5-dashboards` | [#58](https://github.com/krittaphato3/TokTickIT/issues/58) | `atiwit` (review requested 2026-10-28) | — | — | **Awaiting review** |

## Partner PRs I reviewed

One row per pull request I reviewed in a partner's repository. Empty until the first review is submitted.

| PR link | My comment | Partner response | My approval |
|---|---|---|---|
| — | — | — | — |

## Notes

- The Lab 4 contract (`docs/lab-04/{specification,tests,ui-spec,api-spec}.md`) is frozen when the `[L4-1]` PR is merged; after that it is the contract for every implementation issue, and any deviation must be recorded in `specification.md` §11 rather than applied silently.
- Deliberate Lab 3 test updates are listed in `specification.md` §11 with the affected files, so a reviewer can see exactly what changed in Lab 3 behaviour and why.
