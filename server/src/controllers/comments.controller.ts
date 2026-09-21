import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';
import { HttpError } from '../services/ticket.service.js';
import {
  createComment,
  extractAppearsResolvedHint,
  listComments,
  requesterStatusChange,
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

// PATCH /api/tickets/:ticketNumber/status — §7.3, requester REOPEN-only.
// Staff/admin have their own status surface (§6.4, later issue); reaching this
// requester route with a staff/admin session is a route-use error (403).
export async function requesterStatusChangeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    if (user.role !== 'REQUESTER') {
      throw new HttpError(403, 'Only the ticket requester may use this endpoint');
    }
    const prisma = getPrisma();
    const ticket = await resolveAccessibleTicket(
      prisma,
      user,
      req.params.ticketNumber as string,
    );
    const result = await requesterStatusChange(
      prisma,
      user as never,
      ticket.id,
      (req.body as Record<string, unknown> | undefined)?.status,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
