-- Attachment audit ledger + restore + SHA-256.
-- Additive only: new AttachmentEvent table, new nullable columns on Attachment.
-- Existing rows keep sha256 NULL (client shows checksum only when present); seed untouched.

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "sha256" TEXT,
ADD COLUMN "removeReason" TEXT,
ADD COLUMN "removeNote" TEXT;

-- CreateTable
CREATE TABLE "AttachmentEvent" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "attachmentId" INTEGER,
    "type" TEXT NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AttachmentEvent" ADD CONSTRAINT "AttachmentEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AttachmentEvent_ticketId_idx" ON "AttachmentEvent"("ticketId");
CREATE INDEX "AttachmentEvent_ticketId_createdAt_idx" ON "AttachmentEvent"("ticketId", "createdAt" DESC);
