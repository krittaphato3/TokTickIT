import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../prisma.js';
import { HttpError } from '../services/ticket.service.js';
import {
  INACTIVE_MESSAGE,
  NOT_AUTHENTICATED,
  constantTimePasswordCheck,
  generateSessionId,
  hashIp,
  issueCsrfToken,
  getCsrfToken,
  revokeCsrfToken,
  isLoginRateLimited,
  requireAuth,
  requireCsrf,
  safeUser,
  optionalAuth,
} from '../middleware/auth.js';
import { buildSessionCookie, buildClearSessionCookie } from '../middleware/cookies.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_COST = 12;

function validateLoginBody(body: unknown): { email: string; password: string } {
  const issues: { field: string; message: string }[] = [];
  const data = (typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body
    : {}) as Record<string, unknown>;
  const rawEmail = data.email;
  let email = '';
  if (typeof rawEmail !== 'string' || rawEmail.trim().length === 0) {
    issues.push({ field: 'email', message: 'Email is required' });
  } else {
    email = rawEmail.trim().toLowerCase();
    if (email.length > 254) {
      issues.push({ field: 'email', message: 'Email must be at most 254 characters' });
    } else if (!EMAIL_RE.test(email)) {
      issues.push({ field: 'email', message: 'Email must be a valid email address' });
    }
  }
  const rawPassword = data.password;
  let password = '';
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    issues.push({ field: 'password', message: 'Password is required' });
  } else if (rawPassword.length > 72) {
    issues.push({ field: 'password', message: 'Password must be at most 72 characters' });
  } else {
    password = rawPassword;
  }
  if (issues.length > 0) throw new HttpError(400, 'Validation failed', issues);
  return { email, password };
}

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    if (isLoginRateLimited(ip)) {
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return;
    }
    const { email, password } = validateLoginBody(req.body);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.isActive) {
      await constantTimePasswordCheck(password, user.passwordHash);
      res.status(403).json({ error: INACTIVE_MESSAGE });
      return;
    }
    const ok = await constantTimePasswordCheck(password, user ? user.passwordHash : null);
    if (!user || !ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const now = new Date();
    const sessionId = generateSessionId();
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        ipHash: hashIp(ip) ?? null,
      },
    });
    const csrfToken = issueCsrfToken(sessionId);
    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.status(200).json({ user: safeUser(user), csrfToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/logout',
  optionalAuth,
  requireAuth,
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const sid = req.auth?.sessionId;
      if (sid) {
        await prisma.session.delete({ where: { id: sid } }).catch(() => undefined);
        revokeCsrfToken(sid);
      }
      req.auth = undefined;
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      res.status(200).json({ message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get(
  '/me',
  optionalAuth,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.auth;
      if (!ctx) {
        next(new HttpError(401, NOT_AUTHENTICATED));
        return;
      }
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) {
        await prisma.session.delete({ where: { id: ctx.sessionId } }).catch(() => undefined);
        revokeCsrfToken(ctx.sessionId);
        next(new HttpError(401, NOT_AUTHENTICATED));
        return;
      }
      if (!user.isActive) {
        await prisma.session.delete({ where: { id: ctx.sessionId } }).catch(() => undefined);
        revokeCsrfToken(ctx.sessionId);
        req.auth = undefined;
        res.status(403).json({ error: INACTIVE_MESSAGE });
        return;
      }
      let csrfToken = getCsrfToken(ctx.sessionId);
      if (!csrfToken) csrfToken = issueCsrfToken(ctx.sessionId);
      res.status(200).json({ user: safeUser(user), csrfToken });
    } catch (err) {
      next(err);
    }
  },
);

function validateNewPassword(newPassword: unknown): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    issues.push({ field: 'newPassword', message: 'New password is required' });
    return issues;
  }
  if (newPassword.length < 8) {
    issues.push({ field: 'newPassword', message: 'Must be at least 8 characters' });
  }
  if (newPassword.length > 72) {
    issues.push({ field: 'newPassword', message: 'Must be at most 72 characters' });
  }
  if (!/[A-Z]/.test(newPassword)) {
    issues.push({ field: 'newPassword', message: 'Must contain an uppercase letter' });
  }
  if (!/[a-z]/.test(newPassword)) {
    issues.push({ field: 'newPassword', message: 'Must contain a lowercase letter' });
  }
  if (!/[0-9]/.test(newPassword)) {
    issues.push({ field: 'newPassword', message: 'Must contain a digit' });
  }
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    issues.push({ field: 'newPassword', message: 'Must contain a special character' });
  }
  return issues;
}

