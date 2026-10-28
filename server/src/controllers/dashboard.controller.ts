import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { requireAuthCoded } from './actions.controller.js';
import { getRequesterDashboard, getStaffDashboard } from '../services/dashboard.service.js';

export async function requesterDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.auth?.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const prisma = getPrisma();
    const result = await getRequesterDashboard(prisma, user, req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function staffDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.auth?.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const prisma = getPrisma();
    const result = await getStaffDashboard(prisma, user, req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
