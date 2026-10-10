-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolutionSummary" VARCHAR(2000),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "performedById" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(2000) NOT NULL,
    "result" VARCHAR(2000) NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(1000),
    "attachmentNotes" VARCHAR(500),
    "clientRequestId" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ActionTaken_performedById_createdAt_idx" ON "ActionTaken"("performedById", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_performedById_clientRequestId_key" ON "ActionTaken"("performedById", "clientRequestId");

-- CreateIndex
CREATE INDEX "Ticket_ownerId_status_idx" ON "Ticket"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_updatedAt_idx" ON "Ticket"("requesterId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Ticket_itPriority_idx" ON "Ticket"("itPriority");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