authRouter.post(
  '/change-password',
  optionalAuth,
  requireAuth,
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.auth;
      if (!ctx) {
        next(new HttpError(401, NOT_AUTHENTICATED));
        return;
      }
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) {
        next(new HttpError(401, NOT_AUTHENTICATED));
        return;
      }
      if (!user.isActive) {
        await prisma.session.delete({ where: { id: ctx.sessionId } }).catch(() => undefined);
        revokeCsrfToken(ctx.sessionId);
        res.status(403).json({ error: INACTIVE_MESSAGE });
        return;
      }
      const body = (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
        ? req.body
        : {}) as Record<string, unknown>;
      const mustChange = user.mustChangePassword;
      const issues: { field: string; message: string }[] = [];

      let currentPassword: string | undefined;
      if (!mustChange) {
        const raw = body.currentPassword;
        if (typeof raw !== 'string' || raw.length === 0) {
          issues.push({ field: 'currentPassword', message: 'Current password is required' });
        } else if (raw.length > 72) {
          issues.push({ field: 'currentPassword', message: 'Current password must be at most 72 characters' });
        } else {
          currentPassword = raw;
        }
      }

      const { newPassword, confirmPassword } = body;
      issues.push(...validateNewPassword(newPassword));

      if (typeof confirmPassword !== 'string' || confirmPassword.length === 0) {
        issues.push({ field: 'confirmPassword', message: 'Confirm password is required' });
      } else if (typeof newPassword === 'string' && confirmPassword !== newPassword) {
        issues.push({ field: 'confirmPassword', message: 'Passwords do not match' });
      }

      if (issues.length > 0) throw new HttpError(400, 'Validation failed', issues);

      const npw = newPassword as string;
      if (!mustChange && currentPassword !== undefined) {
        const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!currentOk) {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }
      }
      const sameAsCurrent = await bcrypt.compare(npw, user.passwordHash);
      if (sameAsCurrent || (!mustChange && currentPassword !== undefined && npw === currentPassword)) {
        throw new HttpError(400, 'Validation failed', [
          { field: 'newPassword', message: 'New password must be different from current password' },
        ]);
      }

      const passwordHash = await bcrypt.hash(npw, BCRYPT_COST);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      res.status(200).json({ user: safeUser(updated) });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Forgot password (credential-verified reset — ui-spec §3.4).
//
// The lab sheet EXCLUDES email-based reset (no email invitations, no reset
// emails). The approved mockup's "Forgot password?" flow is implemented as a
// one-request self-service reset: the caller proves account ownership with the
// current (or administrator-issued initial) password and sets a new one.
//
// Safe-error contract (BR-16):
//   - unknown email, wrong current password, inactive account and any failure
//     all return the SAME generic 401 body — existence is never revealed;
//   - login-style rate limiting applies per IP (10/min);
//   - a successful reset revokes all of the user's existing sessions, so a
//     stolen session cannot survive a credential change.
// ---------------------------------------------------------------------------
const FORGOT_SAFE_ERROR = 'Unable to update password with the details provided.';

authRouter.post(
  '/forgot-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
      if (isLoginRateLimited(ip)) {
        res.status(429).json({ error: 'Too many attempts. Try again later.' });
        return;
      }

      // Body validation shares login's shape checks for email, then applies
      // the new-password rules; field-level 400 details go to the UI as usual.
      const body = (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
        ? req.body
        : {}) as Record<string, unknown>;

      const issues: { field: string; message: string }[] = [];
      const rawEmail = body.email;
      let email = '';
      if (typeof rawEmail !== 'string' || rawEmail.trim().length === 0) {
        issues.push({ field: 'email', message: 'Email is required' });
      } else {
        email = rawEmail.trim().toLowerCase();
        if (email.length > 254 || !EMAIL_RE.test(email)) {
          issues.push({ field: 'email', message: 'Email must be a valid email address' });
        }
      }

      const rawCurrent = body.currentPassword;
      let currentPassword = '';
      if (typeof rawCurrent !== 'string' || rawCurrent.length === 0) {
        issues.push({ field: 'currentPassword', message: 'Current password is required' });
      } else if (rawCurrent.length > 72) {
        issues.push({ field: 'currentPassword', message: 'Current password must be at most 72 characters' });
      } else {
        currentPassword = rawCurrent;
      }

      const rawNew = body.newPassword;
      const rawConfirm = body.confirmPassword;
      if (typeof rawNew !== 'string' || rawNew.length === 0) {
        issues.push({ field: 'newPassword', message: 'New password is required' });
      } else {
        issues.push(...validateNewPassword(rawNew));
        if (
          typeof rawConfirm !== 'string' ||
          rawConfirm.length === 0 ||
          rawConfirm !== rawNew
        ) {
          issues.push({ field: 'confirmPassword', message: 'Passwords do not match' });
        }
      }

      if (issues.length > 0) {
        throw new HttpError(400, 'Validation failed', issues);
      }

      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { email } });

      // Inactive accounts: verify the password to keep timing consistent, then
      // return the same generic 401 as every other failure (no state leak).
      if (user && !user.isActive) {
        await constantTimePasswordCheck(currentPassword, user.passwordHash);
        res.status(401).json({ error: FORGOT_SAFE_ERROR });
        return;
      }

      const ok = await constantTimePasswordCheck(currentPassword, user ? user.passwordHash : null);
      if (!user || !ok) {
        res.status(401).json({ error: FORGOT_SAFE_ERROR });
        return;
      }

      const npw = rawNew as string;
      const sameAsCurrent = await bcrypt.compare(npw, user.passwordHash);
      if (sameAsCurrent) {
        throw new HttpError(400, 'Validation failed', [
          { field: 'newPassword', message: 'New password must be different from current password' },
        ]);
      }

      const passwordHash = await bcrypt.hash(npw, BCRYPT_COST);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash, mustChangePassword: false },
        }),
        // Revoke every existing session for this user (stolen sessions die).
        prisma.session.deleteMany({ where: { userId: user.id } }),
      ]);

      res.status(200).json({ changed: true, message: 'Password updated' });
    } catch (err) {
      next(err);
    }
  },
);

export default authRouter;
