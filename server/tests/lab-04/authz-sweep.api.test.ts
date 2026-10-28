import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  cleanupAllSessions,
  createSession,
  withCookie,
  withWriteAuth,
  uniqueEmail,
  type SessionFixture,
} from '../helpers/session.js';

// Lab 4 — Authorization Sweep Test Suite
// Contract: docs/lab-04/tests.md (AUTHZ-01..AUTHZ-05) & docs/lab-04/api-spec.md §7
//
// Reserved probe band: TTK-2026-904xxx
// Serial execution (fileParallelism: false)
// Every test session, ticket, attachment, and action is tracked and cleaned up in afterAll.

const prisma = getPrisma();
const BAND_BASE = 904000;
let counter = 0;

function nextNumber(): string {
  counter += 1;
  return `TTK-2026-${String(BAND_BASE + counter).padStart(6, '0')}`;
}

const sessions: SessionFixture[] = [];
let requesterOwner: SessionFixture;
let requesterNonOwner: SessionFixture;
let itStaff: SessionFixture;
let itStaffB: SessionFixture;
let admin: SessionFixture;
let deactivatedStaff: SessionFixture;

let ownerTicket: { id: number; ticketNumber: string };
let foreignTicket: { id: number; ticketNumber: string };
let probeAction: { id: number; version: number };
let probeAttachment: { id: number };

const createdTicketNumbers: string[] = [];

function assertSafeErrorEnvelope(res: request.Response): void {
  expect(res.body).not.toHaveProperty('stack');
  if (res.status >= 400 && res.body && typeof res.body === 'object') {
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  }
}

beforeAll(async () => {
  requesterOwner = await createSession({
    label: 'az-owner',
    role: 'REQUESTER',
    withLinkedRequester: true,
  });
  sessions.push(requesterOwner);

  requesterNonOwner = await createSession({
    label: 'az-foreign',
    role: 'REQUESTER',
    withLinkedRequester: true,
  });
  sessions.push(requesterNonOwner);

  itStaff = await createSession({
    label: 'az-staff',
    role: 'IT_STAFF',
  });
  sessions.push(itStaff);

  itStaffB = await createSession({
    label: 'az-staff-b',
    role: 'IT_STAFF',
  });
  sessions.push(itStaffB);

  admin = await createSession({
    label: 'az-admin',
    role: 'ADMINISTRATOR',
  });
  sessions.push(admin);

  deactivatedStaff = await createSession({
    label: 'az-deact-staff',
    role: 'IT_STAFF',
  });
  sessions.push(deactivatedStaff);
  await prisma.user.update({
    where: { id: deactivatedStaff.userId },
    data: { isActive: false },
  });

  // Create probe tickets in reserved band
  const tOwnerNum = nextNumber();
  createdTicketNumbers.push(tOwnerNum);
  const tOwnerRow = await prisma.ticket.create({
    data: {
      ticketNumber: tOwnerNum,
      title: 'Owner Ticket for Authz Sweep',
      description: 'Owned by requesterOwner',
      status: 'OPEN',
      priority: 'MEDIUM',
      itPriority: 'HIGH',
      requesterId: requesterOwner.requesterId!,
      categoryId: 1,
      relatedSystemId: 1,
      version: 1,
    },
  });
  ownerTicket = { id: tOwnerRow.id, ticketNumber: tOwnerRow.ticketNumber };

  const tForeignNum = nextNumber();
  createdTicketNumbers.push(tForeignNum);
  const tForeignRow = await prisma.ticket.create({
    data: {
      ticketNumber: tForeignNum,
      title: 'Foreign Ticket for Authz Sweep',
      description: 'Owned by requesterNonOwner',
      status: 'OPEN',
      priority: 'MEDIUM',
      itPriority: 'LOW',
      requesterId: requesterNonOwner.requesterId!,
      categoryId: 1,
      relatedSystemId: 1,
      version: 1,
    },
  });
  foreignTicket = { id: tForeignRow.id, ticketNumber: tForeignRow.ticketNumber };

  // Create probe action on ownerTicket
  const actionRow = await prisma.actionTaken.create({
    data: {
      ticketId: ownerTicket.id,
      performedById: itStaff.userId,
      actionAt: new Date(),
      description: 'Initial diagnostic action for sweep',
      result: 'Diagnostic completed',
      followUpRequired: false,
      version: 1,
    },
  });
  probeAction = { id: actionRow.id, version: actionRow.version };

  // Create probe attachment on ownerTicket
  const attachRow = await prisma.attachment.create({
    data: {
      ticketId: ownerTicket.id,
      fileName: 'authz-probe.png',
      storedName: `authz-stored-${Date.now()}`,
      mimeType: 'image/png',
      sizeBytes: 64,
    },
  });
  probeAttachment = { id: attachRow.id };
}, 60_000);

