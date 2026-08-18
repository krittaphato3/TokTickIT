# Lab 2 AI Use and Reflection

I used ZCODE Harness + VSCODE. Model: [Deepseek V4 Flash 0731]. Thinking level: [Max].

Selected Key Prompts:

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| Plan Lab 2 Database Schema | Read the enclosed Lab 2 specification and the existing Lab 1 Prisma schema. List every new model, enum, relationship, and seed record needed. Propose the migration order and any idempotency strategy. Do not write code yet. | I provided the Lab 2 specification and the existing Lab 1 schema to establish the data model boundaries. This was important because the new models (Requester, Ticket, Attachment, RelatedSystem, TicketRelatedSystem) depend on each other and on the existing Category table. |
| Design Issue 2 Schema | Create the Prisma schema for Issue 2: Requester, Ticket with Status/Priority enums, Attachment with soft-removal, RelatedSystem, and TicketRelatedSystem join table. Include all indexes from the specification. Reuse Category unchanged. | The AI drafted the full schema. I corrected the ticketNumber column to VARCHAR(20) to match the TTK-YYYY-000000 format, ensured all foreign keys use Restrict for Ticket.requesterId/categoryId, and verified Cascade on Attachment/TicketRelatedSystem deletes. |
| Implement Idempotent Seed | Write an idempotent Prisma seed script for Issue 2. Seed: 4 categories (Lab 1), 4 active Development Requesters (Alpha-Delta), 1 inactive Requester (Epsilon), and 7 Related Systems. Use upsert keyed on unique fields. | I specified the exact seed data from the labsheet and enforced idempotency via upsert. The AI correctly used email for requesters and name for categories/systems. I verified Epsilon is seeded with isActive: false for the 403 test path. |
| Write Migration SQL | Write the initial migration SQL for Issue 2 that creates all new tables, enums, indexes, and seed inserts. Ensure it is safe to run on a clean PostgreSQL database and preserves the existing Category table. | The AI generated the raw SQL migration. I reviewed it for correct enum creation, foreign key constraints, composite primary key on TicketRelatedSystem, and the ticket_number_seq. I added ON CONFLICT clauses to the seed inserts so the migration is idempotent. |

---

## My Reflection

The AI coding agent significantly accelerated the implementation of Issue 2's database schema. What would have been tedious manual schema design was condensed into a single prompt-response cycle where I provided the Lab 2 specification and the AI generated the complete Prisma schema and migration SQL. The AI was particularly effective at generating the raw SQL migration with correct enum types, foreign key constraints, and indexes.

However, I retained full responsibility for the data model. I corrected the ticketNumber column type to VARCHAR(20) to match the TTK-YYYY-000000 format, verified that Cascade deletes were only applied where appropriate (Attachment and TicketRelatedSystem), and ensured Restrict was used for requesterId and categoryId to prevent accidental data loss. I also added the ON CONFLICT clauses to the seed inserts to make the migration idempotent.

In conclusion, the AI served as an efficient schema generator, but the final schema reflects my judgment about referential integrity, naming conventions, and seed idempotency. Every model, enum, and index was reviewed against the Lab 2 specification to ensure correctness.