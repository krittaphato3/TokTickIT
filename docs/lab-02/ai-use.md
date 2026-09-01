# Lab 2 AI Use and Reflection

I used ZCODE Harness + VS Code. Model: **Deepseek V4 Flash 0731, Muse Spark 1.2** (Thinking: Medium-High). Prompts are summarized; reflections are my verification. 11 PRs counted (#20–#34, #33 CONTENT DELETED excluded; Lab 1 release #19 excluded).

## Selected Key Prompts — one per counted PR

| Issue | Prompt Name | Actual Prompt Text (summarized) | My Reflection |
|---|---|---|---|
| #10 — PR #20 | Lock Lab 2 Specs | "Read labsheet + Lab 1 docs. Draft specification.md, api-spec.md, ui-spec.md, tests.md with fixed constraints (4 MIME, 5 cap, 4+1 requesters, TTK-YYYY-NNNNNN). No code." | AI drafted 4 docs together. I verified traceability and fixed cross-doc gaps (api-spec 1.1 /api/related-systems, ui-spec 6→7 cols) per commit b645078. |
| #11 — PR #21 | Lab 2 Schema & Seed | "Read spec + Lab 1 schema. Add Requester, Ticket, Attachment (removedAt), RelatedSystem, enums, indexes, idempotent seed (4 cats, 7 systems, 4+1 requesters) and migration." | AI added Many-to-Many join. Reviewer flagged 1—N; I kept One-to-Many fix (Ticket.relatedSystemId FK) in 28d8a2e before merge. |
| #22 — PR #23 | Fix FK Ordering | "Fix P3018: reorder migration so RelatedSystem is created before Ticket.systemId FK; add @@index([systemId]); align docs to One-to-Many." | Migration failed without reorder. I applied AI-reordered DDL and synced spec/tests to single FK; reviewer verified green. |
| #12 — PR #24 | Requester Context | "Implement GET /api/requesters (active only) + app-shell selector with 'Testing only — not real authentication', localStorage persist, and UI-07/API-21 tests." | AI placed selector in navbar. I verified active-only contract, localStorage restore, and lint/build gates. |
| #13 — PR #25 | Ticket Creation API | "Add POST /api/tickets with header 400/401/403, TTK-YYYY-NNNNNN sequence, and failing tests first at mandated paths (create-ticket.api.test.ts etc)." | GAP fix required relatedSystemId. I moved tests to mandated paths, added GET /api/related-systems and required FK migration d2cf609. |
| #14 — PR #26 | Create Ticket UI | "Build Create Ticket screen from Zen Green mockup: 4 sections, validation, busy submit guard, responsive 375/800/1280, a11y." | Pixel replication; I kept density (15px) and verified responsive screenshots + 16/16 client tests. |
| #15 — PR #27 | My Tickets API | "Implement GET /api/tickets (ILIKE search + AND filters + rank sort + pagination) with failing tests API-07..11,20 first." | Parallel Vitest flake fixed with `fileParallelism:false`. Reviewer probe found wildcard count bug; fixed with shared escaped ILIKE fragment ddfd1df. |
| #16 — PR #28 | My Tickets UI | "Implement My Tickets toolbar, responsive table/cards, pagination, distinct empty states, badges; tests UI-04..06,10,11 first." | I fixed requester-switch reset (keyed remount) and capped pagination window to 5 after review. |
| #30 — PR #31 | My Tickets v2 + Polish | "Additive v2: nullable itPriority/ownerName, itPriority/status filters, ticketNumber search/sort, 9-col fluid table + responsive width polish (1080/760/100%) and ownerName stamp." | Stale Prisma client (OPEN not found) fixed by rebuild; verification 68/68 server, 36/36 client, no V-scroll at 1280×800. |
| #17 — PR #32 | Ticket Detail & Attachments | "Implement GET /api/tickets/:ticketNumber + attachments (Multer memory, 5MB/allowlist/5-cap, crypto.randomUUID, soft-remove via removedAt) and detail/AttachmentSection UI." | AI kept grayed metadata with local removed set. I verified byte-identical download and 403/404 separation per docs. |
| #18 — PR #34 | E2E & Visual Checklist | "Write Playwright flows (create→list→detail, 403 isolation, double-click guard, responsive 375/800/1280) and generate artifacts/lab-02/screenshots/**." | Replaced if...throw + waitForTimeout with `await expect` auto-wait per reviewer atiwit (commit 22ad482); flake removed. |

## My Reflection

AI sped up schema/migration and boilerplate UI, but I owned contracts. I fixed FK ordering, required `relatedSystemId`, enforced header 400/401/403 via failing tests first, and caught cross-query bugs (ILIKE count, pagination window) through reproduction. I let AI generate, I verified against labsheet and merged only after green gates.
