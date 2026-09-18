import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { updateUser } from '../../src/services/users.service.js';
import { HttpError } from '../../src/services/ticket.service.js';
import { clearLoginRateLimits } from '../../src/middleware/auth.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  withWriteAuth,
  uniqueEmail,
  type SessionFixture,
} from '../helpers/session.js';

// Lab 3 Issue — Administrator User Management (api-spec §9, server-side).
// Rows owned here (docs/lab-03/tests.md §2): T-AUTHZ-04, T-ADM-01..05,
// T-PWD-02 (API half) plus the mandatory-password-change-after-reset
// acceptance for AC-16.
//
// Coverage map (issue requirement → test):
//   admin-only access + non-admin forbidden .......... T-AUTHZ-04
//   user list / search name+email .................... T-ADM-01
//   role filter ...................................... T-ADM-02
//   create success / duplicate email / invalid role .. T-ADM-03
//   update fields + activate/deactivate .............. T-ADM-04
//   self-deactivation + last-admin guards ............ T-ADM-05
//   set initial password + forced change at login .... T-PWD-02
//
// Guard-reachability note (documented decision): an API actor must be an
// active Administrator, so the actor themself is always an active admin.
// Deactivating "the last active Administrator" through the API therefore
// always coincides with the self rule (target == actor), which §9.3 orders
// first — the API-level proof of last-admin protection is the role-reassign
// 409 plus the service-level deactivation test below, which exercises the
// exact branch the router invokes with a distinct actor id.
//
// Safety: every fixture is disposable via dispose(); users created through
// the API are deleted in the afterAll safety net; seed rows mutated for a
// guard test are restored in a finally block. No response body is ever
// asserted to contain password material — hashes are verified with bcrypt.

const prisma = getPrisma();

const fixtures: SessionFixture[] = [];

async function fixture(opts: Parameters<typeof createSession>[0]): Promise<SessionFixture> {
  const f = await createSession(opts);
  fixtures.push(f);
  return f;
}

async function adminFixture(label: string): Promise<SessionFixture> {
  return fixture({ label, role: 'ADMINISTRATOR', mustChangePassword: false });
}

const createdUserIds: number[] = [];