afterAll(async () => {
  if (createdTicketNumbers.length > 0) {
    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: createdTicketNumbers } },
      select: { id: true },
    });
    const ticketIds = tickets.map((t) => t.id);

    await prisma.actionTaken.deleteMany({
      where: { ticketId: { in: ticketIds } },
    }).catch(() => undefined);

    await prisma.attachmentEvent.deleteMany({
      where: { attachment: { ticketId: { in: ticketIds } } },
    }).catch(() => undefined);

    await prisma.attachment.deleteMany({
      where: { ticketId: { in: ticketIds } },
    }).catch(() => undefined);

    await prisma.publicComment.deleteMany({
      where: { ticketId: { in: ticketIds } },
    }).catch(() => undefined);

    await prisma.internalNote.deleteMany({
      where: { ticketId: { in: ticketIds } },
    }).catch(() => undefined);

    await prisma.ticket.deleteMany({
      where: { id: { in: ticketIds } },
    }).catch(() => undefined);
  }

  // Restore deactivated user before session cleanup to avoid FK constraints
  if (deactivatedStaff?.userId) {
    await prisma.user.update({
      where: { id: deactivatedStaff.userId },
      data: { isActive: true },
    }).catch(() => undefined);
  }

  await cleanupAllSessions();
  await prisma.$disconnect().catch(() => undefined);
});

