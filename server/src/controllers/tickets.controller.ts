import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getPrisma } from '../prisma.js';
import {
  createTicket,
  getTicketDetail,
  listTickets,
  resolveRequester,
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

export async function createTicketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prisma = getPrisma();
    const requester = await resolveRequester(
      prisma,
      req.get('X-Dev-Requester-Id'),
    );
    const ticket = await createTicket(prisma, requester, req.body);
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
    const requester = await resolveRequester(
      prisma,
      req.get('X-Dev-Requester-Id'),
    );
    const result = await listTickets(prisma, requester.id, req.query);
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
    const requester = await resolveRequester(
      prisma,
      req.get('X-Dev-Requester-Id'),
    );
    const ticket = await getTicketDetail(prisma, requester.id, req.params.ticketNumber as string);
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
    const requester = await resolveRequester(prisma, req.get('X-Dev-Requester-Id'));
    const ticketNumber = req.params.ticketNumber as string;
    ensureTicketNumberFormat(ticketNumber);
    const ticket = await resolveOwnedTicket(prisma, requester.id, ticketNumber);
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
    const requester = await resolveRequester(prisma, req.get('X-Dev-Requester-Id'));
    const ticketNumber = req.params.ticketNumber as string;
    const attachmentIdRaw = req.params.attachmentId as string;
    ensureTicketNumberFormat(ticketNumber);
    const attachmentId = ensureAttachmentIdFormat(attachmentIdRaw);
    const ticket = await resolveOwnedTicket(prisma, requester.id, ticketNumber);
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
    const requester = await resolveRequester(prisma, req.get('X-Dev-Requester-Id'));
    const ticketNumber = req.params.ticketNumber as string;
    const attachmentIdRaw = req.params.attachmentId as string;
    ensureTicketNumberFormat(ticketNumber);
    const attachmentId = ensureAttachmentIdFormat(attachmentIdRaw);
    const ticket = await resolveOwnedTicket(prisma, requester.id, ticketNumber);
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