afterAll(async () => {
  await cleanupAllSessions();
  for (const id of [...createdUserIds].reverse()) {
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
});

// Deactivates every active Administrator except `keepActiveId` and returns a
// restore function (re-activates exactly the rows it deactivated). Used to
// construct the deterministic "sole active admin" state for the BR-18 guard
// tests; MUST be called inside try/finally.
async function isolateActiveAdmin(keepActiveId: number): Promise<() => Promise<void>> {
  const others = await prisma.user.findMany({
    where: { role: 'ADMINISTRATOR', isActive: true, id: { not: keepActiveId } },
    select: { id: true },
  });
  await prisma.user.updateMany({
    where: { id: { in: others.map((u) => u.id) } },
    data: { isActive: false },
  });
  return async () => {
    await prisma.user.updateMany({
      where: { id: { in: others.map((u) => u.id) } },
      data: { isActive: true },
    });
  };
}

// ---------------------------------------------------------------------------
// T-AUTHZ-04 — admin-only access (BR-20)
// ---------------------------------------------------------------------------
describe('T-AUTHZ-04 — /api/users is Administrator-only (BR-20)', () => {
  it('401 without a session on every endpoint; no user data leaks', async () => {
    const list = await request(app).get('/api/users');
    expect(list.status).toBe(401);
    expect(list.body.error).toBe('Not authenticated');

    const create = await request(app).post('/api/users').send({ name: 'X' });
    expect(create.status).toBe(401);

    const patch = await request(app).patch('/api/users/1').send({ name: 'X' });
    expect(patch.status).toBe(401);

    const pwd = await request(app)
      .post('/api/users/1/set-initial-password')
      .send({ initialPassword: 'Whatever1!' });
    expect(pwd.status).toBe(401);
  });

  it('403 for REQUESTER and IT_STAFF with the documented message', async () => {
    const requester = await fixture({ label: 'adm-r' });
    const staff = await fixture({ label: 'adm-s', role: 'IT_STAFF' });

    for (const f of [requester, staff]) {
      const list = await withCookie(f, request(app).get('/api/users'));
      expect(list.status).toBe(403);
      expect(list.body.error).toBe('Administrator access required');
      expect(list.body.data).toBeUndefined();

      const create = await withWriteAuth(f, request(app).post('/api/users')).send({
        name: 'Sneaky',
        email: uniqueEmail('sneak'),
        role: 'REQUESTER',
        initialPassword: 'TempPass1!',
      });
      expect(create.status).toBe(403);

      const patch = await withWriteAuth(f, request(app).patch('/api/users/1')).send({ name: 'X' });
      expect(patch.status).toBe(403);

      const pwd = await withWriteAuth(f, request(app).post('/api/users/1/set-initial-password')).send({
        initialPassword: 'TempPass1!',
      });
      expect(pwd.status).toBe(403);
    }

    // No row was created by any forbidden attempt.
    expect(await prisma.user.count({ where: { name: 'Sneaky' } })).toBe(0);
  });

  it('403 password_change_required when the admin session itself is gated', async () => {
    const gatedAdmin = await fixture({
      label: 'adm-gate',
      role: 'ADMINISTRATOR',
      mustChangePassword: true,
    });
    const list = await withCookie(gatedAdmin, request(app).get('/api/users'));
    expect(list.status).toBe(403);
    expect(list.body.error).toBe('Password change required');
    expect(list.body.code).toBe('password_change_required');
  });
});

// ---------------------------------------------------------------------------
// T-ADM-01 — list + search (AC-15)
// ---------------------------------------------------------------------------
describe('T-ADM-01 — user list with search by name and email (AC-15)', () => {
  it('returns all users ordered by id ascending and never a passwordHash', async () => {
    const admin = await adminFixture('adm-l1');
    const res = await withCookie(admin, request(app).get('/api/users'));
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.totalItems / 10));
    expect(res.body.data.length).toBe(Math.min(10, res.body.meta.totalItems));
    expect(res.body.data.length).toBeGreaterThanOrEqual(5); // seed quota: 5 requesters + 4 staff + 1 admin

    const ids = res.body.data.map((u: { id: number }) => u.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);

    for (const u of res.body.data) {
      expect(u.passwordHash).toBeUndefined();
      expect(typeof u.mustChangePassword).toBe('boolean');
      expect(u.createdAt).toBeDefined();
      expect(u.updatedAt).toBeDefined();
    }
  });

  it('searches case-insensitively across name', async () => {
    const admin = await adminFixture('adm-l2');
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Norbert Searchname',
      email: uniqueEmail('searchname'),
      role: 'IT_STAFF',
      initialPassword: 'TempPass1!',
    });
    expect(created.status).toBe(201);
    createdUserIds.push(created.body.id);

    const res = await withCookie(admin, request(app).get('/api/users')).query({
      search: 'searchNAME',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.some((u: { id: number }) => u.id === created.body.id)).toBe(true);
  });

  it('searches case-insensitively across email', async () => {
    const admin = await adminFixture('adm-l3');
    const email = uniqueEmail('mailfinder');
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Plain Name',
      email,
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    expect(created.status).toBe(201);
    createdUserIds.push(created.body.id);

    const res = await withCookie(admin, request(app).get('/api/users')).query({
      search: email.split('@')[0].toUpperCase(),
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe(email);
  });

  it('a blank search value means no filter', async () => {
    const admin = await adminFixture('adm-l4');
    const all = await withCookie(admin, request(app).get('/api/users'));
    const blank = await withCookie(admin, request(app).get('/api/users')).query({ search: '   ' });
    expect(blank.status).toBe(200);
    expect(blank.body.meta.totalItems).toBe(all.body.meta.totalItems);
  });

  it('paginates server-side: page slicing and totalPages math', async () => {
    const admin = await adminFixture('adm-l5');
    const p1 = await withCookie(admin, request(app).get('/api/users')).query({ page: 1, pageSize: 5 });
    const p2 = await withCookie(admin, request(app).get('/api/users')).query({ page: 2, pageSize: 5 });
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p1.body.data).toHaveLength(5);
    expect(p2.body.data.length).toBeLessThanOrEqual(5);
    expect(p1.body.meta.totalItems).toBe(p2.body.meta.totalItems);
    expect(p1.body.meta.totalPages).toBe(Math.ceil(p1.body.meta.totalItems / 5));
    const ids1 = p1.body.data.map((u: { id: number }) => u.id);
    const ids2 = p2.body.data.map((u: { id: number }) => u.id);
    expect(ids1.some((id: number) => ids2.includes(id))).toBe(false);
  });

  it('rejects invalid pagination values with 400', async () => {
    const admin = await adminFixture('adm-l6');
    for (const q of [{ page: '0' }, { page: '-1' }, { page: 'x' }, { pageSize: '4' }, { pageSize: '101' }, { pageSize: 'abc' }]) {
      const res = await withCookie(admin, request(app).get('/api/users')).query(q);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    }
  });
});