describe('AUTHZ-01 — Actions Taken write sweep (BR-14 / AC-04)', () => {
  it('unauthenticated POST and PATCH return 401 without creating or mutating rows', async () => {
    const initialActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });

    const postRes = await request(app)
      .post(`/api/tickets/${ownerTicket.ticketNumber}/actions`)
      .send({
        description: 'Unauthenticated action attempt',
        result: 'Should fail with 401',
      });
    expect(postRes.status).toBe(401);
    assertSafeErrorEnvelope(postRes);

    const patchRes = await request(app)
      .patch(`/api/tickets/${ownerTicket.ticketNumber}/actions/${probeAction.id}`)
      .send({
        expectedVersion: probeAction.version,
        description: 'Unauthenticated edit attempt',
      });
    expect(patchRes.status).toBe(401);
    assertSafeErrorEnvelope(patchRes);

    const afterActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });
    expect(afterActionCount).toBe(initialActionCount);

    const currentAction = await prisma.actionTaken.findUniqueOrThrow({
      where: { id: probeAction.id },
    });
    expect(currentAction.version).toBe(probeAction.version);
    expect(currentAction.description).toBe('Initial diagnostic action for sweep');
  });

  it('Requester calling write on own ticket returns 403 FORBIDDEN without mutating rows', async () => {
    const initialActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });

    const postRes = await withWriteAuth(
      requesterOwner,
      request(app).post(`/api/tickets/${ownerTicket.ticketNumber}/actions`),
    ).send({
      description: 'Owner requester cannot record actions',
      result: 'Should be rejected with 403',
    });
    expect(postRes.status).toBe(403);
    assertSafeErrorEnvelope(postRes);

    const patchRes = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/tickets/${ownerTicket.ticketNumber}/actions/${probeAction.id}`),
    ).send({
      expectedVersion: probeAction.version,
      description: 'Owner requester cannot patch actions',
    });
    expect(patchRes.status).toBe(403);
    assertSafeErrorEnvelope(patchRes);

    const afterActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });
    expect(afterActionCount).toBe(initialActionCount);

    const currentAction = await prisma.actionTaken.findUniqueOrThrow({
      where: { id: probeAction.id },
    });
    expect(currentAction.version).toBe(probeAction.version);
  });

  it('Requester calling write on foreign ticket returns masked 404 NOT_FOUND without existence leak', async () => {
    const postRes = await withWriteAuth(
      requesterNonOwner,
      request(app).post(`/api/tickets/${ownerTicket.ticketNumber}/actions`),
    ).send({
      description: 'Non-owner requester writing action',
      result: 'Should receive masked 404',
    });
    expect(postRes.status).toBe(404);
    assertSafeErrorEnvelope(postRes);
    expect(postRes.body.error).toBe('Ticket not found');

    const patchRes = await withWriteAuth(
      requesterNonOwner,
      request(app).patch(`/api/tickets/${ownerTicket.ticketNumber}/actions/${probeAction.id}`),
    ).send({
      expectedVersion: probeAction.version,
      description: 'Non-owner requester patching action',
    });
    expect(patchRes.status).toBe(404);
    assertSafeErrorEnvelope(patchRes);
    expect(patchRes.body.error).toBe('Ticket not found');
  });

  it('inactive staff member write attempt is rejected without row mutation (AC-23)', async () => {
    const initialActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });

    const postRes = await withWriteAuth(
      deactivatedStaff,
      request(app).post(`/api/tickets/${ownerTicket.ticketNumber}/actions`),
    ).send({
      description: 'Deactivated staff writing action',
      result: 'Should be rejected',
    });
    expect([401, 403]).toContain(postRes.status);
    assertSafeErrorEnvelope(postRes);

    const patchRes = await withWriteAuth(
      deactivatedStaff,
      request(app).patch(`/api/tickets/${ownerTicket.ticketNumber}/actions/${probeAction.id}`),
    ).send({
      expectedVersion: probeAction.version,
      description: 'Deactivated staff patching action',
    });
    expect([401, 403]).toContain(patchRes.status);
    assertSafeErrorEnvelope(patchRes);

    const afterActionCount = await prisma.actionTaken.count({
      where: { ticketId: ownerTicket.id },
    });
    expect(afterActionCount).toBe(initialActionCount);
  });
});

describe('AUTHZ-02 — Dashboard route sweep across all roles (BR-14 / AC-04, AC-14)', () => {
  it('GET /api/dashboard/requester: 200 for Requester, 403 for IT Staff & Admin, 401 unauth', async () => {
    const unauth = await request(app).get('/api/dashboard/requester');
    expect(unauth.status).toBe(401);
    assertSafeErrorEnvelope(unauth);

    const reqRes = await withCookie(requesterOwner, request(app).get('/api/dashboard/requester'));
    expect(reqRes.status).toBe(200);
    expect(reqRes.body).toHaveProperty('activeCount');
    expect(reqRes.body).toHaveProperty('waitingForRequesterCount');
    expect(reqRes.body).toHaveProperty('resolvedCount');
    expect(reqRes.body).toHaveProperty('closedCount');
    expect(Array.isArray(reqRes.body.recentlyUpdated)).toBe(true);
    expect(Array.isArray(reqRes.body.recentlyResolved)).toBe(true);

    const staffRes = await withCookie(itStaff, request(app).get('/api/dashboard/requester'));
    expect(staffRes.status).toBe(403);
    assertSafeErrorEnvelope(staffRes);

    const adminRes = await withCookie(admin, request(app).get('/api/dashboard/requester'));
    expect(adminRes.status).toBe(403);
    assertSafeErrorEnvelope(adminRes);
  });

  it('GET /api/dashboard/staff: 200 for IT Staff and Admin, 403 for Requester, 401 unauth (AC-17)', async () => {
    const unauth = await request(app).get('/api/dashboard/staff');
    expect(unauth.status).toBe(401);
    assertSafeErrorEnvelope(unauth);

    const reqRes = await withCookie(requesterOwner, request(app).get('/api/dashboard/staff'));
    expect(reqRes.status).toBe(403);
    assertSafeErrorEnvelope(reqRes);

    const staffRes = await withCookie(itStaff, request(app).get('/api/dashboard/staff'));
    expect(staffRes.status).toBe(200);
    expect(staffRes.body).toHaveProperty('countsByStatus');
    expect(staffRes.body).toHaveProperty('unassignedActiveCount');
    expect(staffRes.body).toHaveProperty('myActiveOwnedCount');
    expect(staffRes.body).not.toHaveProperty('userCounts');

    const adminRes = await withCookie(admin, request(app).get('/api/dashboard/staff'));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toHaveProperty('countsByStatus');
    expect(adminRes.body).toHaveProperty('userCounts');
    expect(adminRes.body.userCounts).toHaveProperty('active');
    expect(adminRes.body.userCounts).toHaveProperty('inactive');
  });
});

describe('AUTHZ-03 — Staff ticket write routes permissions (BR-14, BR-15 / AC-17)', () => {
  it('Requester is rejected with 403 (or masked 404 for notes) on every staff ticket write route', async () => {
    const targetTicket = foreignTicket;
    const initialTicket = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: targetTicket.ticketNumber },
    });

    // 1. PATCH status
    const statusRes = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/staff/tickets/${targetTicket.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS', expectedVersion: initialTicket.version });
    expect(statusRes.status).toBe(403);
    assertSafeErrorEnvelope(statusRes);

    // 2. PATCH owner
    const ownerRes = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/staff/tickets/${targetTicket.ticketNumber}/owner`),
    ).send({ ownerId: itStaff.userId, expectedVersion: initialTicket.version });
    expect(ownerRes.status).toBe(403);
    assertSafeErrorEnvelope(ownerRes);

    // 3. PATCH it-priority
    const prioRes = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/staff/tickets/${targetTicket.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: initialTicket.version });
    expect(prioRes.status).toBe(403);
    assertSafeErrorEnvelope(prioRes);

    // 4. POST internal notes (masked 404 to prevent existence leak)
    const notesRes = await withWriteAuth(
      requesterOwner,
      request(app).post(`/api/staff/tickets/${targetTicket.ticketNumber}/internal-notes`),
    ).send({ body: 'Requester cannot leave internal notes' });
    expect(notesRes.status).toBe(404);
    assertSafeErrorEnvelope(notesRes);

    // 5. Staff alias checks if called (claim / assign / notes)
    const claimRes = await withWriteAuth(
      requesterOwner,
      request(app).post(`/api/staff/tickets/${targetTicket.ticketNumber}/claim`),
    );
    expect([403, 404]).toContain(claimRes.status);

    const assignRes = await withWriteAuth(
      requesterOwner,
      request(app).post(`/api/staff/tickets/${targetTicket.ticketNumber}/assign`),
    ).send({ ownerId: itStaff.userId });
    expect([403, 404]).toContain(assignRes.status);

    // Verify row was not mutated
    const afterTicket = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: targetTicket.ticketNumber },
    });
    expect(afterTicket.status).toBe(initialTicket.status);
    expect(afterTicket.ownerId).toBe(initialTicket.ownerId);
    expect(afterTicket.itPriority).toBe(initialTicket.itPriority);
    expect(afterTicket.version).toBe(initialTicket.version);
  });

  it('Requester status change on own ticket via requester route returns 403 (D-06)', async () => {
    const res = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/tickets/${ownerTicket.ticketNumber}/status`),
    ).send({ status: 'CANCELLED' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only IT Staff may change ticket status');
    assertSafeErrorEnvelope(res);
  });

  it('IT Staff and Admin can execute staff ticket write operations (D-01)', async () => {
    const probeNum = nextNumber();
    createdTicketNumbers.push(probeNum);
    const probe = await prisma.ticket.create({
      data: {
        ticketNumber: probeNum,
        title: 'Staff Operation Verification Ticket',
        status: 'OPEN',
        priority: 'MEDIUM',
        itPriority: null,
        requesterId: requesterOwner.requesterId!,
        categoryId: 1,
        relatedSystemId: 1,
        version: 1,
      },
    });

    // IT Staff can claim/assign owner
    const staffOwnerRes = await withWriteAuth(
      itStaff,
      request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/owner`),
    ).send({ ownerId: itStaff.userId, expectedVersion: 1 });
    expect(staffOwnerRes.status).toBe(200);
    expect(staffOwnerRes.body.owner.id).toBe(itStaff.userId);

    // IT Staff can set it-priority
    const staffPrioRes = await withWriteAuth(
      itStaff,
      request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/it-priority`),
    ).send({ itPriority: 'HIGH', expectedVersion: 2 });
    expect(staffPrioRes.status).toBe(200);
    expect(staffPrioRes.body.itPriority).toBe('HIGH');

    // IT Staff can transition status
    const staffStatusRes = await withWriteAuth(
      itStaff,
      request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS', expectedVersion: 3 });
    expect(staffStatusRes.status).toBe(200);
    expect(staffStatusRes.body.status).toBe('IN_PROGRESS');

    // Admin can also perform staff write operations (D-01)
    const adminOwnerRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/owner`),
    ).send({ ownerId: itStaffB.userId, expectedVersion: 4 });
    expect(adminOwnerRes.status).toBe(200);
    expect(adminOwnerRes.body.owner.id).toBe(itStaffB.userId);

    const adminPrioRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: 5 });
    expect(adminPrioRes.status).toBe(200);
    expect(adminPrioRes.body.itPriority).toBe('CRITICAL');

    // IT Staff and Admin can record internal notes
    const noteRes = await withWriteAuth(
      itStaff,
      request(app).post(`/api/staff/tickets/${probe.ticketNumber}/internal-notes`),
    ).send({ body: 'Diagnostic test note by staff.' });
    expect(noteRes.status).toBe(201);
  });
});

