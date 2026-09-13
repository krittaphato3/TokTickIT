import { randomBytes, createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../prisma.js';
import { getCookie } from './cookies.js';
import { HttpError } from '../services/ticket.service.js';

export const SESSION_COOKIE = 'toktickit.sid';
export const INACTIVE_MESSAGE = 'Account is inactive. Contact an administrator.';
export const NOT_AUTHENTICATED = 'Not authenticated';
export const PASSWORD_CHANGE_REQUIRED = 'Password change required';
export const PASSWORD_CHANGE_CODE = 'password_change_required';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const DUMMY_HASH = bcrypt.hashSync('DummyTimingPassword123!', 12);

const csrfBySession = new Map<string, string>();

export function getCsrfToken(sessionId: string): string | undefined {
  return csrfBySession.get(sessionId);
}

export function issueCsrfToken(sessionId: string): string {
  const token = randomBytes(32).toString('hex');
  csrfBySession.set(sessionId, token);
  return token;
}

export function revokeCsrfToken(sessionId: string): void {
  csrfBySession.delete(sessionId);
}

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).digest('hex');
}

export function safeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}): {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
} {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function constantTimePasswordCheck(
  plaintext: string,
  realHash: string | null,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, realHash ?? DUMMY_HASH);
  } catch {
    return false;
  }
}

export interface AuthContext {
  sessionId: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
    passwordHash: string;
  };
  csrfToken: string | undefined;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function loadSession(req: Request): Promise<AuthContext | null> {
  const sessionId = getCookie(req, SESSION_COOKIE);
  if (!sessionId) return null;
  if (!/^[0-9a-f]{64}$/i.test(sessionId)) return null;
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  const now = new Date();
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    revokeCsrfToken(sessionId);
    return null;
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    revokeCsrfToken(sessionId);
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    revokeCsrfToken(sessionId);
    return null;
  }
  const refreshedExpiresAt = new Date(
    Math.min(now.getTime() + SESSION_TTL_MS, session.absoluteExpiresAt.getTime()),
  );
  if (refreshedExpiresAt.getTime() !== session.expiresAt.getTime()) {
    await prisma.session
      .update({ where: { id: sessionId }, data: { expiresAt: refreshedExpiresAt } })
      .catch(() => undefined);
  }
  return {
    sessionId,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      passwordHash: user.passwordHash,
    },
    csrfToken: csrfBySession.get(sessionId),
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.auth = (await loadSession(req)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const ctx = req.auth ?? (await loadSession(req));
    if (!ctx) {
      next(new HttpError(401, NOT_AUTHENTICATED));
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

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const ctx = req.auth;
  if (!ctx) {
    next(new HttpError(401, NOT_AUTHENTICATED));
    return;
  }
  const sent = req.get('X-CSRF-Token');
  const expected = csrfBySession.get(ctx.sessionId);
  if (!sent || !expected || sent !== expected) {
    next(new HttpError(403, 'Invalid CSRF token'));
    return;
  }
  next();
}

const AUTH_ALLOWLIST: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/auth/me' },
  { method: 'POST', path: '/api/auth/change-password' },
  { method: 'POST', path: '/api/auth/forgot-password' },
  { method: 'POST', path: '/api/auth/logout' },
];

export async function mustChangePasswordGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }
    const isAllowed = AUTH_ALLOWLIST.some(
      (r) => r.method === req.method && req.path === r.path,
    );
    if (isAllowed) {
      next();
      return;
    }
    let ctx = req.auth;
    if (!ctx) {
      const sid = getCookie(req, SESSION_COOKIE);
      if (!sid) {
        next();
        return;
      }
      ctx = (await loadSession(req)) ?? undefined;
      if (ctx) req.auth = ctx;
    }
    if (!ctx) {
      next();
      return;
    }
    const prisma = getPrisma();
    const fresh = await prisma.user.findUnique({ where: { id: ctx.user.id } });
    const mustChange = fresh ? fresh.mustChangePassword : ctx.user.mustChangePassword;
    if (fresh) {
      ctx.user.mustChangePassword = fresh.mustChangePassword;
      ctx.user.isActive = fresh.isActive;
    }
    if (!mustChange) {
      next();
      return;
    }
    res
      .status(403)
      .json({ error: PASSWORD_CHANGE_REQUIRED, code: PASSWORD_CHANGE_CODE });
    return;
  } catch (err) {
    next(err);
  }
}

export function sessionWriteCsrf(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE' && req.method !== 'PUT') {
      next();
      return;
    }
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      next();
      return;
    }
    if (req.path.startsWith('/api/auth/')) {
      next();
      return;
    }
    const sid = getCookie(req, SESSION_COOKIE);
    if (!sid) {
      next();
      return;
    }
    const sent = req.get('X-CSRF-Token');
    const expected = csrfBySession.get(sid);
    if (!sent || !expected || sent !== expected) {
      next(new HttpError(403, 'Invalid CSRF token'));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function withPasswordGateCode(err: unknown): void {
  if (
    err instanceof HttpError &&
    err.status === 403 &&
    err.message === PASSWORD_CHANGE_REQUIRED &&
    !(err as { code?: string }).code
  ) {
    (err as { code?: string }).code = PASSWORD_CHANGE_CODE;
  }
}

const loginAttemptsByIp = new Map<string, number[]>();
const LOGIN_WINDOW_MS = 60 * 1000;
// 10/min by default; overridable for local E2E runs where one Playwright
// process performs many logins from the same IP in quick succession.
const LOGIN_MAX = Number(process.env.LOGIN_RATE_MAX ?? 10);

export function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = loginAttemptsByIp.get(ip) ?? [];
  const fresh = list.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (fresh.length >= LOGIN_MAX) {
    loginAttemptsByIp.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  loginAttemptsByIp.set(ip, fresh);
  return false;
}

export function clearLoginRateLimits(): void {
  loginAttemptsByIp.clear();
}
