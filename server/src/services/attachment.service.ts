import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from './ticket.service.js';

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;
export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

export function ensureTicketNumberFormat(ticketNumber: string) {
  if (!/^TTK-\d{4}-\d{6}$/.test(ticketNumber)) {
    throw new HttpError(400, 'Invalid ticket number format');
  }
}

export function ensureAttachmentIdFormat(raw: string) {
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, 'Invalid identifier format');
  }
  return Number(raw);
}

export function getUploadsDir(): string {
  return path.join(process.cwd(), 'uploads');
}

export async function resolveOwnedTicket(
  prisma: PrismaClient,
  requesterId: number,
  ticketNumber: string,
) {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  if (ticket.requesterId !== requesterId)
    throw new HttpError(403, `Ticket ${ticketNumber} does not belong to this requester`);
  return ticket;
}

export async function uploadAttachment(
  prisma: PrismaClient,
  ticketId: number,
  file: Express.Multer.File,
) {
  if (!file) throw new HttpError(400, 'No file provided');
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new HttpError(415, `File type ${file.mimetype} is not supported`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new HttpError(413, 'File exceeds the 5 MB limit');
  }
  const activeCount = await prisma.attachment.count({
    where: { ticketId, removedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
    throw new HttpError(400, 'Attachment limit reached (maximum 5 active attachments per ticket)');
  }
  const storedName = crypto.randomUUID();
  const dir = getUploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, storedName);
  fs.writeFileSync(dest, file.buffer);
  try {
    const row = await prisma.attachment.create({
      data: {
        ticketId,
        fileName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    return row;
  } catch (e) {
    // rollback file on DB failure
    try { fs.unlinkSync(dest); } catch {}
    throw e;
  }
}
