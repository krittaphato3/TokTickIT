import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { createSession, type SessionFixture } from '../helpers/session.js';
import type { PrismaClient } from '@prisma/client';

// L4-5 — Staff / Admin Dashboard API (docs/lab-04/api-spec.md §4.2 / tests.md API-14).
// Cross-checks every metric against independent Prisma queries.
// Validates role scoping: Requester -> 403, IT Staff -> no userCounts, Admin -> userCounts present.

const prisma: PrismaClient = getPrisma();

describe('GET /api/dashboard/staff — Staff / Admin Dashboard API (AC-14, AC-17)', () => {
  let staffSession: SessionFixture;
  let adminSession: SessionFixture;
  let requesterSession: SessionFixture;

  beforeAll(async () => {
    staffSession = await createSession({
      label: 'stf-dash',
      role: 'IT_STAFF',
    });
    adminSession = await createSession({
      label: 'adm-dash',
      role: 'ADMINISTRATOR',
    });
    requesterSession = await createSession({
      label: 'req-dash-403',
      role: 'REQUESTER',
    });
  });

  afterAll(async () => {
    await staffSession?.dispose();
    await adminSession?.dispose();
    await requesterSession?.dispose();
    await prisma.$disconnect().catch(() => undefined);
  });

  it('401 when unauthenticated', async () => {
    const res = await request(app).get('/api/dashboard/staff');
    expect(res.status).toBe(401);
  });

  it('403 when called by a Requester', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', requesterSession.cookie);
    expect(res.status).toBe(403);
  });

  it('400 when unknown query parameter is passed', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff?extra=1')
      .set('Cookie', staffSession.cookie);
    expect(res.status).toBe(400);
  });

  it('returns all staff metrics matching independent DB queries and OMITS userCounts for IT Staff', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', staffSession.cookie);

    expect(res.status).toBe(200);
    const body = res.body;

    const activeStatuses = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];

    // Independent checks
    const expectedCountsByStatus: Record<string, number> = {
      NEW: await prisma.ticket.count({ where: { status: 'NEW' } }),
      OPEN: await prisma.ticket.count({ where: { status: 'OPEN' } }),
      IN_PROGRESS: await prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      WAITING_FOR_REQUESTER: await prisma.ticket.count({ where: { status: 'WAITING_FOR_REQUESTER' } }),
      RESOLVED: await prisma.ticket.count({ where: { status: 'RESOLVED' } }),
      CLOSED: await prisma.ticket.count({ where: { status: 'CLOSED' } }),
      REOPENED: await prisma.ticket.count({ where: { status: 'REOPENED' } }),
      CANCELLED: await prisma.ticket.count({ where: { status: 'CANCELLED' } }),
    };

    expect(body.countsByStatus).toEqual(expectedCountsByStatus);

    const expectedUnassignedActive = await prisma.ticket.count({
      where: { ownerId: null, status: { in: activeStatuses as any } },
    });
    expect(body.unassignedActiveCount).toBe(expectedUnassignedActive);

    const expectedMyActive = await prisma.ticket.count({
      where: { ownerId: staffSession.userId, status: { in: activeStatuses as any } },
    });
    expect(body.myActiveOwnedCount).toBe(expectedMyActive);

    const expectedCountsByItPriority = {
      LOW: await prisma.ticket.count({ where: { itPriority: 'LOW', status: { in: activeStatuses as any } } }),
      MEDIUM: await prisma.ticket.count({ where: { itPriority: 'MEDIUM', status: { in: activeStatuses as any } } }),
      HIGH: await prisma.ticket.count({ where: { itPriority: 'HIGH', status: { in: activeStatuses as any } } }),
      CRITICAL: await prisma.ticket.count({ where: { itPriority: 'CRITICAL', status: { in: activeStatuses as any } } }),
    };
    expect(body.countsByItPriority).toEqual(expectedCountsByItPriority);

    expect(Array.isArray(body.recentlyUpdated)).toBe(true);
    expect(body.recentlyUpdated.length).toBeLessThanOrEqual(5);

    expect(Array.isArray(body.myRecentActions)).toBe(true);
    expect(body.myRecentActions.length).toBeLessThanOrEqual(5);

    // IT_STAFF must NOT receive userCounts (AC-17)
    expect(body.userCounts).toBeUndefined();
  });

  it('returns userCounts for Administrator sessions matching independent user queries', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', adminSession.cookie);

    expect(res.status).toBe(200);
    const body = res.body;

    expect(body.userCounts).toBeDefined();

    const expectedRequester = await prisma.user.count({ where: { role: 'REQUESTER' } });
    const expectedItStaff = await prisma.user.count({ where: { role: 'IT_STAFF' } });
    const expectedAdmin = await prisma.user.count({ where: { role: { in: ['ADMINISTRATOR', 'ADMIN'] as any } } });
    const expectedActive = await prisma.user.count({ where: { isActive: true } });
    const expectedInactive = await prisma.user.count({ where: { isActive: false } });

    expect(body.userCounts).toEqual({
      requester: expectedRequester,
      itStaff: expectedItStaff,
      administrator: expectedAdmin,
      active: expectedActive,
      inactive: expectedInactive,
    });
  });
});
