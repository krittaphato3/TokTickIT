import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';
import { HttpError } from '../services/ticket.service.js';
import {
  createComment,
  extractAppearsResolvedHint,
  listComments,
  resolveAccessibleTicket,
  validateCommentBody,
} from '../services/comment.service.js';

// Lab 3 — public comment handlers (api-spec §7). Requester identity is the
// session user (BR-03); the tickets router's requireAuth has already run, and
// the global mustChangePassword gate + CSRF middleware in app.ts have already
// gated these paths. resolveAccessibleTicket applies the §12 matrix:
// requester own-only (masked 404), staff/admin any ticket.

function sessionUser(req: Request) {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
  return user;
}

// GET /api/tickets/:ticketNumber/comments (and the staff alias) — §7.1.
export async function listCommentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const prisma = getPrisma();
    const ticket = await resolveAccessibleTicket(
      prisma,
      user,
      req.params.ticketNumber as string,
    );
    const comments = await listComments(prisma, ticket.id);
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
}

// POST /api/tickets/:ticketNumber/comments (and the staff alias) — §7.2.
// `appearsResolved: true` in the body is the BR-05 requester signal; it is
// ignored for non-requester authors (FR-10 belongs to the requester). Body
// validation runs before any ticket lookup so malformed input is a 400 even
// for probing callers without ownership.
export async function createCommentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const bodyText = validateCommentBody(
      (req.body as Record<string, unknown> | undefined)?.body,
    );
    const prisma = getPrisma();
    const ticket = await resolveAccessibleTicket(
      prisma,
      user,
      req.params.ticketNumber as string,
    );
    const appearsResolved =
      user.role === 'REQUESTER' ? extractAppearsResolvedHint(req.body) : false;
    const comment = await createComment(
      prisma,
      ticket.id,
      user as never,
      bodyText,
      appearsResolved,
    );
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

// Lab 4 D-06/BR-09 — PATCH /api/tickets/:ticketNumber/status. Lab 3 let the
// owning Requester reopen a Resolved/Closed ticket; Lab 4 removes that
// capability entirely, so this route stays REGISTERED purely to reject every
// Requester call explicitly and testably (api-spec §3.5).
//
// The role check runs before any lookup, so ownership, ticket existence and the
// requested target are all irrelevant: a Requester always receives the same
// 403 FORBIDDEN body and this route can never leak whether a ticket exists.
// Staff and Admin drive the lifecycle through §3.2 instead.
export const ONLY_IT_STAFF_STATUS_MESSAGE = 'Only IT Staff may change ticket status';

export function requesterStatusChangeHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const user = sessionUser(req);
    if (user.role === 'REQUESTER') {
      throw new HttpError(403, ONLY_IT_STAFF_STATUS_MESSAGE, undefined, 'FORBIDDEN');
    }
    throw new HttpError(403, 'Only the ticket requester may use this endpoint');
  } catch (err) {
    next(err);
  }
}
