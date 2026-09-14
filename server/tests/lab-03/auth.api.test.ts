import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { clearLoginRateLimits } from '../../src/middleware/auth.js';

// Lab 3 Auth Foundation — server/tests/lab-03/auth.api.test.ts
// Covers (plan docs/lab-03/tests.md): T-AUTH-01..05, T-PWD-01, T-SESS-01,
// T-GATE-01, T-MIG-01. Backend only, no frontend changes.
// DB: shared PostgreSQL via Prisma (DATABASE_URL override to 127.0.0.1:5434).
// Pattern follows server/tests/lab-02/*.test.ts: supertest(app), isolated
// fixtures, cleanup after each test. bcrypt cost 4 for speed in tests only.

const prisma = getPrisma();

// Low cost keeps the suite fast; production/seed use cost 12.
const TEST_BCRYPT_COST = 4;

const INACTIVE_ERROR = 'Account is inactive. Contact an administrator.';
const INVALID_CREDENTIALS = 'Invalid email or password';
const NOT_AUTHENTICATED = 'Not authenticated';
const RATE_LIMIT_ERROR = 'Too many login attempts. Try again later.';
const GATE_ERROR = 'Password change required';
const GATE_CODE = 'password_change_required';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

const createdUserIds: number[] = [];

function uniqueEmail(label: string): string {
  return `lab3-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@toktickit.test`.toLowerCase();
}

async function createTestUser(opts: {
  label: string;
  role?: Role;
  isActive?: boolean;
  mustChangePassword?: boolean;
  password?: string;
}): Promise<{ id: number; email: string; name: string; password: string }> {
  const email = uniqueEmail(opts.label);
  const password = opts.password ?? 'StartValid1!';
  const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      name: `Lab3 ${opts.label}`,
      email,
      passwordHash,
      role: opts.role ?? 'REQUESTER',
      isActive: opts.isActive ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email, name: user.name, password };
}

async function cleanupTestUsers(): Promise<void> {
  if (createdUserIds.length === 0) return;
  const ids = [...createdUserIds];
  createdUserIds.length = 0;
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

function sessionCookieOf(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith('toktickit.sid='));
  if (!hit) return undefined;
  return hit.split(';')[0];
}

function hasSessionCookie(res: request.Response): boolean {
  const cookie = sessionCookieOf(res);
  if (!cookie) return false;
  const value = cookie.slice('toktickit.sid='.length);
  return value.length > 0 && value !== 'deleted' && value !== '%3B';
}

beforeEach(() => {
  clearLoginRateLimits();
});

afterAll(async () => {
  clearLoginRateLimits();
  await cleanupTestUsers();
  await prisma.$disconnect();
});

describe('T-AUTH-01 valid login each role (AC-01)', () => {
  it.each([
    ['requester', 'REQUESTER'],
    ['staff', 'IT_STAFF'],
    ['admin', 'ADMINISTRATOR'],
  ] as Array<[string, Role]>)(
    'should return 200 user+role+mustChangePassword+csrfToken+cookie for %s',
    async (_label, role) => {
      const fixture = await createTestUser({
        label: `auth01-${role.toLowerCase()}`,
        role,
        mustChangePassword: false,
      });
      try {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: fixture.email, password: fixture.password });

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({
          id: fixture.id,
          name: fixture.name,
          email: fixture.email,
          role,
          isActive: true,
          mustChangePassword: false,
        });
        expect(res.body.user).not.toHaveProperty('passwordHash');
        expect(typeof res.body.csrfToken).toBe('string');
        expect(res.body.csrfToken.length).toBeGreaterThan(0);
        expect(hasSessionCookie(res)).toBe(true);
        const setCookie = String(res.headers['set-cookie'] ?? '');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('toktickit.sid=');
      } finally {
        await cleanupTestUsers();
      }
    },
  );
});

