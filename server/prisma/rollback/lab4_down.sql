-- Lab 4 rollback: lab4_actions_taken (20261010184431_lab4_actions_taken).
-- Drops exactly the Lab 4 additions and deletes the _prisma_migrations row so
-- `npx prisma migrate deploy` re-applies. Touches no Lab 1-3 table, column or
-- row. Executed by server/tests/lab-04/migration-regression.test.ts (MIG-02).

-- Drop the ActionTaken foreign keys (names pinned from the applied migration).
ALTER TABLE "ActionTaken" DROP CONSTRAINT IF EXISTS "ActionTaken_ticketId_fkey";
ALTER TABLE "ActionTaken" DROP CONSTRAINT IF EXISTS "ActionTaken_performedById_fkey";

-- Drop the ActionTaken table (removes its indexes and unique constraint).
DROP TABLE IF EXISTS "ActionTaken";

-- Drop the added Ticket composite indexes (names pinned from the migration).
DROP INDEX IF EXISTS "Ticket_ownerId_status_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_updatedAt_idx";
DROP INDEX IF EXISTS "Ticket_itPriority_idx";

-- Drop the added Ticket columns.
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolutionSummary";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

-- Forget the migration so `migrate deploy` re-applies it.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261010184431_lab4_actions_taken';
