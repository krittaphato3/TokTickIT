-- Issue #13 / GAP-A: make Ticket.relatedSystemId required (NOT NULL) so every
-- ticket references an existing RelatedSystem, per labsheet 4.4 / 5.1 / 6.
ALTER TABLE "Ticket" RENAME COLUMN "systemId" TO "relatedSystemId";

-- No orphan rows: seed data and Issue 4 tests always created tickets with a
-- system attached, so the column can be tightened immediately.
ALTER TABLE "Ticket" ALTER COLUMN "relatedSystemId" SET NOT NULL;

-- Recreate indexes referencing the renamed column.
DROP INDEX "Ticket_systemId_idx";
CREATE INDEX "Ticket_relatedSystemId_idx" ON "Ticket"("relatedSystemId");

-- GAP-B/repair: fix the schema/migration drift that made `prisma migrate dev`
-- prompt for a new migration on a fresh database. Prisma's @updatedAt column
-- must have NO database-level default (Prisma maintains the value instead).
ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" DROP DEFAULT;