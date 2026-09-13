import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE = 'toktickit.sid';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function cookiesMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('cookie');
  (req as Request & { cookies?: Record<string, string> }).cookies = parseCookieHeader(header);
  next();
}

export function getCookie(req: Request, name: string): string | undefined {
  const jar = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (jar && typeof jar[name] === 'string') return jar[name];
  return parseCookieHeader(req.get('cookie'))[name];
}

export function buildSessionCookie(sessionId: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`;
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Path=/`;
}
