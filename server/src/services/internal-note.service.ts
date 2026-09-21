import type { PrismaClient } from '@prisma/client';
import { HttpError } from './ticket.service.js';
import { ensureTicketNumberFormat } from './attachment.service.js';

// ---------------------------------------------------------------------------
// Lab 3 §8 — Internal Notes (FR-09, BR-04, BR-14).
//
// Visibility contract (BR-04): IT_STAFF and ADMINISTRATOR read and write;
// REQUESTER access is a MASKED 404 (api-spec §1.5) that is byte-identical to
// a missing ticket — never 403, never note content, never an existence hint.
// The masked body lives here so every handler shares the exact same string.
//
// Append-only (BR-14): no update or delete path exists anywhere. Author and
// createdAt are server-derived; the client cannot set either.
// ---------------------------------------------------------------------------

export const MAX_NOTE_LENGTH = 2000;
export const REQUESTER_MASKED_404 = 'Not found';

export interface NoteAuthorDto {
  id: number;
  name: string;
  role: string;
}

export interface InternalNoteDto {
  id: number;
  body: string;
  author: NoteAuthorDto;
  createdAt: Date;
}

// Masked requester error: identical body whether or not the ticket exists,
// so probing ticket numbers reveals nothing (BR-04 / §1.5).
export function requesterMaskedError(): HttpError {
  return new HttpError(404, REQUESTER_MASKED_404);
}

// Trimmed 1..2000 validation (BR-14) — mirrors the comment contract.
export function validateNoteBody(raw: unknown): string {
  const issues: { field: string; message: string }[] = [];
  if (typeof raw !== 'string') {
    issues.push({ field: 'body', message: 'Note must not be empty' });
  } else {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      issues.push({ field: 'body', message: 'Note must not be empty' });
    } else if (trimmed.length > MAX_NOTE_LENGTH) {
      issues.push({
        field: 'body',
        message: `Note must be at most ${MAX_NOTE_LENGTH} characters`,
      });
    }
  }
  if (issues.length > 0) {
    throw new HttpError(400, 'Validation failed', issues);
  }
  return (raw as string).trim();
}

function toNoteDto(row: {
  id: number;
  body: string;
  createdAt: Date;
  author: { id: number; name: string; role: string };
}): InternalNoteDto {
  return {
    id: row.id,
    body: row.body,
    author: { id: row.author.id, name: row.author.name, role: row.author.role },
    createdAt: row.createdAt,
  };
}

// §8.1 — list notes ascending by createdAt. The caller (router) has already
// refused requesters with the masked 404; this is a pure staff/admin read.
// Absent ticket → the documented "Ticket … does not exist" 404.
export async function listInternalNotes(
  prisma: PrismaClient,
  ticketNumber: string,
): Promise<InternalNoteDto[]> {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    select: { id: true },
  });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  const rows = await prisma.internalNote.findMany({
    where: { ticketId: ticket.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { author: { select: { id: true, name: true, role: true } } },
  });
  return rows.map(toNoteDto);
}

// §8.2 — create a note. Staff/admin on any ticket; author is the session
// user; body is pre-validated (trimmed 1..2000).
export async function createInternalNote(
  prisma: PrismaClient,
  ticketNumber: string,
  author: { id: number; name: string; role: string },
  bodyText: string,
): Promise<InternalNoteDto> {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    select: { id: true },
  });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  const row = await prisma.internalNote.create({
    data: {
      ticketId: ticket.id,
      authorId: author.id,
      body: bodyText,
    },
    include: { author: { select: { id: true, name: true, role: true } } },
  });
  return toNoteDto(row);
}