describe('T-AUTH-02 invalid login + rate limit (AC-01)', () => {
  it('should return 401 identical generic with no session for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody-exists-xyz@toktickit.test', password: 'Whatever1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: INVALID_CREDENTIALS });
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('should return 401 identical generic with no session for wrong password', async () => {
    const fixture = await createTestUser({ label: 'auth02-wrongpw' });
    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: 'WrongPassword9!' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: INVALID_CREDENTIALS });
      expect(hasSessionCookie(res)).toBe(false);
    } finally {
      await cleanupTestUsers();
    }
  });

  // NOTE: the login rate counter increments before body validation or bcrypt
  // (see isLoginRateLimited at the top of POST /login), so empty bodies fill
  // the bucket with fast 400s and avoid 11 slow cost-12 bcrypt compares.
  it(
    'should return 429 on the 11th login attempt per minute per IP',
    async () => {
      clearLoginRateLimits();
      try {
        for (let i = 0; i < 10; i += 1) {
          const res = await request(app).post('/api/auth/login').send({});
          expect(res.status).toBe(400);
        }
        const limited = await request(app)
          .post('/api/auth/login')
          .send({ email: 'unknown-10@toktickit.test', password: 'Whatever1!' });
        expect(limited.status).toBe(429);
        expect(limited.body).toEqual({ error: RATE_LIMIT_ERROR });
      } finally {
        clearLoginRateLimits();
      }
    },
    15000,
  );
});

describe('T-AUTH-03 inactive accounts (AC-01)', () => {
  it('should return 403 deactivated message with no session for inactive requester', async () => {
    const fixture = await createTestUser({
      label: 'auth03-inactive-req',
      role: 'REQUESTER',
      isActive: false,
    });
    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: INACTIVE_ERROR });
      expect(hasSessionCookie(res)).toBe(false);
    } finally {
      await cleanupTestUsers();
    }
  });

  it('should return 403 deactivated message with no session for inactive staff', async () => {
    const fixture = await createTestUser({
      label: 'auth03-inactive-staff',
      role: 'IT_STAFF',
      isActive: false,
    });
    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: INACTIVE_ERROR });
      expect(hasSessionCookie(res)).toBe(false);
    } finally {
      await cleanupTestUsers();
    }
  });
});

describe('T-AUTH-04 me with valid session (AC-01)', () => {
  it('should return 200 identity and ignore id param', async () => {
    const fixture = await createTestUser({ label: 'auth04-me', role: 'IT_STAFF' });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      expect(login.status).toBe(200);
      const cookie = sessionCookieOf(login);
      expect(cookie).toBeDefined();

      const res = await request(app)
        .get('/api/auth/me?id=999999')
        .set('Cookie', cookie as string);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        email: fixture.email,
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: false,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(typeof res.body.csrfToken).toBe('string');
    } finally {
      await cleanupTestUsers();
    }
  });
});

describe('T-AUTH-05 me without session (AC-05)', () => {
  it('should return 401 with no identity leaked', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: NOT_AUTHENTICATED });
    expect(res.body).not.toHaveProperty('user');
  });
});

describe('T-PWD-01 password boundary matrix (AC-06)', () => {
  const ORIGINAL = 'StartValid1!';

  async function loginGated(label: string): Promise<{
    cookie: string;
    csrfToken: string;
    cleanup: () => Promise<void>;
  }> {
    const fixture = await createTestUser({
      label,
      mustChangePassword: true,
      password: ORIGINAL,
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fixture.email, password: ORIGINAL });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const cookie = sessionCookieOf(login);
    const csrfToken = login.body.csrfToken as string;
    expect(cookie).toBeDefined();
    return {
      cookie: cookie as string,
      csrfToken,
      cleanup: cleanupTestUsers,
    };
  }

  const invalidCases: Array<[string, string, string]> = [
    ['7 chars', 'Aa1!aaa', 'newPassword'],
    ['73 chars', `Aa1!${'x'.repeat(69)}`, 'newPassword'],
    ['missing uppercase', 'alllower1!', 'newPassword'],
    ['missing lowercase', 'ALLUPPER1!', 'newPassword'],
    ['missing digit', 'NoDigitAa!', 'newPassword'],
    ['missing special', 'NoSpecial1A', 'newPassword'],
    ['same-as-current', ORIGINAL, 'newPassword'],
  ];

  it.each(invalidCases)(
    'should return 400 with details for %s',
    async (_name, newPassword, field) => {
      const ctx = await loginGated(`pwd01-${field}-${String(newPassword.length)}`);
      try {
        const res = await request(app)
          .post('/api/auth/change-password')
          .set('Cookie', ctx.cookie)
          .set('X-CSRF-Token', ctx.csrfToken)
          .send({ newPassword, confirmPassword: newPassword });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.some((d: { field: string }) => d.field === field)).toBe(true);
      } finally {
        await ctx.cleanup();
      }
    },
    15000,
  );

  it('should return 400 with confirmPassword details on mismatch', async () => {
    const ctx = await loginGated('pwd01-mismatch');
    try {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', ctx.cookie)
        .set('X-CSRF-Token', ctx.csrfToken)
        .send({ newPassword: 'BrandNew2@', confirmPassword: 'Different3#' });

      expect(res.status).toBe(400);
      expect(res.body.details.some((d: { field: string }) => d.field === 'confirmPassword')).toBe(
        true,
      );
    } finally {
      await ctx.cleanup();
    }
  });

  it('should return 200 and clear mustChangePassword on valid change', async () => {
    const ctx = await loginGated('pwd01-valid');
    try {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', ctx.cookie)
        .set('X-CSRF-Token', ctx.csrfToken)
        .send({ newPassword: 'BrandNew2@', confirmPassword: 'BrandNew2@' });

      expect(res.status).toBe(200);
      expect(res.body.user.mustChangePassword).toBe(false);

      const me = await request(app).get('/api/auth/me').set('Cookie', ctx.cookie);
      expect(me.status).toBe(200);
      expect(me.body.user.mustChangePassword).toBe(false);
    } finally {
      await ctx.cleanup();
    }
  });
});

