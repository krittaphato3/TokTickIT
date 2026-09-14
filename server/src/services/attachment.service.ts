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

export const ATTACHMENT_EVENT_TYPES = ['UPLOAD', 'REMOVE', 'RESTORE', 'DOWNLOAD'] as const;
export type AttachmentEventType = (typeof ATTACHMENT_EVENT_TYPES)[number];

export const REMOVE_REASON_CODES = [
  'Duplicate',
  'Obsolete',
  'Sensitive content',
  'Uploaded in error',
  'Other',
] as const;
export type RemoveReasonCode = (typeof REMOVE_REASON_CODES)[number];

export const MAX_REMOVE_NOTE_LENGTH = 200;

export interface AttachmentActor {
  id: number;
  name: string;
}

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

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function validateRemoveBody(body: unknown): {
  reasonCode: string | null;
  note: string | null;
} {
  if (body === undefined || body === null) {
    return { reasonCode: null, note: null };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid JSON body');
  }
  const data = body as Record<string, unknown>;
  const issues: { field: string; message: string }[] = [];

  let reasonCode: string | null = null;
  if (data.reasonCode !== undefined && data.reasonCode !== null) {
    if (typeof data.reasonCode !== 'string' || !(REMOVE_REASON_CODES as readonly string[]).includes(data.reasonCode)) {
      issues.push({
        field: 'reasonCode',
        message: `reasonCode must be one of ${REMOVE_REASON_CODES.join(', ')}`,
      });
    } else {
      reasonCode = data.reasonCode;
    }
  }

  let note: string | null = null;
  if (data.note !== undefined && data.note !== null) {
    if (typeof data.note !== 'string') {
      issues.push({ field: 'note', message: 'note must be a string' });
    } else if (data.note.length > MAX_REMOVE_NOTE_LENGTH) {
      issues.push({
        field: 'note',
        message: `note must be ${MAX_REMOVE_NOTE_LENGTH} characters or fewer`,
      });
    } else {
      note = data.note;
    }
  }

  if (issues.length > 0) {
    throw new HttpError(400, 'Validation failed', issues);
  }
  return { reasonCode, note };
}

export function toAttachmentDto(row: {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  uploadedAt: Date;
  removedAt: Date | null;
  removeReason: string | null;
  removeNote: string | null;
}) {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploadedAt: row.uploadedAt,
    removedAt: row.removedAt,
    removeReason: row.removeReason,
    removeNote: row.removeNote,
  };
}

export async function recordAttachmentEvent(
  prisma: PrismaClient,
  event: {
    ticketId: number;
    attachmentId: number | null;
    type: AttachmentEventType;
    actor: AttachmentActor | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string | null;
    reason?: string | null;
    note?: string | null;
  },
) {
  return prisma.attachmentEvent.create({
    data: {
      ticketId: event.ticketId,
      attachmentId: event.attachmentId,
      type: event.type,
      actorId: event.actor?.id ?? null,
      actorName: event.actor?.name ?? '',
      fileName: event.fileName,
      mimeType: event.mimeType,
      sizeBytes: event.sizeBytes,
      sha256: event.sha256,
      reason: event.reason ?? null,
      note: event.note ?? null,
    },
  });
}

async function emitAuditEvent(
  prisma: PrismaClient,
  event: Parameters<typeof recordAttachmentEvent>[1],
): Promise<void> {
  try {
    await recordAttachmentEvent(prisma, event);
  } catch (err) {
    console.error('[attachments] failed to record audit event', err);
  }
}

export async function resolveOwnedTicket(
  prisma: PrismaClient,
  requesterId: number,
  ticketNumber: string,
) {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  // Masked 404 (api-spec §1.5): absent and cross-owner are indistinguishable
  // so Requester A cannot probe Requester B's ticket numbers. No 403 here.
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  if (ticket.requesterId !== requesterId)
    throw new HttpError(404, 'Ticket not found');
  return ticket;
}

