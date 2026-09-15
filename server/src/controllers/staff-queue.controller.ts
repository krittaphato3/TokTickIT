import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { listQueueOwners, listStaffTickets } from '../services/staff-queue.service.js';

// Lab 3 §5 — IT Staff Ticket Queue handlers. Authorization was already
// enforced at the router (requireAuth + requireStaffRole); these handlers
// only execute the query. No handler below ever reads a client-supplied
// requester identity (BR-03): the queue is cross-ticket by role, not by any
// client value, and the legacy X-Dev-Requester-Id header is ignored.

export async function listStaffTicketsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listStaffTickets(getPrisma(), req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listQueueOwnersHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const owners = await listQueueOwners(getPrisma());
    res.status(200).json(owners);
  } catch (err) {
    next(err);
  }
}