describe('AUTHZ-04 — User management routes authorization (BR-14 / AC-17)', () => {
  it('GET /api/users*: 403 for IT Staff & Requester, 401 unauth, 200 for Admin', async () => {
    const unauth = await request(app).get('/api/users');
    expect(unauth.status).toBe(401);
    assertSafeErrorEnvelope(unauth);

    const reqRes = await withCookie(requesterOwner, request(app).get('/api/users'));
    expect(reqRes.status).toBe(403);
    assertSafeErrorEnvelope(reqRes);

    const staffRes = await withCookie(itStaff, request(app).get('/api/users'));
    expect(staffRes.status).toBe(403);
    assertSafeErrorEnvelope(staffRes);

    const adminRes = await withCookie(admin, request(app).get('/api/users'));
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body.data)).toBe(true);
    expect(adminRes.body.data.length).toBeGreaterThan(0);
  });

  it('POST /api/users, PATCH /api/users/:id, password reset: Admin only, Staff & Requester 403', async () => {
    const targetUserId = itStaffB.userId;

    // POST /api/users
    const postReq = await withWriteAuth(
      requesterOwner,
      request(app).post('/api/users'),
    ).send({
      name: 'Rogue User',
      email: uniqueEmail('rogue'),
      role: 'REQUESTER',
    });
    expect(postReq.status).toBe(403);
    assertSafeErrorEnvelope(postReq);

    const postStaff = await withWriteAuth(
      itStaff,
      request(app).post('/api/users'),
    ).send({
      name: 'Rogue User 2',
      email: uniqueEmail('rogue2'),
      role: 'REQUESTER',
    });
    expect(postStaff.status).toBe(403);
    assertSafeErrorEnvelope(postStaff);

    // PATCH /api/users/:id
    const patchReq = await withWriteAuth(
      requesterOwner,
      request(app).patch(`/api/users/${targetUserId}`),
    ).send({ name: 'Hacked Name' });
    expect(patchReq.status).toBe(403);
    assertSafeErrorEnvelope(patchReq);

    const patchStaff = await withWriteAuth(
      itStaff,
      request(app).patch(`/api/users/${targetUserId}`),
    ).send({ name: 'Hacked Name 2' });
    expect(patchStaff.status).toBe(403);
    assertSafeErrorEnvelope(patchStaff);

    // Password reset / set-initial-password
    const pwdReq = await withWriteAuth(
      requesterOwner,
      request(app).post(`/api/users/${targetUserId}/set-initial-password`),
    ).send({ initialPassword: 'ValidPass123!' });
    expect(pwdReq.status).toBe(403);
    assertSafeErrorEnvelope(pwdReq);

    const pwdStaff = await withWriteAuth(
      itStaff,
      request(app).post(`/api/users/${targetUserId}/set-initial-password`),
    ).send({ initialPassword: 'ValidPass123!' });
    expect(pwdStaff.status).toBe(403);
    assertSafeErrorEnvelope(pwdStaff);

    // Verify row was not tampered
    const untampered = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
    expect(untampered.name).toBe(itStaffB.name);
  });
});

