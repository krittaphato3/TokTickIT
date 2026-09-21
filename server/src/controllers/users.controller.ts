import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import {
  createUser,
  listUsers,
  setUserInitialPassword,
  updateUser,
} from '../services/users.service.js';

// Lab 3 §9 — Administrator User Management handlers. Authorization was already
// enforced at the router (requireAuth + requireAdminRole); these handlers only
// parse path params and execute the query. The actor id for the update guards
// is taken from req.auth (server-side session identity, BR-03) — never from a
// client-supplied field.

function parseUserIdParam(raw: string | string[]): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function listUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listUsers(getPrisma(), req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await createUser(getPrisma(), req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseUserIdParam(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const actorId = req.auth?.user.id;
    if (actorId === undefined) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const user = await updateUser(getPrisma(), id, req.body, actorId);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function setUserInitialPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseUserIdParam(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const result = await setUserInitialPassword(getPrisma(), id, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
