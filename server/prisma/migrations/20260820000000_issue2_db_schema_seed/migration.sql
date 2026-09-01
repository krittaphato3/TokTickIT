-- Issue 2: Database Schema and Seed Data
-- Adds Lab 2 models: Requester, Ticket (with Status/Priority enums),
-- Attachment, RelatedSystem.
-- Changes Ticket -> RelatedSystem from Many-to-Many to One-to-Many via systemId FK.
-- Reuses the existing Category table from Lab 1 unchanged.

CREATE TYPE "Status" AS ENUM ('NEW');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "Requester" (
  "id"        SERIAL       NOT NULL,
  "name"      TEXT         NOT NULL,
  "email"     TEXT         NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Requester_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Requester_email_key" UNIQUE ("email")
);

CREATE TABLE "RelatedSystem" (
  "id"        SERIAL       NOT NULL,
  "name"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RelatedSystem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RelatedSystem_name_key" UNIQUE ("name")
);

CREATE TABLE "Ticket" (
  "id"           SERIAL       NOT NULL,
  "ticketNumber" VARCHAR(20)  NOT NULL,
  "title"        VARCHAR(120) NOT NULL,
  "description"  TEXT,
  "status"       "Status"     NOT NULL DEFAULT 'NEW',
  "priority"     "Priority"   NOT NULL DEFAULT 'MEDIUM',
  "requesterId"  INT          NOT NULL,
  "categoryId"   INT          NOT NULL,
  "systemId"     INT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Ticket_ticketNumber_key" UNIQUE ("ticketNumber"),
  CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Requester"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Ticket_categoryId_fkey"  FOREIGN KEY ("categoryId")  REFERENCES "Category"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Ticket_systemId_fkey"    FOREIGN KEY ("systemId")    REFERENCES "RelatedSystem"("id") ON DELETE Restrict ON UPDATE CASCADE
);

CREATE TABLE "Attachment" (
  "id"         SERIAL       NOT NULL,
  "ticketId"   INT          NOT NULL,
  "fileName"   TEXT         NOT NULL,
  "storedName" TEXT         NOT NULL,
  "mimeType"   TEXT         NOT NULL,
  "sizeBytes"  INT          NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt"  TIMESTAMP(3),

  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Attachment_storedName_key" UNIQUE ("storedName")
);

-- Indexes for common query patterns
CREATE INDEX "Ticket_requesterId_createdAt_idx" ON "Ticket"("requesterId", "createdAt" DESC);
CREATE INDEX "Ticket_categoryId_idx"         ON "Ticket"("categoryId");
CREATE INDEX "Ticket_priority_idx"            ON "Ticket"("priority");
CREATE INDEX "Ticket_systemId_idx"            ON "Ticket"("systemId");
CREATE INDEX "Attachment_ticketId_idx"        ON "Attachment"("ticketId");

-- Ticket number sequence (shared globally)
CREATE SEQUENCE "ticket_number_seq" START 1;

-- Seed Development Requesters (idempotent)
INSERT INTO "Requester" ("id", "name", "email", "isActive")
VALUES
  (1, 'Dev User Alpha', 'alpha@toktickit.test', true),
  (2, 'Dev User Beta',  'beta@toktickit.test',  true),
  (3, 'Dev User Gamma', 'gamma@toktickit.test', true),
  (4, 'Dev User Delta', 'delta@toktickit.test', true),
  (5, 'Dev User Epsilon', 'epsilon@toktickit.test', false)
ON CONFLICT ("email") DO UPDATE SET
  "name"     = EXCLUDED."name",
  "isActive" = EXCLUDED."isActive";

-- Seed Related Systems (idempotent)
INSERT INTO "RelatedSystem" ("name")
VALUES
  ('Email Server'),
  ('VPN Gateway'),
  ('Printer'),
  ('Database Server'),
  ('File Server'),
  ('Active Directory'),
  ('Web Application')
ON CONFLICT ("name") DO NOTHING;