describe('AUTHZ-05 — Route census & protection integrity (BR-14, BR-16 / AC-04)', () => {
  const PUBLIC_WHITELIST = new Set([
    'GET /api/health',
    'GET /api/categories',
    'GET /api/related-systems',
    'POST /api/auth/login',
    'POST /api/auth/forgot-password',
  ]);

  function collectRegisteredRoutes(): Array<{ method: string; path: string }> {
    const knownMounts = [
      '/api/auth',
      '/api/tickets',
      '/api/dashboard',
      '/api/staff',
      '/api/users',
      '/api',
    ];

    const routerStack = (app as any)._router?.stack || (app as any).router?.stack || [];
    const routes: Array<{ method: string; path: string }> = [];

    for (const layer of routerStack) {
      if (layer.route) {
        const path = layer.route.path;
        for (const m of Object.keys(layer.route.methods)) {
          if (layer.route.methods[m]) {
            routes.push({ method: m.toUpperCase(), path });
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        let mount = '';
        if (layer.matchers && layer.matchers[0]) {
          const fn = layer.matchers[0];
          mount = knownMounts.find((k) => fn(k)) || '';
        }
        for (const subLayer of layer.handle.stack) {
          if (subLayer.route) {
            const subPath = (mount + (subLayer.route.path === '/' ? '' : subLayer.route.path)).replace(/\/+/g, '/');
            for (const m of Object.keys(subLayer.route.methods)) {
              if (subLayer.route.methods[m]) {
                routes.push({ method: m.toUpperCase(), path: subPath || '/' });
              }
            }
          }
        }
      }
    }
    return routes;
  }

  it('enumerates registered routes and asserts every protected route rejects unauthenticated requests', async () => {
    const registered = collectRegisteredRoutes();
    expect(registered.length).toBeGreaterThanOrEqual(30);

    const publicRoutes: string[] = [];
    const protectedRoutes: string[] = [];

    for (const route of registered) {
      const key = `${route.method} ${route.path}`;
      if (PUBLIC_WHITELIST.has(key)) {
        publicRoutes.push(key);
      } else {
        protectedRoutes.push(key);
      }
    }

    // Verify public whitelist strictly matches expected public surface
    expect(publicRoutes.sort()).toEqual(Array.from(PUBLIC_WHITELIST).sort());

    // Test a concrete URL sample for each protected route pattern
    for (const route of registered) {
      const key = `${route.method} ${route.path}`;
      if (PUBLIC_WHITELIST.has(key)) continue;

      const concretePath = route.path
        .replace(':ticketNumber', ownerTicket.ticketNumber)
        .replace(':actionId', String(probeAction.id))
        .replace(':attachmentId', String(probeAttachment.id))
        .replace(':id', String(itStaff.userId));

      let testReq: request.Test;
      switch (route.method) {
        case 'GET':
          testReq = request(app).get(concretePath);
          break;
        case 'POST':
          testReq = request(app).post(concretePath).send({});
          break;
        case 'PATCH':
          testReq = request(app).patch(concretePath).send({});
          break;
        case 'DELETE':
          testReq = request(app).delete(concretePath);
          break;
        default:
          continue;
      }

      const res = await testReq;
      // Protected routes must reject unauthenticated callers with 401 (or 403 CSRF/forbidden before auth, or 404 masked)
      // Never 200/201 and never 500!
      expect(
        [401, 403, 404].includes(res.status),
        `Route ${key} called anonymously at ${concretePath} returned unpermitted status ${res.status}: ${JSON.stringify(res.body)}`,
      ).toBe(true);

      assertSafeErrorEnvelope(res);
    }
  });
});

describe('Full Route & Role Matrix (Requester Owner, Non-Owner, IT Staff, Admin, Deactivated)', () => {
  it('Requester isolation on /api/tickets: owner gets 200, non-owner gets masked 404', async () => {
    // Owner reads own detail
    const ownerRes = await withCookie(
      requesterOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}`),
    );
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.ticketNumber).toBe(ownerTicket.ticketNumber);

    // Non-owner gets masked 404
    const foreignRes = await withCookie(
      requesterNonOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}`),
    );
    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.error).toBe('Ticket not found');
    assertSafeErrorEnvelope(foreignRes);

    // Owner reads own comments
    const ownerComments = await withCookie(
      requesterOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/comments`),
    );
    expect(ownerComments.status).toBe(200);

    // Non-owner gets masked 404 on comments
    const foreignComments = await withCookie(
      requesterNonOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/comments`),
    );
    expect(foreignComments.status).toBe(404);
    assertSafeErrorEnvelope(foreignComments);

    // Owner reads own actions
    const ownerActions = await withCookie(
      requesterOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/actions`),
    );
    expect(ownerActions.status).toBe(200);
    expect(Array.isArray(ownerActions.body.actions)).toBe(true);

    // Non-owner gets masked 404 on actions
    const foreignActions = await withCookie(
      requesterNonOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/actions`),
    );
    expect(foreignActions.status).toBe(404);
    expect(foreignActions.body.error).toBe('Ticket not found');
    assertSafeErrorEnvelope(foreignActions);

    // Owner reads own attachments download
    const ownerAttach = await withCookie(
      requesterOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/attachments/${probeAttachment.id}/download`),
    );
    expect([200, 302, 404]).toContain(ownerAttach.status); // 404 if file binary not on disk, but never 403

    // Non-owner gets masked 404 on attachments download
    const foreignAttach = await withCookie(
      requesterNonOwner,
      request(app).get(`/api/tickets/${ownerTicket.ticketNumber}/attachments/${probeAttachment.id}/download`),
    );
    expect(foreignAttach.status).toBe(404);
    assertSafeErrorEnvelope(foreignAttach);
  });

  it('Requester ticket list is strictly owner-scoped (AC-02 / BR-03)', async () => {
    const listRes = await withCookie(requesterOwner, request(app).get('/api/tickets'));
    expect(listRes.status).toBe(200);
    const numbers = listRes.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toContain(ownerTicket.ticketNumber);
    expect(numbers).not.toContain(foreignTicket.ticketNumber);
  });

  it('Auth endpoints authorization: /me, /change-password, /logout', async () => {
    // 1. /api/auth/me
    const meUnauth = await request(app).get('/api/auth/me');
    expect(meUnauth.status).toBe(401);
    assertSafeErrorEnvelope(meUnauth);

    const meAuth = await withCookie(itStaff, request(app).get('/api/auth/me'));
    expect(meAuth.status).toBe(200);
    expect(meAuth.body.user.email).toBe(itStaff.email);
    expect(meAuth.body.user).not.toHaveProperty('passwordHash');

    // 2. /api/auth/change-password
    const changeUnauth = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'StartValid1!', newPassword: 'FreshPass123!' });
    expect([401, 403]).toContain(changeUnauth.status);
    assertSafeErrorEnvelope(changeUnauth);

    // 3. /api/auth/logout
    const logoutUnauth = await request(app).post('/api/auth/logout');
    expect(logoutUnauth.status).toBe(401);
    assertSafeErrorEnvelope(logoutUnauth);
  });

  it('Staff queue and staff detail routes: 200 for IT Staff & Admin, 403 for Requester', async () => {
    // GET /api/staff/tickets
    const queueStaff = await withCookie(itStaff, request(app).get('/api/staff/tickets'));
    expect(queueStaff.status).toBe(200);
    expect(Array.isArray(queueStaff.body.data)).toBe(true);

    const queueAdmin = await withCookie(admin, request(app).get('/api/staff/tickets'));
    expect(queueAdmin.status).toBe(200);

    const queueReq = await withCookie(requesterOwner, request(app).get('/api/staff/tickets'));
    expect(queueReq.status).toBe(403);
    assertSafeErrorEnvelope(queueReq);

    // GET /api/staff/tickets/:number
    const detailStaff = await withCookie(
      itStaff,
      request(app).get(`/api/staff/tickets/${ownerTicket.ticketNumber}`),
    );
    expect(detailStaff.status).toBe(200);
    expect(detailStaff.body.ticketNumber).toBe(ownerTicket.ticketNumber);
    expect(detailStaff.body).toHaveProperty('version');

    const detailAdmin = await withCookie(
      admin,
      request(app).get(`/api/staff/tickets/${ownerTicket.ticketNumber}`),
    );
    expect(detailAdmin.status).toBe(200);

    const detailReq = await withCookie(
      requesterOwner,
      request(app).get(`/api/staff/tickets/${ownerTicket.ticketNumber}`),
    );
    expect(detailReq.status).toBe(403);
    assertSafeErrorEnvelope(detailReq);

    // GET /api/staff/owners
    const ownersStaff = await withCookie(itStaff, request(app).get('/api/staff/owners'));
    expect(ownersStaff.status).toBe(200);
    expect(Array.isArray(ownersStaff.body)).toBe(true);

    const ownersReq = await withCookie(requesterOwner, request(app).get('/api/staff/owners'));
    expect(ownersReq.status).toBe(403);
    assertSafeErrorEnvelope(ownersReq);
  });
});