describe('T-SESS-01 logout invalidates session (AC-05)', () => {
  it('should expire cookie, reject reuse with 401, and second logout is 401', async () => {
    const fixture = await createTestUser({ label: 'sess01' });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      expect(login.status).toBe(200);
      const cookie = sessionCookieOf(login) as string;
      const csrfToken = login.body.csrfToken as string;

      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken);
      expect(logout.status).toBe(200);
      expect(logout.body).toEqual({ message: 'Logged out' });
      const clearHeader = String(logout.headers['set-cookie'] ?? '');
      expect(clearHeader).toContain('toktickit.sid=');
      expect(clearHeader).toMatch(/Expires=Thu, 01 Jan 1970/i);

      const meAfter = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(meAfter.status).toBe(401);

      const logoutAgain = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken);
      expect(logoutAgain.status).toBe(401);
    } finally {
      await cleanupTestUsers();
    }
  });
});

describe('T-GATE-01 mustChangePassword gate (AC-02)', () => {
  it('should block /api/tickets with 403 while allowing me/logout', async () => {
    const fixture = await createTestUser({
      label: 'gate01-blocked',
      mustChangePassword: true,
      password: 'StartValid1!',
    });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      const cookie = sessionCookieOf(login) as string;
      const csrfToken = login.body.csrfToken as string;

      const gated = await request(app).get('/api/tickets').set('Cookie', cookie);
      expect(gated.status).toBe(403);
      expect(gated.body).toMatchObject({ error: GATE_ERROR, code: GATE_CODE });

      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);

      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken);
      expect(logout.status).toBe(200);
    } finally {
      await cleanupTestUsers();
    }
  });

  it('should allow change-password through the gate and lift it afterwards', async () => {
    const fixture = await createTestUser({
      label: 'gate01-change',
      mustChangePassword: true,
      password: 'StartValid1!',
    });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      const cookie = sessionCookieOf(login) as string;
      const csrfToken = login.body.csrfToken as string;

      const change = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ newPassword: 'BrandNew2@', confirmPassword: 'BrandNew2@' });
      expect(change.status).toBe(200);
      expect(change.body.user.mustChangePassword).toBe(false);

      const after = await request(app).get('/api/tickets').set('Cookie', cookie);
      // Gate lifted: no longer the password_change_required 403 (tickets route
      // still enforces its own Lab 2 header contract afterwards).
      expect(
        after.status !== 403 || (after.body as { code?: string }).code !== GATE_CODE,
      ).toBe(true);
    } finally {
      await cleanupTestUsers();
    }
  });
});