// ---------------------------------------------------------------------------
// T-ADM-02 — role filter (AC-15)
// ---------------------------------------------------------------------------
describe('T-ADM-02 — role filter (AC-15)', () => {
  it('filters each role and rejects invalid values with 400', async () => {
    const admin = await adminFixture('adm-rf');

    for (const role of ['REQUESTER', 'IT_STAFF', 'ADMIN'] as const) {
      const res = await withCookie(admin, request(app).get('/api/users')).query({ role });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const u of res.body.data) {
        expect(u.role).toBe(role);
      }
    }

    const bad = await withCookie(admin, request(app).get('/api/users')).query({ role: 'SUPERUSER' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Validation failed');
    expect(bad.body.details[0].field).toBe('role');
  });

  it('search + role filter combine (the only supported filter pair)', async () => {
    const admin = await adminFixture('adm-rf2');
    const email = uniqueEmail('combo');
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Combo Filter',
      email,
      role: 'IT_STAFF',
      initialPassword: 'TempPass1!',
    });
    expect(created.status).toBe(201);
    createdUserIds.push(created.body.id);

    const combined = await withCookie(admin, request(app).get('/api/users')).query({
      search: email.split('@')[0],
      role: 'IT_STAFF',
    });
    expect(combined.status).toBe(200);
    expect(combined.body.data).toHaveLength(1);
    expect(combined.body.data[0].email).toBe(email);

    const wrongRole = await withCookie(admin, request(app).get('/api/users')).query({
      search: email.split('@')[0],
      role: 'REQUESTER',
    });
    expect(wrongRole.status).toBe(200);
    expect(wrongRole.body.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-ADM-03 — create user (AC-15/AC-16)
// ---------------------------------------------------------------------------
describe('T-ADM-03 — create user; duplicate email; invalid role (AC-15/AC-16)', () => {
  it('creates a user with mustChangePassword=true and a bcrypt hash', async () => {
    const admin = await adminFixture('adm-c1');
    const email = uniqueEmail('created');
    const res = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Created Person',
      email: email.toUpperCase(), // server must store lowercase
      role: 'IT_STAFF',
      isActive: true,
      initialPassword: 'TempPass1!',
    });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.id);
    expect(res.body).toMatchObject({
      name: 'Created Person',
      email,
      role: 'IT_STAFF',
      isActive: true,
      mustChangePassword: true,
    });
    expect(res.body.passwordHash).toBeUndefined();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.email).toBe(email);
    expect(row.passwordHash).not.toBe('TempPass1!');
    expect(await bcrypt.compare('TempPass1!', row.passwordHash)).toBe(true);
  });

  it('isActive defaults to true when omitted', async () => {
    const admin = await adminFixture('adm-c2');
    const res = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Default Active',
      email: uniqueEmail('defact'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.id);
    expect(res.body.isActive).toBe(true);
  });

  it('rejects duplicate email case-insensitively with 409', async () => {
    const admin = await adminFixture('adm-c3');
    const email = uniqueEmail('dupe');

    const first = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'First Holder',
      email,
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    expect(first.status).toBe(201);
    createdUserIds.push(first.body.id);

    const dupe = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Second Holder',
      email: email.toUpperCase(),
      role: 'IT_STAFF',
      initialPassword: 'TempPass1!',
    });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error).toBe('Email already exists');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('rejects an invalid role with 400 details and creates nothing', async () => {
    const admin = await adminFixture('adm-c4');
    const res = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Bad Role',
      email: uniqueEmail('badrole'),
      role: 'SUPERADMIN',
      initialPassword: 'TempPass1!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details[0]).toMatchObject({ field: 'role' });
    expect(await prisma.user.count({ where: { name: 'Bad Role' } })).toBe(0);
  });

  it('enforces the initial-password length rule: 7 chars 400, complexity relaxed (BR-07)', async () => {
    const admin = await adminFixture('adm-c5');
    const short = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Short Pass',
      email: uniqueEmail('shortpw'),
      role: 'REQUESTER',
      initialPassword: 'Short7!',
    });
    expect(short.status).toBe(400);
    expect(short.body.details[0]).toMatchObject({ field: 'initialPassword' });

    const ok = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Length Only Pass',
      email: uniqueEmail('lennonpw'),
      role: 'REQUESTER',
      initialPassword: 'alllowercase', // 12 chars, zero complexity — allowed for initial
    });
    expect(ok.status).toBe(201);
    createdUserIds.push(ok.body.id);
  });
});

