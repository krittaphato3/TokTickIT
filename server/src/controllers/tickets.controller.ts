import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getPrisma } from '../prisma.js';
import {
  createTicket,
  getTicketDetail,
  listTickets,
  resolveSessionRequester,
  HttpError,
} from '../services/ticket.service.js';
import {
  ensureAttachmentIdFormat,
  ensureTicketNumberFormat,
  getUploadsDir,
  resolveOwnedTicket,
  uploadAttachment,
  ALLOWED_MIME,
} from '../services/attachment.service.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';

// Lab 3 — "Do not trust client-supplied requester identity" (BR-03).
// Every handler below derives the requester server-side from req.auth.user
// (populated by optionalAuth + enforced by requireAuth on the tickets router).
// The legacy X-Dev-Requester-Id header and any body requester identity are
// never read for authorization; their presence only emits a server-side
// warning so stale Lab 2 clients are visible in logs.
function warnOnUntrustedIdentity(req: Request): void {
  if (req.get('X-Dev-Requester-Id') !== undefined) {
    console.warn(
      '[tickets] ignoring client-supplied X-Dev-Requester-Id header; using session identity',
    );
  }
}

async function sessionRequesterId(
  req: Request,
  opts?: { createIfMissing?: boolean },
): Promise<number> {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
  warnOnUntrustedIdentity(req);
  const requester = await resolveSessionRequester(getPrisma(), user, opts);
  return requester.id;
}

export async function createTicketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    // Creating as requester-self provisions the linked row when the session
    // user has none yet (AD-03); all other handlers are read-scoped or act on
    // an already-owned ticket and must not write to the Requester table.
    const requesterId = await sessionRequesterId(req, { createIfMissing: true });
    const ticket = await createTicket(
      prisma,
      { id: requesterId, name: req.auth?.user?.name ?? '' },
      req.body,
    );
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function listTicketsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requesterId = await sessionRequesterId(req);
    const result = await listTickets(prisma, requesterId, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTicketDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requesterId = await sessionRequesterId(req);
    const ticket = await getTicketDetail(prisma, requesterId, req.params.ticketNumber as string);
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function uploadAttachmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requesterId = await sessionRequesterId(req);
    const ticketNumber = req.params.ticketNumber as string;
    ensureTicketNumberFormat(ticketNumber);
    const ticket = await resolveOwnedTicket(prisma, requesterId, ticketNumber);
    // multer memory: file in req.file
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, 'No file provided');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new HttpError(415, `File type ${file.mimetype} is not supported`);
    }
    // multer limit already checks 5MB; double-check for direct calls
    if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'File exceeds the 5 MB limit');
    const row = await uploadAttachment(prisma, ticket.id, file);
    res.status(201).json({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
      removedAt: row.removedAt,
    });
  } catch (err) {
    // Multer fileSize limit
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(413, 'File exceeds the 5 MB limit'));
      return;
    }
    next(err);
  }
}

export async function downloadAttachmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requesterId = await sessionRequesterId(req);
    const ticketNumber = req.params.ticketNumber as string;
    const attachmentIdRaw = req.params.attachmentId as string;
    ensureTicketNumberFormat(ticketNumber);
    const attachmentId = ensureAttachmentIdFormat(attachmentIdRaw);
    const ticket = await resolveOwnedTicket(prisma, requesterId, ticketNumber);
    const att = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId: ticket.id },
    });
    if (!att) throw new HttpError(404, 'Attachment not found');
    if (att.removedAt) throw new HttpError(404, 'Attachment has been removed');
    const filePath = path.join(getUploadsDir(), att.storedName);
    if (!fs.existsSync(filePath)) throw new HttpError(404, 'Attachment not found');
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${att.fileName}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteAttachmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requesterId = await sessionRequesterId(req);
    const ticketNumber = req.params.ticketNumber as string;
    const attachmentIdRaw = req.params.attachmentId as string;
    ensureTicketNumberFormat(ticketNumber);
    const attachmentId = ensureAttachmentIdFormat(attachmentIdRaw);
    const ticket = await resolveOwnedTicket(prisma, requesterId, ticketNumber);
    const att = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId: ticket.id },
    });
    if (!att) throw new HttpError(404, 'Attachment not found');
    if (att.removedAt) throw new HttpError(404, 'Attachment has already been removed');
    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: { removedAt: new Date() },
    });
    res.status(200).json({
      id: updated.id,
      fileName: updated.fileName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
      uploadedAt: updated.uploadedAt,
      removedAt: updated.removedAt,
    });
  } catch (err) {
    next(err);
  }
}