describe('T-FORGOT-01 forgot-password (credential-verified reset, AC-01/AC-06, BR-16)', () => {
  const FORGOT_SAFE = 'Unable to update password with the details provided.';

  it('should return 200 changed:true and old session dies on success', async () => {
    const fixture = await createTestUser({ label: 'fp01-ok' });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      expect(login.status).toBe(200);
      const oldCookie = sessionCookieOf(login) as string;

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: fixture.email,
          currentPassword: fixture.password,
          newPassword: 'FreshPass9#',
          confirmPassword: 'FreshPass9#',
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ changed: true, message: 'Password updated' });

      // New password works; old one no longer does.
      const relogin = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: 'FreshPass9#' });
      expect(relogin.status).toBe(200);
      const wrong = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      expect(wrong.status).toBe(401);

      // The pre-reset session was revoked by the reset.
      const meOld = await request(app).get('/api/auth/me').set('Cookie', oldCookie);
      expect(meOld.status).toBe(401);
    } finally {
      await cleanupTestUsers();
    }
  });

  it.each([
    ['unknown email', { email: 'nobody-fp@toktickit.test', currentPassword: 'Whatever1!', newPassword: 'FreshPass9#', confirmPassword: 'FreshPass9#' }],
    ['wrong current password', 'wrong-current'],
    ['inactive account', 'inactive'],
  ])('should return the same safe 401 with no session for %s', async (_name, payload) => {
    let body: Record<string, string>;
    if (payload === 'wrong-current' || payload === 'inactive') {
      const fixture = await createTestUser({
        label: payload === 'inactive' ? 'fp01-inactive' : 'fp01-wrong',
        isActive: payload !== 'inactive',
      });
      createdUserIds.push(fixture.id);
      body = {
        email: fixture.email,
        currentPassword: payload === 'wrong-current' ? 'WrongPass1!' : fixture.password,
        newPassword: 'FreshPass9#',
        confirmPassword: 'FreshPass9#',
      };
    } else {
      body = payload as Record<string, string>;
    }
    try {
      const res = await request(app).post('/api/auth/forgot-password').send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: FORGOT_SAFE });
      expect(res.headers['set-cookie']).toBeUndefined();
    } finally {
      await cleanupTestUsers();
    }
  });

  it('should map mustChangePassword users through the same flow (initial password)', async () => {
    const fixture = await createTestUser({
      label: 'fp01-initial',
      mustChangePassword: true,
      password: 'StartValid1!',
    });
    try {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: fixture.email,
          currentPassword: 'StartValid1!',
          newPassword: 'FreshPass9#',
          confirmPassword: 'FreshPass9#',
        });
      expect(res.status).toBe(200);
      const after = await prisma.user.findUnique({ where: { id: fixture.id } });
      expect(after?.mustChangePassword).toBe(false);
    } finally {
      await cleanupTestUsers();
    }
  });

  it('should return 400 validation details for weak/mismatched new passwords', async () => {
    const fixture = await createTestUser({ label: 'fp01-invalid' });
    try {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: fixture.email,
          currentPassword: fixture.password,
          newPassword: 'short',
          confirmPassword: 'short',
        });
      expect(res.status).toBe(400);
      expect(res.body.details.some((d: { field: string }) => d.field === 'newPassword')).toBe(true);
    } finally {
      await cleanupTestUsers();
    }
  });

  it('should stay reachable through the mustChangePassword gate', async () => {
    const fixture = await createTestUser({
      label: 'fp01-gated',
      mustChangePassword: true,
      password: 'StartValid1!',
    });
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixture.email, password: fixture.password });
      const cookie = sessionCookieOf(login) as string;

      // While gated, /api/tickets is 403 password_change_required…
      const gated = await request(app).get('/api/tickets').set('Cookie', cookie);
      expect(gated.status).toBe(403);

      // …but forgot-password remains usable (it is on the auth allowlist).
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('Cookie', cookie)
        .send({
          email: fixture.email,
          currentPassword: 'StartValid1!',
          newPassword: 'FreshPass9#',
          confirmPassword: 'FreshPass9#',
        });
      expect(res.status).toBe(200);
    } finally {
      await cleanupTestUsers();
    }
  });
});

describe('T-MIG-01 seed idempotency quotas (AC-18)', () => {
  it('should hold user quotas (4+1 requesters, 3+1 staff, 1 admin)', async () => {
    const [reqActive, reqInactive, staffActive, staffInactive, adminActive] =
      await Promise.all([
        prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
        prisma.user.count({ where: { role: 'REQUESTER', isActive: false } }),
        prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
        prisma.user.count({ where: { role: 'IT_STAFF', isActive: false } }),
        prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
      ]);

    expect(reqActive).toBeGreaterThanOrEqual(4);
    expect(reqInactive).toBeGreaterThanOrEqual(1);
    expect(staffActive).toBeGreaterThanOrEqual(3);
    expect(staffInactive).toBeGreaterThanOrEqual(1);
    expect(adminActive).toBeGreaterThanOrEqual(1);

    const seeds = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'alpha@toktickit.test',
            'epsilon@toktickit.test',
            'sara.it@toktickit.test',
            'leo.it@toktickit.test',
            'admin@toktickit.test',
          ],
        },
      },
    });
    expect(seeds).toHaveLength(5);
  });
});