// ---------------------------------------------------------------------------
// T-ADM-04 — update name/email/role/activation (AC-16)
// ---------------------------------------------------------------------------
describe('T-ADM-04 — update user fields; deactivation preserves the record (AC-16)', () => {
  it('updates name, email, and role', async () => {
    const admin = await adminFixture('adm-u1');
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Original Name',
      email: uniqueEmail('updatable'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    createdUserIds.push(created.body.id);
    const id = created.body.id as number;

    const newEmail = uniqueEmail('renamed');
    const res = await withWriteAuth(admin, request(app).patch(`/api/users/${id}`)).send({
      name: 'Renamed Person',
      email: newEmail,
      role: 'IT_STAFF',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, name: 'Renamed Person', email: newEmail, role: 'IT_STAFF' });
  });

  it('deactivates and reactivates without deleting any row (BR-18/BR-09)', async () => {
    const admin = await adminFixture('adm-u2');
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Deactivate Me',
      email: uniqueEmail('deact'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    createdUserIds.push(created.body.id);
    const id = created.body.id as number;

    const off = await withWriteAuth(admin, request(app).patch(`/api/users/${id}`)).send({
      isActive: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();

    // Inactive users cannot log in (BR-09).
    clearLoginRateLimits();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: off.body.email, password: 'TempPass1!' });
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('Account is inactive. Contact an administrator.');

    const on = await withWriteAuth(admin, request(app).patch(`/api/users/${id}`)).send({
      isActive: true,
    });
    expect(on.status).toBe(200);
    expect(on.body.isActive).toBe(true);

    clearLoginRateLimits();
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: off.body.email, password: 'TempPass1!' });
    expect(relogin.status).toBe(200);
  });

  it('rejects duplicate email on update excluding self with 409', async () => {
    const admin = await adminFixture('adm-u3');
    const a = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Holder A',
      email: uniqueEmail('holder-a'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    const b = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Holder B',
      email: uniqueEmail('holder-b'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    createdUserIds.push(a.body.id, b.body.id);

    const res = await withWriteAuth(admin, request(app).patch(`/api/users/${b.body.id}`)).send({
      email: (a.body.email as string).toUpperCase(),
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already exists');

    // Keeping your own (unchanged) email is not a conflict.
    const self = await withWriteAuth(admin, request(app).patch(`/api/users/${b.body.id}`)).send({
      email: b.body.email,
    });
    expect(self.status).toBe(200);
  });

  it('404 for unknown or malformed id; 400 for an empty update', async () => {
    const admin = await adminFixture('adm-u4');
    const missing = await withWriteAuth(admin, request(app).patch('/api/users/999999')).send({
      name: 'Nobody',
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('User not found');

    const malformed = await withWriteAuth(admin, request(app).patch('/api/users/not-a-number')).send({
      name: 'X',
    });
    expect(malformed.status).toBe(404);

    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Empty Patch',
      email: uniqueEmail('emptypatch'),
      role: 'REQUESTER',
      initialPassword: 'TempPass1!',
    });
    createdUserIds.push(created.body.id);
    const empty = await withWriteAuth(admin, request(app).patch(`/api/users/${created.body.id}`)).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.details[0].field).toBe('body');
  });
});

// ---------------------------------------------------------------------------
// T-ADM-05 — admin safety rules (BR-18, AC-17)
// ---------------------------------------------------------------------------
describe('T-ADM-05 — self-deactivation and last-admin guards (BR-18, AC-17)', () => {
  it('an Administrator cannot deactivate their own account (409)', async () => {
    const admin = await adminFixture('adm-g1');
    const res = await withWriteAuth(admin, request(app).patch(`/api/users/${admin.userId}`)).send({
      isActive: false,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot deactivate your own account');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(row.isActive).toBe(true); // unchanged
  });

  it('deactivating the last active Administrator is rejected (409, service guard)', async () => {
    // API actors must be active admins, so the actor would always be the
    // remaining active admin — the self rule (checked first per §9.3) shadows
    // this branch over HTTP. The branch itself is exercised here through the
    // same service call the router makes, with a distinct actor id.
    const actor = await adminFixture('adm-g2');
    const target = await prisma.user.create({
      data: {
        name: 'Sole Remaining Admin',
        email: uniqueEmail('sole-admin'),
        passwordHash: await bcrypt.hash('SolePass1!', 4),
        role: 'ADMINISTRATOR',
        isActive: true,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(target.id);

    const restore = await isolateActiveAdmin(target.id);
    try {
      // target is the ONLY active admin now (actor deactivated for the call).
      await expect(
        updateUser(prisma, target.id, { isActive: false }, actor.userId),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Cannot deactivate the last active Administrator',
      });
    } finally {
      await restore();
    }
  });

  it('re-roling the last active Administrator away from ADMIN is 409 over the API', async () => {
    const admin = await adminFixture('adm-g3');
    const restore = await isolateActiveAdmin(admin.userId);
    try {
      // The actor is now the sole active Administrator; changing their own
      // role to REQUESTER would leave zero active admins → 409.
      const res = await withWriteAuth(admin, request(app).patch(`/api/users/${admin.userId}`)).send({
        role: 'REQUESTER',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Cannot reassign the last active Administrator');

      const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
      expect(row.role).toBe('ADMINISTRATOR'); // unchanged
    } finally {
      await restore();
    }
  });

  it('a second active Administrator can still be deactivated and reactivated', async () => {
    const actor = await adminFixture('adm-g4');
    const second = await adminFixture('adm-g4b');
    const restore = await isolateActiveAdmin(actor.userId);
    try {
      // second is inactive now; activate, then deactivate via the API — with
      // the actor still active the guard must not fire.
      const on = await withWriteAuth(actor, request(app).patch(`/api/users/${second.userId}`)).send({
        isActive: true,
      });
      expect(on.status).toBe(200);
      expect(on.body.isActive).toBe(true);

      const off = await withWriteAuth(actor, request(app).patch(`/api/users/${second.userId}`)).send({
        isActive: false,
      });
      expect(off.status).toBe(200);
      expect(off.body.isActive).toBe(false);
      expect(await prisma.user.findUnique({ where: { id: second.userId } })).not.toBeNull();
    } finally {
      await restore();
    }
  });

  it('no DELETE /api/users/:id route exists (deactivation replaces deletion)', async () => {
    const admin = await adminFixture('adm-g5');
    const res = await withWriteAuth(admin, request(app).delete('/api/users/1'));
    expect([404, 405]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// T-PWD-02 — set initial password (BR-07/BR-18, AC-16) + forced change
// ---------------------------------------------------------------------------
describe('T-PWD-02 — set initial password forces change at next login (AC-16)', () => {
  it('sets mustChangePassword, rotates the hash, and gates APIs until the user changes it', async () => {
    const admin = await adminFixture('adm-p1');
    const firstPassword = 'FirstPass1!';
    const created = await withWriteAuth(admin, request(app).post('/api/users')).send({
      name: 'Reset Target',
      email: uniqueEmail('reset-target'),
      role: 'IT_STAFF',
      initialPassword: firstPassword,
    });
    expect(created.status).toBe(201);
    const userId = created.body.id as number;
    createdUserIds.push(userId);

    // Issue a NEW initial password.
    const newPassword = 'ResetPass2@';
    const reset = await withWriteAuth(
      admin,
      request(app).post(`/api/users/${userId}/set-initial-password`),
    ).send({ initialPassword: newPassword });
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ id: userId, mustChangePassword: true });
    expect(reset.body.password).toBeUndefined();
    expect(reset.body.passwordHash).toBeUndefined();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(newPassword, row.passwordHash)).toBe(true);
    expect(await bcrypt.compare(firstPassword, row.passwordHash)).toBe(false);

    // Login with the new initial password works...
    clearLoginRateLimits();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: row.email, password: newPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const csrf = login.body.csrfToken as string;
    const session = { cookie, csrfToken: csrf };

    // ...but every normal API stays gated with 403 password_change_required.
    const gatedQueue = await withCookie(session, request(app).get('/api/staff/tickets'));
    expect(gatedQueue.status).toBe(403);
    expect(gatedQueue.body.code).toBe('password_change_required');

    const gatedUsers = await withCookie(session, request(app).get('/api/users'));
    expect(gatedUsers.status).toBe(403);
    expect(gatedUsers.body.code).toBe('password_change_required');

    // The user's own change clears the flag (full complexity enforced here).
    const change = await withWriteAuth(session, request(app).post('/api/auth/change-password')).send({
      newPassword: 'OwnChoice3#Pass',
      confirmPassword: 'OwnChoice3#Pass',
    });
    expect(change.status).toBe(200);
    expect(change.body.user.mustChangePassword).toBe(false);

    // Normal APIs are reachable again after the mandatory change.
    const me = await withCookie(session, request(app).get('/api/auth/me'));
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(false);
  });

  it('validates length bounds and allows an admin self-reset', async () => {
    const admin = await adminFixture('adm-p2');
    const short = await withWriteAuth(
      admin,
      request(app).post(`/api/users/${admin.userId}/set-initial-password`),
    ).send({ initialPassword: 'Short7!' });
    expect(short.status).toBe(400);
    expect(short.body.details[0]).toMatchObject({ field: 'initialPassword' });

    const long = await withWriteAuth(
      admin,
      request(app).post(`/api/users/${admin.userId}/set-initial-password`),
    ).send({ initialPassword: 'x'.repeat(73) });
    expect(long.status).toBe(400);

    const ok = await withWriteAuth(
      admin,
      request(app).post(`/api/users/${admin.userId}/set-initial-password`),
    ).send({ initialPassword: 'SelfReset1!' });
    expect(ok.status).toBe(200);
    expect(ok.body.mustChangePassword).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(await bcrypt.compare('SelfReset1!', row.passwordHash)).toBe(true);
  });

  it('404 for unknown user on set-initial-password', async () => {
    const admin = await adminFixture('adm-p3');
    const res = await withWriteAuth(
      admin,
      request(app).post('/api/users/999999/set-initial-password'),
    ).send({ initialPassword: 'Whatever1!' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');

    const missingBody = await withWriteAuth(
      admin,
      request(app).post('/api/users/999999/set-initial-password'),
    ).send({});
    expect(missingBody.status).toBe(404); // not-found beats validation for a bogus id
  });

  it('HttpError shape survives direct service rejections (contract check)', async () => {
    const actor = await adminFixture('adm-p4');
    const target = await prisma.user.create({
      data: {
        name: 'Contract Admin',
        email: uniqueEmail('contract-admin'),
        passwordHash: await bcrypt.hash('ContractPass1!', 4),
        role: 'ADMINISTRATOR',
        isActive: true,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(target.id);
    const restore = await isolateActiveAdmin(target.id);
    try {
      const err = await updateUser(prisma, target.id, { isActive: false }, actor.userId).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
    } finally {
      await restore();
    }
  });
});
