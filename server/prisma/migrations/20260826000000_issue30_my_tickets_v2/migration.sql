-- Issue #30 / My Tickets v2: purely additive schema extension (D-16, D-17).
-- 1. Extend the Status enum in place; every existing row is already NEW, so
--    no backfill is needed. BR-02 is unchanged: ticket creation still
--    defaults to NEW.
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'RESOLVED';

-- 2. IT-side display fields (nullable, denormalized for this sprint; the real
--    IT Staff relation arrives in a later lab — decision D-16). Existing
--    columns, indexes, and constraints are untouched.
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";
ALTER TABLE "Ticket" ADD COLUMN "ownerName" TEXT;
