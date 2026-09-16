import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';
import { HttpError } from '../services/ticket.service.js';
import {
  createInternalNote,
  listInternalNotes,
  requesterMaskedError,
  validateNoteBody,
} from '../services/internal-note.service.js';

// Lab 3 §8 — Internal Notes handlers (FR-09, BR-04). The staff router has
// already run requireAuth; these handlers apply the BR-04 visibility split
// themselves: REQUESTER → masked 404 (identical body whether or not the
// ticket exists, §1.5), IT_STAFF/ADMIN → normal staff flow.

function sessionUser(req: Request) {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
  return user;
}

// §8.1 — GET /api/staff/tickets/:ticketNumber/internal-notes
export async function listInternalNotesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    if (user.role === 'REQUESTER') throw requesterMaskedError();
    const notes = await listInternalNotes(
      getPrisma(),
      req.params.ticketNumber as string,
    );
    res.status(200).json(notes);
  } catch (err) {
    next(err);
  }
}

// §8.2 — POST /api/staff/tickets/:ticketNumber/internal-notes
export async function createInternalNoteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    if (user.role === 'REQUESTER') throw requesterMaskedError();
    // Body validation runs BEFORE ticket lookup: malformed input is a 400
    // even for probing callers, and a requester never learns ticket state.
    const bodyText = validateNoteBody((req.body as Record<string, unknown> | undefined)?.body);
    const note = await createInternalNote(
      getPrisma(),
      req.params.ticketNumber as string,
      { id: user.id, name: user.name, role: user.role },
      bodyText,
    );
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
}
