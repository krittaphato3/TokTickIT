# Lab 4 Peer Review Record

## Author

- Name: Krittaphat Panyasomphan
- Student ID: 67070501052
- GitHub username: `krittaphato3`
- Sprint: Lab 4 — Actions Taken, Ticket Lifecycle and Dashboards (`lab4-staging` → `feature/l4-*`)

## Reviewers

Carried over from `docs/lab-03/reviewer.md` with additional Lab 4 reviewer:

- Name: NAPATR KASEMWEERASAN — Student ID: 67070501014 — GitHub username: `napatsun`
- Name: ALONGKORN KAEWPROM — Student ID: 67070501050 — GitHub username: `Alongkron1234`
- Name: ATIWIT — GitHub username: `atiwit`

## PR review record

One row per Lab 4 pull request. The PR link, reviewer, review comment and approval columns are filled from GitHub reviewer data on `PR n` / `FIX n` / `MERGE n`; the response column records what changed in the branch. Rows are added when the PR is opened, never in advance.

| PR link | Issue | Reviewer | Review comment | My response | Approved |
|---|---|---|---|---|---|
| [PR #61](https://github.com/krittaphato3/TokTickIT/pull/61) — base `lab4-staging`, head `feature/l4-1-contract` | [#54](https://github.com/krittaphato3/TokTickIT/issues/54) | `napatsun`, `Alongkron1234` (approved 2026-10-10) | napatsun: "ครบถ้วนเรียบร้อย พร้อมทำต่อได้เลยครับ"; Alongkron1234: "ทำออกมาได้ดีมากครับ ผ่าน" | — | **APPROVED (merged 2026-10-10)** |
| [PR #62](https://github.com/krittaphato3/TokTickIT/pull/62) — base `lab4-staging`, head `feature/l4-2-actions-taken-api` | [#55](https://github.com/krittaphato3/TokTickIT/issues/55) | `napatsun`, `Alongkron1234` (approved 2026-10-11) | napatsun: "อ่านโค้ดแล้วเห็นว่ามีการวาง structure มาได้ดีมากครับ โดยเฉพาะการแยก concern ของ API, การทำ idempotent seed ที่ครอบคลุมหลาย use case และการมี rollback script ให้พร้อมเสมอ เยี่ยมเลยครับ"; Alongkron1234: "เห็นด้วยกับคุณซันครับมีการทำมาอย่างดีทั้ง seed การวาง structure ต่างๆ" | — | **APPROVED (merged 2026-10-11)** |
| [PR #63](https://github.com/krittaphato3/TokTickIT/pull/63) — base `lab4-staging`, head `feature/l4-3-ticket-workflow` | [#56](https://github.com/krittaphato3/TokTickIT/issues/56) | `napatsun` (approved 2026-10-14), `Alongkron1234` (approved 2026-10-21) | Alongkron1234: "ใน reloadAfterConflict() มีการเรียก setResolveOpen(false)..."; napatsun: "1. ใน ResolveTicketDialog.tsx ตอนที่เกิด 409 และ user กด Reload มีการจัดการ state ของ resolutionSummary ให้สะอาดหรือยัง 2. ตรงส่วนที่ Requester พยายามเปลี่ยนสถานะแล้วได้ 403 มีการแสดง error message ให้ user รู้มั้ยครับ" | อธิบายการตั้งใจปิด modal หลัง Reload เพื่อให้ staff เห็นข้อมูลล่าสุดก่อนตัดสินใจ Resolve อีกครั้ง โดยเก็บ draft summary ไว้ใน state ไม่สูญหาย; มี toast notification แจ้งเตือนเมื่อได้ 403 (ทั้งสอง reviewer ยืนยันเข้าใจและ Approve เรียบร้อย) | **APPROVED (merged 2026-10-21)** |
| [PR #64](https://github.com/krittaphato3/TokTickIT/pull/64) — base `lab4-staging`, head `feature/l4-4-actions-taken-ui` | [#57](https://github.com/krittaphato3/TokTickIT/issues/57) | `atiwit` (approved 2026-10-28), `Alongkron1234` (approved 2026-10-28) | atiwit: "ในเคส UI-03 ที่มีการเรียก cleanup() แล้ว re-render 3 รอบ แนะนำแยกเป็น 3 it() ย่อยดีกว่า"; Alongkron1234: "ตรงนี้เหมือนมันสร้าง action แล้ววางบนสุดตลอด ควร sort ใหม่หลัง create/edit นะ", ต่อมาให้ความเห็น: "ผ่าน!!!!!" | แยก UI-03 ออกเป็น UI-03a, UI-03b, UI-03c และ UI-03d; เพิ่ม sortActions() จัดเรียง actionAt desc, id desc ทั้ง create/edit ตาม BR-05 (ทั้ง Alongkron1234 และ atiwit approve เรียบร้อย) | **APPROVED (merged 2026-10-28)** |
| [PR #65](https://github.com/krittaphato3/TokTickIT/pull/65) — base `lab4-staging`, head `feature/l4-5-dashboards` | [#58](https://github.com/krittaphato3/TokTickIT/issues/58) | `atiwit` (approved 2026-10-28), `Alongkron1234` (approved 2026-10-28) | Alongkron1234: "StaffDashboard.tsx:215 และ :287 ลิงก์ตั๋วไป #/tickets/${ticketNumber} ซึ่งเป็นหน้า Requester ควรเป็น #/staff/tickets/${ticketNumber} ตาม route ใน App.tsx ไม่งั้น staff จะเข้าหน้ารายละเอียดตั๋วจาก dashboard ไม่ได้หรือป่าวครับ"; atiwit: "โค้ดโดยรวมโอเคครับ หน้า Staff และ Requester ตรงรตาม Requirement ลุยต่อโล้ด"; Alongkron1234 (re-review): "จากทีดูอีกรอบผ่านหมดแล้วนะครับ" | แก้ไขลิงก์ของ Recent Tickets และ My Recent Actions บนหน้า Staff Dashboard ให้ชี้ไปที่ `#/staff/tickets/${ticketNumber}` ตาม ui-spec §3.3 พร้อมเขียนเทสครอบคลุมใน StaffDashboard.test.tsx และ dashboards.spec.ts เรียบร้อย | **APPROVED (merged 2026-10-28)** |
| [PR #66](https://github.com/krittaphato3/TokTickIT/pull/66) — base `lab4-staging`, head `feature/l4-6-final-hardening` | [#59](https://github.com/krittaphato3/TokTickIT/issues/59) | `Alongkron1234` (commented 2026-10-29), `atiwit` (review requested 2026-10-29) | Alongkron1234: "1. ใน dashboard.service.ts ควรเรียก resolveSessionRequester แทน 2. sequence setval ใน seed.ts ควรอยู่ก่อน loop L4_REQUESTERS เพื่อไม่ให้ชน id 1-5" | ดำเนินการแก้ไขทั้ง 2 จุดทันที: 1) ปรับ `dashboard.service.ts` ใช้ `resolveSessionRequester` พร้อมเขียน TDD unit test ยืนยัน 2) ย้ายคำสั่ง `setval` ไปไว้คั่นระหว่าง `REQUESTERS` (1..5) และ `L4_REQUESTERS` ใน `seed.ts` เพื่อให้ auto-increment sequence เริ่มที่ 6 ทันที และทดสอบ `prisma migrate reset` บน DB ว่างผ่านฉลุย | **Fix applied (awaiting re-review)** |

## Partner PRs I reviewed

One row per pull request I reviewed in a partner's repository.

| PR link | My comment | Partner response | My approval |
|---|---|---|---|
| [Alongkron1234/toktickit#69](https://github.com/Alongkron1234/toktickit/pull/69) — `fix(lab-04): Auth Cleanup and Final Hardening` | "แก้ไข security issues ได้ดีมากครับ good catch ในส่วนนี้เลย จากที่ลองสังเกตุดูแก้ไขได้ดีมากครับ มีเทสครบถ้วน" | — | **APPROVED (2026-10-28)** |
| [atiwit/toktickit#66](https://github.com/atiwit/toktickit/pull/66) — `feat(workflow): Ticket workflow, Resolution Gate, and Concurrency` | "ทำส่วน workflow logic กับ test suite ออกมาได้ดีมากเลยครับ! ตัว Resolution Gate กับ Transition Matrix ก็ทำมาได้ดีมากครับ ภาพรวมผ่านเลยครับ เดี๋ยวผมกด Approve ให้นะครับ แต่ขอฝากข้อเสนอแนะไว้พิจารณาปรับเพิ่มอีกนิดหน่อยก่อน merge ครับ: 1. การทำ OCC ใน index.ts 2. Response & Frontend cleanup" | atiwit: "ขอบคุณสำหรับ comment ครับคุณโอซง เดี๋ยวผมจะรีบแก้ไขตามที่คุณโอซงแนะนำนะครับบ" | **APPROVED (2026-10-28)** |
| [atiwit/toktickit#67](https://github.com/atiwit/toktickit/pull/67) — `feat(ui): implement Actions Taken section and Resolution Gate UI on Ticket Detail (Issue #58)` | "ทำงานได้ดีเยี่ยมมากครับสำหรับสปรินต์นี้! Test coverage ในส่วนของ workflow และ actions components ทำออกมาได้ดีมาก ไม่มีข้อติเลยครับ" | atiwit: "ขอบคุณครับคุณโอซง" | **APPROVED (2026-10-28)** |
| [atiwit/toktickit#69](https://github.com/atiwit/toktickit/pull/69) — `feat(ui): Actions Taken on Ticket Detail UI` | "ทำงานได้ดีเยี่ยมมากครับสำหรับสปรินต์นี้! Test coverage ในส่วนของ workflow และ actions components ทำออกมาได้ดีมาก ไม่มีข้อติเลยครับ" | atiwit: "ขอบคุณมากครับคุณ Ozonggggg" | **APPROVED (2026-10-28)** |
| [napatsun/TokTickIT#59](https://github.com/napatsun/TokTickIT/pull/59) — `feature/lab4-03-actions-taken-api` | "ครบถ้วนดีครับ มีการ ทำการ Implement ที่ดี ในส่วนของ API แต่อยากจะขอให้ลองส่ง test มาให้ดูหน่อยนะครับว่าสำเร็จทุกขั้นตอนแล้วรึเปล่า" → ต่อมา: "ผ่านครับ ครบถ้วนดี เก่งมากครับ" | napatsun: แนบหลักฐานผล test ทั้งหมด (53 passed ในไฟล์ และ 587 passed รวมทั้งโปรเจกต์) พร้อมกล่าวขอบคุณ | **APPROVED (2026-09-23)** |
| [napatsun/TokTickIT#60](https://github.com/napatsun/TokTickIT/pull/60) — `feature/lab4-04-actions-taken-ui` | "มีการ implement spec และตาม issue อย่างครบถ้วน ไม่มีข้อติครับ" | napatsun: "ขอบคุณทั้งสองความเห็นครับ" | **APPROVED (2026-09-23)** |
| [napatsun/TokTickIT#61](https://github.com/napatsun/TokTickIT/pull/61) — `feature/lab4-05-ticket-workflow-resolution` | "Implement ครบถ้วนนะครับ ตาม Specification ที่ได้มีการทำไว้ ในส่วนของ workflow ก็ถูกหลักการและไม่ยุ่งเหยิง เก่งมากครับ ผ่านนๆๆๆๆ" | napatsun: "ขอบคุณสำหรับคอมเมนต์ของคุณบอลเเละคุณโอ" | **APPROVED (2026-09-24)** |

## Notes

- The Lab 4 contract (`docs/lab-04/{specification,tests,ui-spec,api-spec}.md`) is frozen when the `[L4-1]` PR is merged; after that it is the contract for every implementation issue, and any deviation must be recorded in `specification.md` §11 rather than applied silently.
- Deliberate Lab 3 test updates are listed in `specification.md` §11 with the affected files, so a reviewer can see exactly what changed in Lab 3 behaviour and why.
