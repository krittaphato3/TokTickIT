import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import {
  INACTIVE_MESSAGE,
  NOT_AUTHENTICATED,
  loadSession,
  revokeCsrfToken,
} from '../middleware/auth.js';
import { HttpError } from '../services/ticket.service.js';
import {
  createAction,
  ensureActionIdFormat,
  listActions,
  patchAction,
  requireActionsWrite,
  resolveActionsTicket,
} from '../services/action-taken.service.js';

// Lab 4 — Actions Taken handlers (api-spec §2). Session identity is the only
// identity: performedById is server-derived in the service (BR-04) and any
// client-supplied value is ignored there, never here.

// Coded requireAuth variant for the Lab 4 actions surface: identical session,
// inactivity and password-gate semantics to the shared requireAuth, but the
// 401 carries code UNAUTHENTICATED per api-spec §1.4. The shared requireAuth
// is intentionally untouched (A-07: old surfaces keep byte-identical bodies).
export async function requireAuthCoded(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const ctx = req.auth ?? (await loadSession(req));
    if (!ctx) {
      next(new HttpError(401, NOT_AUTHENTICATED, undefined, 'UNAUTHENTICATED'));
      return;
    }
    req.auth = ctx;
    if (!ctx.user.isActive) {
      const prisma = getPrisma();
      await prisma.session.delete({ where: { id: ctx.sessionId } }).catch(() => undefined);
      revokeCsrfToken(ctx.sessionId);
      req.auth = undefined;
      next(new HttpError(403, INACTIVE_MESSAGE));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

function sessionUser(req: Request) {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED, undefined, 'UNAUTHENTICATED');
  return user;
}

// GET /api/tickets/:ticketNumber/actions — §2.1.
export async function listActionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const prisma = getPrisma();
    const ticket = await resolveActionsTicket(prisma, user, req.params.ticketNumber as string);
    const actions = await listActions(prisma, ticket.id);
    res.status(200).json({ ticketNumber: ticket.ticketNumber, actions });
  } catch (err) {
    next(err);
  }
}

// POST /api/tickets/:ticketNumber/actions — §2.2. Duplicate
// (performedById, clientRequestId) replays the original with 200 (BR-06).
export async function createActionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const prisma = getPrisma();
    const ticket = await resolveActionsTicket(prisma, user, req.params.ticketNumber as string);
    requireActionsWrite(user);
    const { action, duplicate } = await createAction(prisma, ticket, user, req.body);
    res.status(duplicate ? 200 : 201).json(action);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/tickets/:ticketNumber/actions/:actionId — §2.3.
export async function patchActionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const prisma = getPrisma();
    const ticket = await resolveActionsTicket(prisma, user, req.params.ticketNumber as string);
    requireActionsWrite(user);
    const actionId = ensureActionIdFormat(req.params.actionId as string);
    const action = await patchAction(prisma, ticket, actionId, req.body);
    res.status(200).json(action);
  } catch (err) {
    next(err);
  }
}
