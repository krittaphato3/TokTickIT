import type { PrismaClient, User } from '@prisma/client';
import { HttpError, resolveSessionRequester } from './ticket.service.js';
import { ensureTicketNumberFormat } from './attachment.service.js';

// ---------------------------------------------------------------------------
// Lab 3 Public Comments (api-spec §7) and the BR-05 appears-resolved signal.
//
// Contract highlights:
//  - Append-only: no update or delete route exists for comments (BR-14).
//  - body: trimmed 1..2000 chars; whitespace-only rejected with 400 (BR-14).
//  - author/createdAt are always server-derived (BR-14); the client cannot
//    set them.
//  - Requester: own ticket only; anything else is a masked 404 (§1.5).
//  - IT_STAFF/ADMIN: any ticket (staff alias routes share these handlers).
//  - appearsResolved hint (FR-10/BR-05): Requester-only one-way signal that
//    stamps Ticket.appearsResolvedAt and stores a flagged public comment. It
//    never changes Ticket.status; formal Resolved/Closed stays staff-only.
//  - Requester status writes: ONLY REOPENED from RESOLVED/CLOSED on own
//    tickets (§7.3). RESOLVED/CLOSED targets -> 403
//    "Only IT Staff may resolve or close tickets"; anything else -> 403.
// ---------------------------------------------------------------------------

export const MAX_COMMENT_LENGTH = 2000;
export const ONLY_STAFF_RESOLVE_MESSAGE = 'Only IT Staff may resolve or close tickets';

export interface CommentAuthorDto {
  id: number;
  name: string;
  role: string;
}

export interface PublicCommentDto {
  id: number;
  body: string;
  author: CommentAuthorDto;
  appearsResolved: boolean;
  createdAt: Date;
}

// Guard against admin-supplied appears-resolved hints from non-requester
// callers: the signal belongs to the ticket's requester (FR-10), so staff or
// admin comments must never set or clear it.
export function extractAppearsResolvedHint(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const data = body as Record<string, unknown>;
  return data.appearsResolved === true;
}

// Trimmed 1..2000 validation (BR-14). The LIMIT applies to the trimmed value
// (api-spec §7: "trimmed 1–2000 chars"), so padded-but-valid 2000-char bodies
// pass while whitespace-only bodies are rejected as empty. Returns the stored
// (trimmed) text. Both violations are 400 with field details.
export function validateCommentBody(raw: unknown): string {
  const issues: { field: string; message: string }[] = [];
  if (typeof raw !== 'string') {
    issues.push({ field: 'body', message: 'Comment must not be empty' });
  } else {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      issues.push({ field: 'body', message: 'Comment must not be empty' });
    } else if (trimmed.length > MAX_COMMENT_LENGTH) {
      issues.push({
        field: 'body',
        message: `Comment must be at most ${MAX_COMMENT_LENGTH} characters`,
      });
    }
  }
  if (issues.length > 0) {
    throw new HttpError(400, 'Validation failed', issues);
  }
  return (raw as string).trim();
}

// Authorization-aware ticket resolution for the comment surface (§12):
//  - IT_STAFF/ADMIN: any ticket by number; absent -> 404 (real, unmasked).
//  - REQUESTER: own ticket only; absent OR owned by someone else -> identical
//    masked 404 so cross-requester probing is impossible (§1.5). Ownership is
//    resolved through the SAME linked-requester path as the ticket endpoints
//    (resolveSessionRequester: id-aligned mirror, then case-insensitive email
//    link) — never a raw user.id comparison, because User and Requester ids
//    are only guaranteed equal for seeded mirrors.
//  - The mustChangePassword gate (403) and CSRF (403) already ran globally in
//    app.ts before these handlers; requireAuth guaranteed a session user.
export async function resolveAccessibleTicket(
  prisma: PrismaClient,
  user: { id: number; name: string; email: string; role: string; isActive: boolean },
  ticketNumber: string,
) {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  if (user.role === 'REQUESTER') {
    const requester = await resolveSessionRequester(prisma, user);
    if (ticket.requesterId !== requester.id) {
      throw new HttpError(404, 'Ticket not found');
    }
  }
  return ticket;
}

export function toCommentDto(row: {
  id: number;
  body: string;
  appearsResolved: boolean;
  createdAt: Date;
  author: { id: number; name: string; role: string };
}): PublicCommentDto {
  return {
    id: row.id,
    body: row.body,
    author: { id: row.author.id, name: row.author.name, role: row.author.role },
    appearsResolved: row.appearsResolved,
    createdAt: row.createdAt,
  };
}

// GET comments — ascending by createdAt (api-spec §7.1). Caller passed the
// authorization gate in resolveAccessibleTicket; this is pure read.
export async function listComments(prisma: PrismaClient, ticketId: number): Promise<PublicCommentDto[]> {
  const rows = await prisma.publicComment.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { author: { select: { id: true, name: true, role: true } } },
  });
  return rows.map(toCommentDto);
}

// POST a comment (§7.2). With the appearsResolved hint (Requester only, one
// active signal per episode) the ticket's appearsResolvedAt is stamped inside
// the same transaction as the flagged comment; status is never touched.
export async function createComment(
  prisma: PrismaClient,
  ticketId: number,
  author: User,
  bodyText: string,
  appearsResolved: boolean,
): Promise<PublicCommentDto> {
  const row = await prisma.$transaction(async (tx) => {
    if (appearsResolved) {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (ticket?.appearsResolvedAt) {
        throw new HttpError(409, 'Problem-appears-resolved was already indicated for this ticket');
      }
    }
    const created = await tx.publicComment.create({
      data: {
        ticketId,
        authorId: author.id,
        body: bodyText,
        appearsResolved,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    if (appearsResolved) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { appearsResolvedAt: created.createdAt },
      });
    }
    return created;
  });
  return toCommentDto(row);
}

// §7.3 — requester-limited status change on their OWN ticket. The only
// permitted target is REOPENED from RESOLVED or CLOSED (BR-05 exception).
// Every other target — including RESOLVED and CLOSED — gets the dedicated
// 403 "Only IT Staff may resolve or close tickets" (§7.3 uses one message); a
// non-string value is malformed input -> 400 with details. T-STAT-04 asserts
// the RESOLVED/CLOSED case specifically.
export async function requesterStatusChange(
  prisma: PrismaClient,
  user: User,
  ticketId: number,
  requestedStatus: unknown,
): Promise<{ id: number; ticketNumber: string; status: string; updatedAt: Date }> {
  if (typeof requestedStatus !== 'string') {
    throw new HttpError(400, 'Validation failed', [
      { field: 'status', message: 'status must be a valid ticket status' },
    ]);
  }
  if (requestedStatus !== 'REOPENED') {
    throw new HttpError(403, ONLY_STAFF_RESOLVE_MESSAGE);
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
    throw new HttpError(409, 'Only a Resolved or Closed ticket can be reopened');
  }
  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'REOPENED' },
  });
  return {
    id: updated.id,
    ticketNumber: updated.ticketNumber,
    status: updated.status,
    updatedAt: updated.updatedAt,
  };
}
