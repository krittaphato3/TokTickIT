import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { NOT_AUTHENTICATED } from '../middleware/auth.js';
import { HttpError } from '../services/ticket.service.js';
import {
  changeTicketOwner,
  changeTicketStatus,
  getStaffTicketDetail,
  setItPriority,
} from '../services/staff-ticket.service.js';

// Lab 3 §6 — IT Staff ticket operations handlers. The staff router has
// already run requireAuth; the per-route requireStaffRole gate refused
// requesters with 403 before any handler below executes (BR-20). Handlers
// re-derive nothing from the client: ticket number comes from the path, the
// actor from req.auth.user, and every write re-checks the IT_STAFF gate in
// the service layer so a router regression cannot become a hole.

function sessionUser(req: Request) {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, NOT_AUTHENTICATED);
  return user;
}

// §6.1 — GET /api/staff/tickets/:ticketNumber (IT_STAFF + ADMIN read).
export async function getStaffTicketDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sessionUser(req);
    const ticket = await getStaffTicketDetail(
      getPrisma(),
      req.params.ticketNumber as string,
    );
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

// §6.2 — PATCH /api/staff/tickets/:ticketNumber/owner (IT_STAFF only).
export async function changeTicketOwnerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await changeTicketOwner(
      getPrisma(),
      user as never,
      req.params.ticketNumber as string,
      body.ownerId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// §6.3 — PATCH /api/staff/tickets/:ticketNumber/it-priority (IT_STAFF only).
export async function setItPriorityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await setItPriority(
      getPrisma(),
      user as never,
      req.params.ticketNumber as string,
      body.itPriority,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// §6.4 — PATCH /api/staff/tickets/:ticketNumber/status (IT_STAFF only).
export async function changeTicketStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = sessionUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await changeTicketStatus(
      getPrisma(),
      user as never,
      req.params.ticketNumber as string,
      body.status,
      body.confirm,
      body.reason,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
