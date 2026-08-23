# Lab 2 Peer Review Record

Issue 1:

Reviewer name / student ID / GitHub username:
- Name: NAPATR KASEMWEERASAN
- Student ID: 67070501014
- GitHub username: napatsun

Reviewer name / student ID / GitHub username:
- Name: ALONGKORN KAEWPROM
- Student ID: 67070501050
- GitHub username: Alongkron1234

PRs reviewed (links):
- https://github.com/krittaphato3/TokTickIT/pull/20

Comment received from partner on my PR → my response:
- Alongkron1234: เหมือนจะลืม review.md กับ ai_use.md หรือป่าว
- krittaphato3 (me): โอเคครับ จะปรับแก้ไข
- krittaphato3 (me): ปรับแก้ไขเรียบร้อย @Alongkron1234
- napatsun (Approved): ถูกต้องครบถ้วน approve ผม merge เลยนะครับ คุณกฤตภาส
- Alongkron1234:โอเค เรียบร้อยดีครับบ

Comment I gave partner on their PR → their response:
- krittaphato3: ทุกไฟล์เหมือนจะครบดีนะ แต่อาจจะมีตรง specification AC-17 และ AC-18 ครอบคลุมการเปลี่ยนแปลงสถานะ backend และ blocked download แต่การแสดงผลภาพของไฟล์แนบที่ถูกลบไม่ได้ถูกบันทึกไว้อย่างชัดเจนใน AC ก็เลยคิดว่า ถ้าเพิ่มเข้ามาน่าจะดูครบถ้วนครอบครุมมากกว่านะครับ
- Alongkron1234: 

---

Issue 2:

Reviewer name / student ID / GitHub username:
- Name: NAPATR KASEMWEERASAN
- Student ID: 67070501014
- GitHub username: napatsun

Reviewer name / student ID / GitHub username:
- Name: ALONGKORN KAEWPROM
- Student ID: 67070501050
- GitHub username: Alongkron1234

PRs reviewed (links):
- https://github.com/krittaphato3/TokTickIT/pull/21
- https://github.com/krittaphato3/TokTickIT/pull/23

Comment received from partner on my PR → my response:
- Alongkron1234: จาก ticket ที่ทำ จาก Many to Many น่าจะเป็น 1-Many นะ รบกวนเช็คอีกทีนะครับ
- krittaphato3 (me): ได้เลยครับ เดี๋ยวเช็คให้นะครับ
- krittaphato3 (me): แก้แล้วนะครับ รบกวนช่วยตรวจสอบหน่อยนะครับ @Alongkron1234, @napatsun
- napatsun (Approved): ผ่าน เเละครบถ้วนตาม issue นี้
- Alongkron1234 (Approved): ตรวจสอบเรียบร้อยแล้วครบถ้วนดีครับ

PR #23 (fix(db): correct Lab 2 migration FK ordering for One-to-Many) comment received → my response:
- napatsun (Approved): รันผ่าน ครบถ้วน ถูกต้อง approve เดี๋ยว merge เลยนะ
- krittaphato3 (me): ขอบคุณสำหรับ Review ครับ

Comment I gave partner on their PR → their response:
-

---

Issue 3:

Reviewer name / student ID / GitHub username:
- Name: ALONGKORN KAEWPROM
- Student ID: 67070501050
- GitHub username: Alongkron1234

Reviewer name / student ID / GitHub username:
- Name: NAPATR KASEMWEERASAN
- Student ID: 67070501014
- GitHub username: napatsun

PRs reviewed (links):
- https://github.com/krittaphato3/TokTickIT/pull/24

Comment received from partner on my PR → my response:
- Alongkron1234: ตรวจเช็คแล้วไฟล์โอเคครยถ้วนดีครับ แต่อยากเห็นผลการ test เพิ่มเติมจะดีมากครับ
- krittaphato3 (me): อันนี้คือผลจากการรัน npm test ครับ ซึ่งประกอบด้วย API-21 — FR-13, BR-15, AC-21, UI-07 — FR-13, BR-03, BR-05 ของ requesterselection (ด้วย Screenshot)
- Alongkron1234 (Approved): ครบถ้วนเรียบร้อยดีมากมีผลการรัน test ชันเจน
- napatsun (Approved): จากที่ดูโค้ดเเละไล่อ่านจากคอมเมนต์ของคุณอลงกรณ์ที่บอกเรื่องผลการ test เเละคุณกฤตภาสก็ได้เแก้ไขเรียบร้อย สำหรับผมผ่านเเละ Approve

Comment I gave partner on their PR → their response:
-

---

Issue 4:

Reviewer name / student ID / GitHub username:
- Name: NAPATR KASEMWEERASAN
- Student ID: 67070501014
- GitHub username: napatsun

Reviewer name / student ID / GitHub username:
- Name: ALONGKORN KAEWPROM
- Student ID: 67070501050
- GitHub username: Alongkron1234

PRs reviewed (links):
- https://github.com/krittaphato3/TokTickIT/pull/25

Comment received from partner on my PR → my response:
- napatsun (Approved): โดยรวมโอเค ครบถ้วน ทีนี้ถ้าคุณกฤตภาสว่าง ส่งผล npm test มาให้ผมดูหน่อย เดี๋ยวผมมาดูนะ
- krittaphato3 (me): อันนี้คือผลการรัน npm test ครับ (แนบ Screenshot ผลรันในคอมเมนต์ PR)
- Alongkron1234: จากที่ผมดูโค้ดการทำงานทุกอย่างโอเค แต่ว่ามีตรงชื่อไฟล์ tickets.test.ts ที่อาจจะไม่ตรงกับชื่อไฟล์ใน Requirement ที่ได้รับมานะครับ รบกวนเช็คตรงส่วนนี้อีกทีนะ
- krittaphato3 (me): รับทราบครับ จะตรวจสอบละแก้ไขให้
- krittaphato3 (me): ได้ทำการแก้ไขแล้วรบกวนตรวจสอบด้วยนะครับ ขอบคุณครับ (ย้ายไฟล์ทดสอบไปที่ server/tests/lab-02/create-ticket.api.test.ts ตาม requirement)
- Alongkron1234 (Approved): ตรวจสอบแล้วมั้งหมดเรียบร้อยดีมากครับ

Status: MERGED (2026-08-23) — both reviewers approved after the test-file rename fix.

Comment I gave partner on their PR → their response:
-
