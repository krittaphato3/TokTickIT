import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getPrisma } from '../prisma.js';
import { HttpError } from '../services/ticket.service.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';
import {
  ensureAttachmentIdFormat,
  ensureTicketNumberFormat,
  getUploadsDir,
  recordAttachmentEvent,
} from '../services/attachment.service.js';
import type { AttachmentActor } from '../services/attachment.service.js';

// Lab 3 §7.3 (ui-spec) — staff attachment viewer download. Staff/Admin read
// any ticket's attachment (§12: staff ticket read ✓); upload/remove stay
// requester-owned (Lab 2 regression + ui-spec "no new upload from staff
// view"). Audit events reuse the shared ledger so the requester audit trail
// stays complete.

function sessionActor(req: Request): AttachmentActor {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
  return { id: user.id, name: user.name || user.email };
}

export async function getStaffTicketDownloadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.auth?.user;
    if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
    const prisma = getPrisma();
    const ticketNumber = req.params.ticketNumber as string;
    const attachmentId = ensureAttachmentIdFormat(req.params.attachmentId as string);
    ensureTicketNumberFormat(ticketNumber);

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      select: { id: true },
    });
    // §1.5 — absent ticket is the documented unmasked staff 404.
    if (!ticket) throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);

    const att = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId: ticket.id },
    });
    if (!att) throw new HttpError(404, 'Attachment not found');
    if (att.removedAt) throw new HttpError(404, 'Attachment has been removed');

    const filePath = path.join(getUploadsDir(), att.storedName);
    if (!fs.existsSync(filePath)) throw new HttpError(404, 'Attachment not found');

    // Audit the download without breaking the stream on ledger failure.
    try {
      await recordAttachmentEvent(prisma, {
        ticketId: ticket.id,
        attachmentId: att.id,
        type: 'DOWNLOAD',
        actor: sessionActor(req),
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        sha256: att.sha256,
      });
    } catch {
      // never break streaming on audit failure
    }

    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${att.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}
