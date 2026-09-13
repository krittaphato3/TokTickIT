import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { clearLoginRateLimits } from '../../src/middleware/auth.js';

// Lab 3 — shared authenticated-session helper for API suites.
//
// Lab 2 suites addressed /api/tickets with the X-Dev-Requester-Id header; Lab 3
// replaces that concept with session identity (BR-03). The suites in
// tests/lab-02 keep their Lab 2 request/response assertions but obtain
// identity through a real login, exactly like the product client does.
//
// Every fixture is fully disposable: dispose() removes tickets and the linked
// Requester row created for the fixture before deleting sessions and the User
// row, so the shared seeded database stays pristine between runs.

const prisma = getPrisma();

// Matches the cost used by tests/lab-03/auth.api.test.ts (speed over
// realism; production and seed use cost 12).
const TEST_BCRYPT_COST = 4;

export interface SessionFixture {
  userId: number;
  // Set only when the fixture was created with a linked Requester row.
  requesterId: number | null;
  email: string;
  name: string;
  password: string;
  // Value for the HTTP Cookie header, e.g. "toktickit.sid=<hex>".
  cookie: string;
  // Value for the X-CSRF-Token header on state-changing requests.
  csrfToken: string;
  dispose: () => Promise<void>;
}

// Unique per-run email so fixtures never collide with seed data or each other.
export function uniqueEmail(label: string): string {
  return `s3-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@toktickit.test`.toLowerCase();
}

export function sessionCookieOf(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith('toktickit.sid='));
  if (!hit) return undefined;
  return hit.split(';')[0];
}

// Registry for the afterAll safety net: disposes fixtures even when an
// individual test failed before its own dispose() ran.
const registry: SessionFixture[] = [];

export async function cleanupAllSessions(): Promise<void> {
  const all = registry.splice(0, registry.length);
  for (const fixture of all) {
    await fixture.dispose().catch(() => undefined);
  }
}

export async function createSession(opts: {
  label: string;
  role?: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  isActive?: boolean;
  mustChangePassword?: boolean;
  password?: string;
  // REQUESTER convenience: also create the matching Requester row so
  // resolveSessionRequester links the session to an owned ticket scope.
  withLinkedRequester?: boolean;
}): Promise<SessionFixture> {
  const role = opts.role ?? 'REQUESTER';
  const email = uniqueEmail(opts.label);
  const password = opts.password ?? 'StartValid1!';
  const isActive = opts.isActive ?? true;
  const name = `S3 Fixture ${opts.label}`;
  const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      isActive,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });

  let requesterId: number | null = null;
  if (opts.withLinkedRequester === true && role === 'REQUESTER') {
    const requester = await prisma.requester.create({
      data: { name, email, isActive },
    });
    requesterId = requester.id;
  }

  // The in-memory login rate limiter allows 10 attempts per minute per IP;
  // a suite creating many fixtures would trip it, so reset it before each
  // fixture login (same pattern as auth.api.test.ts's beforeEach).
  clearLoginRateLimits();
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  if (login.status !== 200) {
    // Roll the user/requester rows back so a failed fixture never leaks rows.
    if (requesterId !== null) {
      await prisma.requester.delete({ where: { id: requesterId } }).catch(() => undefined);
    }
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    throw new Error(
      `createSession(${opts.label}): login failed with ${login.status}: ${JSON.stringify(login.body)}`,
    );
  }
  const cookie = sessionCookieOf(login);
  if (!cookie) {
    throw new Error('createSession: login response carried no session cookie');
  }

  const fixture: SessionFixture = {
    userId: user.id,
    requesterId,
    email,
    name,
    password,
    cookie,
    csrfToken: login.body.csrfToken as string,
    dispose: async () => {
      if (requesterId !== null) {
        // Tickets restrict-delete on requester, so clear them first;
        // attachments cascade with their ticket.
        await prisma.ticket.deleteMany({ where: { requesterId } });
        await prisma.requester.delete({ where: { id: requesterId } }).catch(() => undefined);
      }
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    },
  };
  registry.push(fixture);
  return fixture;
}

// Convenience wrappers: apply the fixture credentials to a supertest chain.
export function withCookie(
  fixture: Pick<SessionFixture, 'cookie'>,
  req: request.Test,
): request.Test {
  return req.set('Cookie', fixture.cookie);
}

export function withWriteAuth(
  fixture: Pick<SessionFixture, 'cookie' | 'csrfToken'>,
  req: request.Test,
): request.Test {
  return req.set('Cookie', fixture.cookie).set('X-CSRF-Token', fixture.csrfToken);
}
