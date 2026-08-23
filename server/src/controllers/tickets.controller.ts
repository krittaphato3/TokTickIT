import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import {
  createTicket,
  resolveRequester,
} from '../services/ticket.service.js';

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
    const ticket = await createTicket(prisma, requester.id, req.body);
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}