export async function uploadAttachment(
  prisma: PrismaClient,
  ticketId: number,
  file: Express.Multer.File,
  actor?: AttachmentActor | null,
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
  const sha256 = computeSha256(file.buffer);
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
        sha256,
      },
    });
    await emitAuditEvent(prisma, {
      ticketId,
      attachmentId: row.id,
      type: 'UPLOAD',
      actor: actor ?? null,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
    });
    return row;
  } catch (e) {
    // rollback file on DB failure
    try { fs.unlinkSync(dest); } catch {}
    throw e;
  }
}

export async function removeAttachment(
  prisma: PrismaClient,
  ticketId: number,
  attachmentId: number,
  actor?: AttachmentActor | null,
  reasonCode?: string | null,
  note?: string | null,
) {
  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, ticketId },
  });
  if (!att) throw new HttpError(404, 'Attachment not found');
  if (att.removedAt) throw new HttpError(404, 'Attachment has already been removed');
  const updated = await prisma.attachment.update({
    where: { id: attachmentId },
    data: {
      removedAt: new Date(),
      removeReason: reasonCode ?? null,
      removeNote: note ?? null,
    },
  });
  await emitAuditEvent(prisma, {
    ticketId,
    attachmentId: updated.id,
    type: 'REMOVE',
    actor: actor ?? null,
    fileName: updated.fileName,
    mimeType: updated.mimeType,
    sizeBytes: updated.sizeBytes,
    sha256: updated.sha256,
    reason: reasonCode ?? null,
    note: note ?? null,
  });
  return updated;
}

export async function restoreAttachment(
  prisma: PrismaClient,
  ticketId: number,
  attachmentId: number,
  actor?: AttachmentActor | null,
) {
  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, ticketId },
  });
  if (!att) throw new HttpError(404, 'Attachment not found');
  if (!att.removedAt) throw new HttpError(404, 'Attachment is not removed');
  const activeCount = await prisma.attachment.count({
    where: { ticketId, removedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
    throw new HttpError(409, 'Attachment limit reached (maximum 5 active attachments per ticket)');
  }
  const updated = await prisma.attachment.update({
    where: { id: attachmentId },
    data: { removedAt: null, removeReason: null, removeNote: null },
  });
  await emitAuditEvent(prisma, {
    ticketId,
    attachmentId: updated.id,
    type: 'RESTORE',
    actor: actor ?? null,
    fileName: updated.fileName,
    mimeType: updated.mimeType,
    sizeBytes: updated.sizeBytes,
    sha256: updated.sha256,
    reason: att.removeReason,
    note: att.removeNote,
  });
  return updated;
}

export interface AttachmentEventDto {
  id: number;
  type: string;
  at: Date;
  createdAt: Date;
  by: string;
  actorName: string;
  file: {
    id: number | null;
    name: string;
    size: number;
    mime: string;
    sha: string | null;
  };
  reason?: string | null;
  note?: string | null;
  ref?: number | null;
}

export async function listAttachmentEvents(
  prisma: PrismaClient,
  ticketId: number,
): Promise<AttachmentEventDto[]> {
  const rows = await prisma.attachmentEvent.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const refByRestoreId = new Map<number, number | null>();
  for (const restore of rows) {
    if (restore.type !== 'RESTORE' || restore.attachmentId === null) continue;
    const priorRemove = await prisma.attachmentEvent.findFirst({
      where: {
        ticketId,
        attachmentId: restore.attachmentId,
        type: 'REMOVE',
        id: { lt: restore.id },
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    refByRestoreId.set(restore.id, priorRemove?.id ?? null);
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    at: r.createdAt,
    createdAt: r.createdAt,
    by: r.actorName,
    actorName: r.actorName,
    file: {
      id: r.attachmentId,
      name: r.fileName,
      size: r.sizeBytes,
      mime: r.mimeType,
      sha: r.sha256,
    },
    reason: r.reason,
    note: r.note,
    ...(r.type === 'RESTORE' ? { ref: refByRestoreId.get(r.id) ?? null } : {}),
  }));
}
