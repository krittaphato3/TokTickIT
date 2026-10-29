import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { createSession, type SessionFixture } from '../helpers/session.js';
import type { PrismaClient } from '@prisma/client';

// L4-5 — Requester Dashboard API (docs/lab-04/api-spec.md §4.1 / tests.md API-13).
// Every metric is cross-checked against an independent Prisma query.
// Requester isolation: client-supplied identity is ignored; IT staff / Admin get 403.

const prisma: PrismaClient = getPrisma();

describe('GET /api/dashboard/requester — Requester Dashboard API (AC-02, AC-13)', () => {
  let requesterSession: SessionFixture;
  let zeroRequesterSession: SessionFixture;
  let staffSession: SessionFixture;
  let adminSession: SessionFixture;

  beforeAll(async () => {
    requesterSession = await createSession({
      label: 'req-dash',
      role: 'REQUESTER',
      withLinkedRequester: true,
    });
    zeroRequesterSession = await createSession({
      label: 'zero-dash',
      role: 'REQUESTER',
      withLinkedRequester: true,
    });
    staffSession = await createSession({
      label: 'staff-dash',
      role: 'IT_STAFF',
    });
    adminSession = await createSession({
      label: 'admin-dash',
      role: 'ADMINISTRATOR',
    });

    // Create demo tickets for requesterSession
    const category = await prisma.category.findFirstOrThrow();
    const system = await prisma.relatedSystem.findFirstOrThrow();

    const activeStatuses = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];
    for (const status of activeStatuses) {
      await prisma.ticket.create({
        data: {
          ticketNumber: `TTK-2026-99${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          title: `Active ticket ${status}`,
          description: 'Description',
          status: status as any,
          priority: 'MEDIUM',
          categoryId: category.id,
          relatedSystemId: system.id,
          requesterId: requesterSession.requesterId!,
        },
      });
    }

    // Resolved ticket
    await prisma.ticket.create({
      data: {
        ticketNumber: `TTK-2026-99${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        title: 'Resolved ticket',
        description: 'Description',
        status: 'RESOLVED',
        priority: 'HIGH',
        categoryId: category.id,
        relatedSystemId: system.id,
        requesterId: requesterSession.requesterId!,
      },
    });

    // Closed ticket
    await prisma.ticket.create({
      data: {
        ticketNumber: `TTK-2026-99${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        title: 'Closed ticket',
        description: 'Description',
        status: 'CLOSED',
        priority: 'LOW',
        categoryId: category.id,
        relatedSystemId: system.id,
        requesterId: requesterSession.requesterId!,
      },
    });
  });

  afterAll(async () => {
    await requesterSession?.dispose();
    await zeroRequesterSession?.dispose();
    await staffSession?.dispose();
    await adminSession?.dispose();
    await prisma.$disconnect().catch(() => undefined);
  });

  it('401 when called without a session', async () => {
    const res = await request(app).get('/api/dashboard/requester');
    expect(res.status).toBe(401);
  });

  it('403 for IT Staff and Administrator sessions', async () => {
    const staffRes = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', staffSession.cookie);
    expect(staffRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', adminSession.cookie);
    expect(adminRes.status).toBe(403);
  });

  it('400 when unknown query parameter is supplied', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester?foo=bar')
      .set('Cookie', requesterSession.cookie);
    expect(res.status).toBe(400);
  });

  it('returns all metrics matching independent DB queries for active requester', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', requesterSession.cookie);

    expect(res.status).toBe(200);
    const body = res.body;

    const activeStatuses = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];

    // Independent DB queries
    const expectedActive = await prisma.ticket.count({
      where: { requesterId: requesterSession.requesterId!, status: { in: activeStatuses as any } },
    });
    const expectedWaiting = await prisma.ticket.count({
      where: { requesterId: requesterSession.requesterId!, status: 'WAITING_FOR_REQUESTER' },
    });
    const expectedResolved = await prisma.ticket.count({
      where: { requesterId: requesterSession.requesterId!, status: 'RESOLVED' },
    });
    const expectedClosed = await prisma.ticket.count({
      where: { requesterId: requesterSession.requesterId!, status: 'CLOSED' },
    });

    expect(body.activeCount).toBe(expectedActive);
    expect(body.waitingForRequesterCount).toBe(expectedWaiting);
    expect(body.resolvedCount).toBe(expectedResolved);
    expect(body.closedCount).toBe(expectedClosed);

    // Lists validation
    expect(Array.isArray(body.recentlyUpdated)).toBe(true);
    expect(body.recentlyUpdated.length).toBeLessThanOrEqual(5);

    expect(Array.isArray(body.recentlyResolved)).toBe(true);
    expect(body.recentlyResolved.length).toBeLessThanOrEqual(5);

    for (const item of body.recentlyUpdated) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('ticketNumber');
      expect(item).toHaveProperty('summary');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('updatedAt');
    }
  });

  it('returns 200 with zero counts and empty lists for zero-state requester', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', zeroRequesterSession.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeCount: 0,
      waitingForRequesterCount: 0,
      resolvedCount: 0,
      closedCount: 0,
      recentlyUpdated: [],
      recentlyResolved: [],
    });
  });

  it('verifies email alignment when id collides with an unrelated Requester row (security & ID isolation)', async () => {
    // 1. Create a foreign Requester with active tickets
    const foreignReq = await prisma.requester.create({
      data: {
        name: 'Foreign Requester',
        email: `foreign-${Date.now()}@toktickit.test`,
        isActive: true,
      },
    });

    const category = await prisma.category.findFirstOrThrow();
    const system = await prisma.relatedSystem.findFirstOrThrow();

    await prisma.ticket.create({
      data: {
        ticketNumber: `TTK-2026-COLL-${Date.now().toString().slice(-4)}`,
        title: 'Confidential foreign ticket',
        categoryId: category.id,
        relatedSystemId: system.id,
        requesterId: foreignReq.id,
        status: 'OPEN',
      },
    });

    // 2. Create a User fixture whose user.id matches foreignReq.id but with a DIFFERENT email
    // Or a User whose email does NOT match foreignReq.email.
    // If we test with a session whose User.id matches foreignReq.id, or test resolveSessionRequester behavior:
    // We can create a user with that exact id if available, or test a user that collides on id:
    const mockUser = {
      id: foreignReq.id,
      name: 'Unrelated Requester User',
      email: `unrelated-${Date.now()}@toktickit.test`,
      role: 'REQUESTER' as const,
      isActive: true,
    };

    // Call getRequesterDashboard directly to test the service with mockUser
    const { getRequesterDashboard } = await import('../../src/services/dashboard.service.js');
    const result = await getRequesterDashboard(prisma, mockUser, {});

    // Must NOT leak foreignReq's active ticket
    expect(result.activeCount).toBe(0);
    expect(result.recentlyUpdated).toHaveLength(0);

    // Clean up
    await prisma.ticket.deleteMany({ where: { requesterId: foreignReq.id } });
    await prisma.requester.delete({ where: { id: foreignReq.id } });
  });
});
