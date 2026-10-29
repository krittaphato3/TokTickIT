import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  cleanupAllSessions,
  createSession,
  withCookie,
  withWriteAuth,
  type SessionFixture,
} from '../helpers/session.js';

// Lab 3 §6 — IT Staff Ticket Operations API — server/tests/lab-03/staff-ticket-detail.api.test.ts
// Covers docs/lab-03/tests.md rows: T-OWN-01/02, T-PRIO-01/02, T-STAT-01/02,
// plus the §12 matrix rows for GET/PATCH /api/staff/tickets/:number
// (Requester 403 on every staff surface, ADMIN 200 staff-equivalent per
// Lab 4 D-01, unauthenticated 401) and attachment continuity on the staff
// detail read.
//
// Fixture pattern: self-contained disposable tickets in the reserved 9xxxxx
// test band owned by disposable session fixtures; everything is removed in
// afterAll so the shared dev database stays pristine. Serial suite
// (fileParallelism: false).

const prisma = getPrisma();

const BAND_BASE = 900500;
let counter = 0;
function nextNumber(): string {
  counter += 1;
  return `TTK-2026-${String(BAND_BASE + counter).padStart(6, '0')}`;
}

const sessions: SessionFixture[] = [];
let staff: SessionFixture;
let staffB: SessionFixture;
let admin: SessionFixture;
let requester: SessionFixture;
let requesterLinkedId = -1;

interface ProbeTicket {
  id: number;
  ticketNumber: string;
  status: string;
  priority: string;
  itPriority: string | null;
  ownerId: number | null;
  appearsResolvedAt: Date | null;
}

async function createProbeTicket(opts: {
  status?: string;
  priority?: string;
  itPriority?: string | null;
  ownerId?: number | null;
  appearsResolved?: boolean;
  requesterId?: number;
  title?: string;
} = {}): Promise<ProbeTicket> {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: nextNumber(),
      title: opts.title ?? 'Staff detail probe',
      description: 'Staff detail probe body',
      status: (opts.status ?? 'NEW') as never,
      priority: (opts.priority ?? 'MEDIUM') as never,
      itPriority: (opts.itPriority === undefined ? null : opts.itPriority) as never,
      ownerId: opts.ownerId ?? null,
      requesterId: opts.requesterId ?? requesterLinkedId,
      categoryId: 1,
      relatedSystemId: 1,
      appearsResolvedAt: opts.appearsResolved ? new Date() : null,
    },
  });
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    priority: ticket.priority,
    itPriority: ticket.itPriority,
    ownerId: ticket.ownerId,
    appearsResolvedAt: ticket.appearsResolvedAt,
  };
}

async function deleteProbe(ticketNumber: string): Promise<void> {
  // Lab 4 (BR-01): ActionTaken rows restrict-delete their ticket, so a probe
  // with recorded work clears its actions first.
  const row = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (row) await prisma.actionTaken.deleteMany({ where: { ticketId: row.id } });
  await prisma.ticket.deleteMany({ where: { ticketNumber } });
}

// Lab 4 (D-04/BR-07) — every workflow write now carries `expectedVersion`.
// These Lab 3 cases read the current version when they dispatch, so each one
// still asserts exactly the rule it asserted before under the new concurrency
// contract (D-04 names this file as deliberately updated).
async function versionOf(ticketNumber: string): Promise<number> {
  const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber } });
  return row.version;
}

beforeAll(async () => {
  sessions.push(await createSession({ label: 'sd-staff', role: 'IT_STAFF' }));
  sessions.push(await createSession({ label: 'sd-staff-b', role: 'IT_STAFF' }));
  sessions.push(await createSession({ label: 'sd-admin', role: 'ADMINISTRATOR' }));
  sessions.push(
    await createSession({ label: 'sd-req', role: 'REQUESTER', withLinkedRequester: true }),
  );
  [staff, staffB, admin, requester] = sessions;
  requesterLinkedId = requester.requesterId as number;
}, 60_000);

afterAll(async () => {
  for (const fixture of sessions.splice(0, sessions.length)) {
    await fixture.dispose().catch(() => undefined);
  }
  await cleanupAllSessions();
});

// ---------------------------------------------------------------------------
// §12 matrix — access control on the staff detail surface
// ---------------------------------------------------------------------------
describe('Authorization — §12 matrix rows for GET /api/staff/tickets/:number', () => {
  it('401 without a session', async () => {
    const t = await createProbeTicket();
    const res = await request(app).get(`/api/staff/tickets/${t.ticketNumber}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
    await deleteProbe(t.ticketNumber);
  });

  it('403 for REQUESTER (forbidden even on own ticket; staff surface invisible)', async () => {
    const t = await createProbeTicket();
    const res = await withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('IT Staff access required');
    expect(res.body.title).toBeUndefined();
    await deleteProbe(t.ticketNumber);
  });

  it('200 for IT_STAFF with full ops shape', async () => {
    const t = await createProbeTicket({ priority: 'HIGH' });
    const res = await withCookie(staff, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticketNumber: t.ticketNumber,
      status: 'NEW',
      priority: 'HIGH',
      itPriority: null,
      owner: null,
    });
    expect(res.body.requester).toHaveProperty('email');
    expect(res.body.category).toHaveProperty('name');
    expect(Array.isArray(res.body.attachments)).toBe(true);
    expect(typeof res.body.commentCount).toBe('number');
    expect(typeof res.body.internalNoteCount).toBe('number');
    await deleteProbe(t.ticketNumber);
  });

  it('200 for ADMINISTRATOR (staff-equivalent read per Lab 4 D-01)', async () => {
    const t = await createProbeTicket();
    const res = await withCookie(admin, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(t.ticketNumber);
    await deleteProbe(t.ticketNumber);
  });

  it('404 for well-formed but absent ticket (real staff 404, not masked)', async () => {
    const res = await withCookie(staff, request(app).get('/api/staff/tickets/TTK-2026-999999'));
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('does not exist');
  });

  it('400 for malformed ticket number', async () => {
    const res = await withCookie(staff, request(app).get('/api/staff/tickets/not-a-number'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// §6.2 — ownership: claim / assign / reassign / unassign (T-OWN-01, T-OWN-02)
// ---------------------------------------------------------------------------
describe('T-OWN-01 — claim, reassign, unassign (BR-12)', () => {
  it('claiming an unassigned ticket sets the caller as owner (200)', async () => {
    const t = await createProbeTicket();
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staff.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: staff.userId, name: staff.name });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staff.userId);
    expect(row.ownerName).toBe(staff.name);
    await deleteProbe(t.ticketNumber);
  });

  it('reassigning between active staff updates owner and ownerName', async () => {
    const t = await createProbeTicket({ ownerId: staff.userId });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staffB.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.owner.id).toBe(staffB.userId);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staffB.userId);
    await deleteProbe(t.ticketNumber);
  });

  it('unassigning with ownerId null clears ownership', async () => {
    const t = await createProbeTicket({ ownerId: staff.userId });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: null, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.owner).toBeNull();
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBeNull();
    await deleteProbe(t.ticketNumber);
  });

  it('BR-13 copy-on-claim: first claim with null IT Priority copies Requested Priority', async () => {
    const t = await createProbeTicket({ priority: 'HIGH', itPriority: null });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staff.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.itPriorityCopied).toBe(true);
    expect(res.body.itPriority).toBe('HIGH');
    await deleteProbe(t.ticketNumber);
  });

  it('BR-13 no-copy: reassign does not overwrite an existing IT Priority', async () => {
    const t = await createProbeTicket({ priority: 'HIGH', itPriority: 'LOW', ownerId: staff.userId });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staffB.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.itPriorityCopied).toBe(false);
    expect(res.body.itPriority).toBe('LOW');
    await deleteProbe(t.ticketNumber);
  });
});

describe('T-OWN-02 — invalid owner rejection (BR-12)', () => {
  it('409 when the candidate owner is a REQUESTER', async () => {
    const t = await createProbeTicket();
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: requester.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Owner must be an active IT Staff or Administrator');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBeNull();
    await deleteProbe(t.ticketNumber);
  });

  it('409 when the candidate owner is an inactive IT Staff user', async () => {
    const inactive = await prisma.user.create({
      data: {
        name: 'SD Inactive Staff',
        email: `sd-inactive-${Date.now()}@toktickit.test`,
        passwordHash: await bcrypt.hash('StartValid1!', 4),
        role: 'IT_STAFF',
        isActive: false,
        mustChangePassword: false,
      },
    });
    try {
      const t = await createProbeTicket();
      const res = await withWriteAuth(
        staff,
        request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
      ).send({ ownerId: inactive.id, expectedVersion: await versionOf(t.ticketNumber) });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Owner must be an active IT Staff or Administrator');
      await deleteProbe(t.ticketNumber);
    } finally {
      await prisma.user.delete({ where: { id: inactive.id } }).catch(() => undefined);
    }
  });

  it('404 when the candidate owner id is unknown', async () => {
    const t = await createProbeTicket();
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: 987654321, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
    await deleteProbe(t.ticketNumber);
  });

  it('400 when ownerId is missing or a non-integer', async () => {
    const t = await createProbeTicket();
    const missing = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ expectedVersion: await versionOf(t.ticketNumber) });
    expect(missing.status).toBe(400);
    expect(missing.body.details[0].field).toBe('ownerId');

    const bad = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: 1.5, expectedVersion: await versionOf(t.ticketNumber) });
    expect(bad.status).toBe(400);
    await deleteProbe(t.ticketNumber);
  });

  it('200 for ADMINISTRATOR owner write per Lab 4 D-01; 403 for REQUESTER', async () => {
    const t = await createProbeTicket();
    const adminRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: admin.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.owner).toMatchObject({ id: admin.userId });

    const reqRes = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: requester.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(reqRes.status).toBe(403);
    expect(reqRes.body.error).toBe('IT Staff access required');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(admin.userId);
    await deleteProbe(t.ticketNumber);
  });

  it('401 without a session on the owner write', async () => {
    const t = await createProbeTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${t.ticketNumber}/owner`)
      .send({ ownerId: staff.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(401);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// §6.3 — IT Priority (T-PRIO-01/02)
// ---------------------------------------------------------------------------
describe('T-PRIO-02 — IT Priority update permissions (BR-13, BR-20)', () => {
  it('IT_STAFF edit succeeds and leaves Requested Priority unchanged', async () => {
    const t = await createProbeTicket({ priority: 'MEDIUM', itPriority: 'LOW' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe('CRITICAL');
    expect(res.body.priority).toBe('MEDIUM');
    await deleteProbe(t.ticketNumber);
  });

  it('200 for ADMINISTRATOR it-priority write per Lab 4 D-01', async () => {
    const t = await createProbeTicket({ itPriority: 'LOW' });
    const res = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe('CRITICAL');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.itPriority).toBe('CRITICAL');
    await deleteProbe(t.ticketNumber);
  });

  it('403 for REQUESTER (own ticket still forbidden on the staff surface)', async () => {
    const t = await createProbeTicket({ itPriority: 'LOW' });
    const res = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(403);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.itPriority).toBe('LOW');
    await deleteProbe(t.ticketNumber);
  });

  it('400 for invalid values (URGENT, null, missing)', async () => {
    const t = await createProbeTicket();
    for (const bad of ['URGENT', null]) {
      const res = await withWriteAuth(
        staff,
        request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
      ).send({ itPriority: bad, expectedVersion: await versionOf(t.ticketNumber) });
      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('itPriority');
    }
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// §6.4 — BR-15 status transition matrix (T-STAT-01, T-STAT-02)
// ---------------------------------------------------------------------------
describe('T-STAT-01 — permitted transitions with confirmations (BR-15)', () => {
  // Mapped-array + Promise.all form: vitest 4 does not await async callbacks
  // created inside a for...of loop, so the closures would run after the loop
  // variable was consumed. Collecting the test objects first keeps each
  // `it()` registration synchronous and self-contained.
  // Lab 4 D-06 — the matrix grew (NEW -> IN_PROGRESS, In Progress -> Open,
  // Waiting for Requester -> Open, the Resolved targets on Open/In Progress/
  // Waiting/Reopened) and Cancelled became terminal, so the Lab 3
  // CANCELLED -> REOPENED row is gone; every Resolved target is additionally
  // gated by BR-10 (an action must exist first).
  const cases = ([
    { from: 'NEW', to: 'OPEN' },
    { from: 'NEW', to: 'IN_PROGRESS' },
    { from: 'NEW', to: 'CANCELLED', confirm: true },
    { from: 'OPEN', to: 'IN_PROGRESS' },
    { from: 'OPEN', to: 'WAITING_FOR_REQUESTER' },
    { from: 'OPEN', to: 'RESOLVED', confirm: true },
    { from: 'OPEN', to: 'CANCELLED', confirm: true },
    { from: 'IN_PROGRESS', to: 'OPEN' },
    { from: 'IN_PROGRESS', to: 'WAITING_FOR_REQUESTER' },
    { from: 'IN_PROGRESS', to: 'RESOLVED', confirm: true },
    { from: 'IN_PROGRESS', to: 'CANCELLED', confirm: true },
    { from: 'WAITING_FOR_REQUESTER', to: 'OPEN' },
    { from: 'WAITING_FOR_REQUESTER', to: 'IN_PROGRESS' },
    { from: 'WAITING_FOR_REQUESTER', to: 'RESOLVED', confirm: true },
    { from: 'WAITING_FOR_REQUESTER', to: 'CANCELLED', confirm: true },
    { from: 'RESOLVED', to: 'CLOSED', confirm: true },
    { from: 'RESOLVED', to: 'REOPENED', confirm: true, reason: 'Issue came back after the fix.' },
    { from: 'CLOSED', to: 'REOPENED', confirm: true, reason: 'Regression reported by the requester.' },
    { from: 'REOPENED', to: 'OPEN' },
    { from: 'REOPENED', to: 'IN_PROGRESS' },
    { from: 'REOPENED', to: 'WAITING_FOR_REQUESTER' },
    { from: 'REOPENED', to: 'RESOLVED', confirm: true },
    { from: 'REOPENED', to: 'CANCELLED', confirm: true },
  ] as Array<{ from: string; to: string; confirm?: boolean; reason?: string }>).map(
    (c) =>
      it(`${c.from} -> ${c.to} succeeds for IT_STAFF`, async () => {
        const t = await createProbeTicket({
          status: c.from,
          ownerId: c.to === 'RESOLVED' || c.to === 'CLOSED' ? staff.userId : null,
        });
        if (c.to === 'RESOLVED') {
          // Lab 4 BR-10 — the resolution gate requires at least one recorded
          // action before a ticket can be resolved.
          await prisma.actionTaken.create({
            data: {
              ticketId: t.id,
              performedById: staff.userId,
              description: 'Bridge action recorded for the resolution gate.',
              result: 'Gate precondition satisfied.',
            },
          });
        }
        const res = await withWriteAuth(
          staff,
          request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
        ).send({
          status: c.to,
          confirm: c.confirm ?? false,
          reason: c.reason,
          ...(c.to === 'RESOLVED' ? { resolutionSummary: 'Resolved under the Lab 4 gate.' } : {}),
          expectedVersion: await versionOf(t.ticketNumber),
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(c.to);

        const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
        expect(row.status).toBe(c.to);

        // BR-15: every transition appends the audit-visible system comment.
        const comments = await prisma.publicComment.findMany({ where: { ticketId: t.id } });
        expect(comments.some((cm) => cm.body.includes(`Status changed from ${c.from} to ${c.to}`))).toBe(true);
        await deleteProbe(t.ticketNumber);
      }, 20_000),
  );
  void cases;

  it('REOPENED from RESOLVED requires a reason comment (400 without)', async () => {
    const t = await createProbeTicket({ status: 'RESOLVED' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'REOPENED', confirm: true, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('reason');
    await deleteProbe(t.ticketNumber);
  });

  it('Resolved/Blocked transitions stamp updatedAt and keep itPriority untouched', async () => {
    const t = await createProbeTicket({ status: 'OPEN', priority: 'HIGH', itPriority: 'CRITICAL' });
    const before = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(row.itPriority).toBe('CRITICAL');
    expect(row.priority).toBe('HIGH');
    await deleteProbe(t.ticketNumber);
  });

  it('BR-05: requester appears-resolved signal is visible on staff detail and is NOT formal resolution', async () => {
    const t = await createProbeTicket({ status: 'OPEN', appearsResolved: true });
    const res = await withCookie(staff, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.appearsResolvedAt).not.toBeNull();
    expect(res.body.status).toBe('OPEN'); // status untouched by the signal
    await deleteProbe(t.ticketNumber);
  });

  it('FR-10: staff status change clears a stale appears-resolved signal', async () => {
    const t = await createProbeTicket({ status: 'RESOLVED', appearsResolved: true });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'REOPENED', confirm: true, reason: 'Symptoms returned.', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(200);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.appearsResolvedAt).toBeNull();
    await deleteProbe(t.ticketNumber);
  });
});

describe('T-STAT-02 — illegal transitions and validation (BR-15, BR-16)', () => {
  it('409 with allowed-target list for an illegal transition', async () => {
    const t = await createProbeTicket({ status: 'NEW' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'RESOLVED', confirm: true, expectedVersion: await versionOf(t.ticketNumber) });
    // Lab 4 D-06 — an illegal target is now a 422 INVALID_TRANSITION that names
    // the permitted set (Lab 3 returned a bare 409).
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(res.body.error).toContain('Illegal status transition from NEW to RESOLVED');
    expect(res.body.details[0].message).toContain('OPEN');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.status).toBe('NEW');
    await deleteProbe(t.ticketNumber);
  });

  it('409 for the skip attempt WAITING_FOR_REQUESTER -> CLOSED', async () => {
    const t = await createProbeTicket({ status: 'WAITING_FOR_REQUESTER' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'CLOSED', confirm: true, expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    await deleteProbe(t.ticketNumber);
  });

  it('400 no-op: same-status transition is rejected', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'OPEN', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already in status OPEN');
    await deleteProbe(t.ticketNumber);
  });

  it('400 missing confirmation on confirm-required transitions', async () => {
    const t = await createProbeTicket({ status: 'IN_PROGRESS' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'RESOLVED', expectedVersion: await versionOf(t.ticketNumber) });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('confirm');
    await deleteProbe(t.ticketNumber);
  });

  it('400 for a malformed status value', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'FINISHED', expectedVersion: await versionOf(t.ticketNumber) });
    // Lab 4 api-spec §3.2 — a value outside the eight statuses is body
    // validation (400), no longer "not in the allowed list" (409/422).
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    await deleteProbe(t.ticketNumber);
  });

  it('200 for ADMINISTRATOR status write per Lab 4 D-01; 403 for REQUESTER', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const adminRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS', expectedVersion: await versionOf(t.ticketNumber) });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.status).toBe('IN_PROGRESS');

    const reqRes = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'RESOLVED', confirm: true, expectedVersion: await versionOf(t.ticketNumber) });
    expect(reqRes.status).toBe(403);
    expect(reqRes.body.error).toBe('IT Staff access required');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.status).toBe('IN_PROGRESS');
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// Attachment continuity (staff detail read keeps Lab 2 attachment data)
// ---------------------------------------------------------------------------
describe('Attachment continuity on the staff detail read', () => {
  it('staff detail lists attachments and download works for staff', async () => {
    const t = await createProbeTicket();
    // Upload via the requester-owned route (Lab 2 rule: requester manages
    // attachments on own tickets), then read via the staff surface.
    const upload = await withWriteAuth(
      requester,
      request(app).post(`/api/tickets/${t.ticketNumber}/attachments`),
    )
      .attach('file', Buffer.from('%PDF-1.4 probe'), { filename: 'probe.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);

    const detail = await withCookie(staff, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.attachments).toHaveLength(1);
    expect(detail.body.attachments[0].fileName).toBe('probe.pdf');

    const dl = await withCookie(
      staff,
      request(app).get(`/api/staff/tickets/${t.ticketNumber}/attachments/${upload.body.id}/download`),
    );
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.body.toString()).toContain('%PDF-1.4');

    const removed = await withWriteAuth(
      requester,
      request(app).delete(`/api/tickets/${t.ticketNumber}/attachments/${upload.body.id}`),
    ).send({ reasonCode: 'Uploaded in error' });
    expect(removed.status).toBe(200);

    const dlRemoved = await withCookie(
      staff,
      request(app).get(`/api/staff/tickets/${t.ticketNumber}/attachments/${upload.body.id}/download`),
    );
    expect(dlRemoved.status).toBe(404);
    await deleteProbe(t.ticketNumber);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Combined ops pass: owner + IT Priority changed together (T-OWN-01/T-PRIO-01
// reviewer ask #1). The §6.2/§6.3 API exposes owner and IT Priority as two
// PATCHes, so "together" means one staff ops pass: claim (BR-13 copy fires)
// then edit IT Priority in the same pass — asserting each write lands and
// the copy interaction behaves when a priority edit follows immediately.
// ---------------------------------------------------------------------------
describe('Combined ops — owner and IT Priority changed in one pass (BR-12 + BR-13)', () => {
  it('claim then edit IT Priority in one pass: both writes land, copy fires once and is not re-copied', async () => {
    const t = await createProbeTicket({ priority: 'HIGH', itPriority: null });

    // Step 1 — claim: BR-13 copies Requested Priority into the null IT Priority.
    const claim = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staff.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(claim.status).toBe(200);
    expect(claim.body.owner.id).toBe(staff.userId);
    expect(claim.body.itPriorityCopied).toBe(true);
    expect(claim.body.itPriority).toBe('HIGH');

    // Step 2 — same ops pass: independent IT Priority edit on the claimed ticket.
    const prio = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: await versionOf(t.ticketNumber) });
    expect(prio.status).toBe(200);
    expect(prio.body.itPriority).toBe('CRITICAL');
    // Requested Priority is immutable (BR-13).
    expect(prio.body.priority).toBe('HIGH');

    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staff.userId);
    expect(row.itPriority).toBe('CRITICAL');
    expect(row.priority).toBe('HIGH');

    // A reassign right after the edit must NOT re-fire the copy (owner now set).
    const reassign = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staffB.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(reassign.status).toBe(200);
    expect(reassign.body.itPriorityCopied).toBe(false);
    expect(reassign.body.itPriority).toBe('CRITICAL');
    await deleteProbe(t.ticketNumber);
  });

  it('claim + priority edit in one pass by two different staff: second write still IT_STAFF-gated', async () => {
    const t = await createProbeTicket({ priority: 'MEDIUM', itPriority: null });
    const claim = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staffB.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(claim.status).toBe(200);
    expect(claim.body.itPriorityCopied).toBe(true);

    // The same combined pass from a second staff account: priority edit allowed,
    // then requester write refused so the pass cannot be completed by them.
    const prio = await withWriteAuth(
      staffB,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'LOW', expectedVersion: await versionOf(t.ticketNumber) });
    expect(prio.status).toBe(200);
    expect(prio.body.itPriority).toBe('LOW');

    const reqRes = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'LOW', expectedVersion: await versionOf(t.ticketNumber) });
    expect(reqRes.status).toBe(403);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staffB.userId);
    expect(row.itPriority).toBe('LOW');
    await deleteProbe(t.ticketNumber);
  });

  it('combined REOPEN+reason flow lands owner, priority and status writes in one pass', async () => {
    const t = await createProbeTicket({ status: 'RESOLVED', ownerId: staff.userId, priority: 'LOW', itPriority: 'LOW' });
    const claim = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: staffB.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(claim.status).toBe(200);
    const prio = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'HIGH', expectedVersion: await versionOf(t.ticketNumber) });
    expect(prio.status).toBe(200);
    const status = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'REOPENED', confirm: true, reason: 'Reopen after combined ops pass.', expectedVersion: await versionOf(t.ticketNumber) });
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('REOPENED');

    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staffB.userId);
    expect(row.itPriority).toBe('HIGH');
    expect(row.status).toBe('REOPENED');
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// Reopen reason enforcement across every reopen-capable source (reviewer ask
// #2). Lab 4 D-06 — REOPENED is reachable from RESOLVED and CLOSED only
// (Cancelled is terminal); each source must demand a non-empty reason and
// refuse the write without one.
// ---------------------------------------------------------------------------
describe('Reopen without a reason — every reopen-capable source refuses (BR-15)', () => {
  // Lab 4 D-06 — Cancelled is terminal, so only these two sources can reopen.
  const reopenSources = ['RESOLVED', 'CLOSED'] as const;
  const cases = reopenSources.map(
    (from) =>
      it(`REOPENED from ${from} requires a reason (400 without)`, async () => {
        const t = await createProbeTicket({ status: from });
        const res = await withWriteAuth(
          staff,
          request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
        ).send({ status: 'REOPENED', confirm: true, expectedVersion: await versionOf(t.ticketNumber) });
        expect(res.status).toBe(400);
        expect(res.body.details[0].field).toBe('reason');
        expect(res.body.details[0].message).toContain(`reopen from ${from}`);
        // Whitespace-only reason is also refused and nothing is written.
        const ws = await withWriteAuth(
          staff,
          request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
        ).send({ status: 'REOPENED', confirm: true, reason: '   ', expectedVersion: await versionOf(t.ticketNumber) });
        expect(ws.status).toBe(400);
        const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
        expect(row.status).toBe(from);
        await deleteProbe(t.ticketNumber);
      }, 20_000),
  );
  void cases;

  it('REOPENED with a valid reason succeeds from every reopen-capable source (companion to the negative cases)', async () => {
    // Sanity companion: with a valid reason the transition succeeds from all
    // three sources — asserting the negative tests above are the only barrier.
    for (const from of reopenSources) {
      const t = await createProbeTicket({ status: from });
      const ok = await withWriteAuth(
        staff,
        request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
      ).send({ status: 'REOPENED', confirm: true, reason: `Legit reopen from ${from}.`, expectedVersion: await versionOf(t.ticketNumber) });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('REOPENED');
      await deleteProbe(t.ticketNumber);
    }
  });

  it('CANCELLED -> REOPENED is now an illegal transition (Lab 4 D-06: terminal)', async () => {
    const t = await createProbeTicket({ status: 'CANCELLED' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({
      status: 'REOPENED',
      confirm: true,
      reason: 'Cancellation was premature.',
      expectedVersion: await versionOf(t.ticketNumber),
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.status).toBe('CANCELLED');
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// Consolidated non-permitted API matrix (reviewer ask #3). Every /api/staff/*
// route × every role that must not use it. Reads: REQUESTER 403 (masked
// surface), ADMIN 200 staff-equivalent per Lab 4 D-01, no-session 401.
// Writes: REQUESTER 403, ADMIN 200 (D-01 supersedes the Lab 3 AD-02
// view-only rule), no-session 401. Internal notes are the
// §1.5 exception: REQUESTER gets the masked 404 instead of 403.
// ---------------------------------------------------------------------------
describe('Non-permitted API matrix — every staff route × every disallowed caller (BR-20, §12)', () => {
  it('every staff route refuses REQUESTER (403, notes masked 404) with no data', async () => {
    const t = await createProbeTicket();
    const readRoutes: Array<[string, request.Test]> = [
      ['GET /api/staff/tickets', withCookie(requester, request(app).get('/api/staff/tickets'))],
      ['GET /api/staff/owners', withCookie(requester, request(app).get('/api/staff/owners'))],
      ['GET detail', withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}`))],
      ['GET comments', withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}/comments`))],
      ['GET download', withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}/attachments/1/download`))],
    ];
    for (const [label, req] of readRoutes) {
      const res = await req;
      expect(res.status, label).toBe(403);
      expect(JSON.stringify(res.body), label).not.toContain(t.ticketNumber);
      expect(JSON.stringify(res.body), label).not.toContain('requester');
    }

    const noteRoutes: Array<[string, request.Test]> = [
      ['GET notes', withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}/internal-notes`))],
      ['POST notes', withWriteAuth(requester, request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`)).send({ body: 'nope' })],
    ];
    for (const [label, req] of noteRoutes) {
      const res = await req;
      expect(res.status, label).toBe(404);
      expect(res.body.error, label).toBe('Not found');
    }

    const writeRoutes: Array<[string, request.Test]> = [
      ['PATCH owner', withWriteAuth(requester, request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`)).send({ ownerId: requester.userId })],
      ['PATCH it-priority', withWriteAuth(requester, request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`)).send({ itPriority: 'HIGH' })],
      ['PATCH status', withWriteAuth(requester, request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`)).send({ status: 'OPEN' })],
      ['POST comment', withWriteAuth(requester, request(app).post(`/api/staff/tickets/${t.ticketNumber}/comments`)).send({ body: 'nope' })],
    ];
    for (const [label, req] of writeRoutes) {
      const res = await req;
      expect(res.status, label).toBe(403);
    }
    await deleteProbe(t.ticketNumber);
  });

  it('every staff write route accepts ADMINISTRATOR per Lab 4 D-01 on owner/priority/status (comments/notes stay allowed per BR-04)', async () => {
    const t = await createProbeTicket({ status: 'OPEN', ownerId: staff.userId, itPriority: 'LOW' });

    // D-01 staff-equivalent writes: owner, IT Priority, status. Each write is
    // dispatched in turn and carries the version read at that moment (Lab 4
    // D-04), so the three writes land in order instead of racing a stale copy.
    const ownerWrite = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: admin.userId, expectedVersion: await versionOf(t.ticketNumber) });
    expect(ownerWrite.status, 'PATCH owner').toBe(200);

    const prioWrite = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL', expectedVersion: await versionOf(t.ticketNumber) });
    expect(prioWrite.status, 'PATCH it-priority').toBe(200);

    const statusWrite = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS', expectedVersion: await versionOf(t.ticketNumber) });
    expect(statusWrite.status, 'PATCH status').toBe(200);

    // BR-04: admin participation on the threads is allowed (not a staff-write surface).
    const adminComment = await withWriteAuth(
      admin,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/comments`),
    ).send({ body: 'Admin comment from the matrix test.' });
    expect(adminComment.status).toBe(201);
    expect(adminComment.body.author.role).toBe('ADMINISTRATOR');
    const adminNote = await withWriteAuth(
      admin,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'Admin note from the matrix test.' });
    expect(adminNote.status).toBe(201);
    expect(adminNote.body.author.role).toBe('ADMINISTRATOR');

    const after = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    // D-01: the three admin writes landed (owner reassigned to the admin,
    // IT priority set, status advanced).
    expect(after.ownerId).toBe(admin.userId);
    expect(after.itPriority).toBe('CRITICAL');
    expect(after.status).toBe('IN_PROGRESS');

    // ADMIN reads still work and the thread writes did land: the successful
    // admin status write appended its system comment, so the thread holds
    // the system comment plus the admin comment, and exactly one admin note.
    const detail = await withCookie(admin, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.internalNoteCount).toBe(1);
    expect(detail.body.commentCount).toBe(2);
    await deleteProbe(t.ticketNumber);
  });

  it('every staff route returns 401 without a session and leaks no ticket data', async () => {
    const t = await createProbeTicket();
    // Fire the requests lazily so .send() belongs to a live request chain.
    const attempts: Array<[string, () => request.Test]> = [
      ['GET /api/staff/tickets', () => request(app).get('/api/staff/tickets')],
      ['GET /api/staff/owners', () => request(app).get('/api/staff/owners')],
      ['GET detail', () => request(app).get(`/api/staff/tickets/${t.ticketNumber}`)],
      ['GET comments', () => request(app).get(`/api/staff/tickets/${t.ticketNumber}/comments`)],
      ['GET notes', () => request(app).get(`/api/staff/tickets/${t.ticketNumber}/internal-notes`)],
      ['GET download', () => request(app).get(`/api/staff/tickets/${t.ticketNumber}/attachments/1/download`)],
      ['PATCH owner', () => request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`).send({ ownerId: staff.userId })],
      ['PATCH it-priority', () => request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`).send({ itPriority: 'HIGH' })],
      ['PATCH status', () => request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`).send({ status: 'OPEN' })],
      ['POST comment', () => request(app).post(`/api/staff/tickets/${t.ticketNumber}/comments`).send({ body: 'x' })],
      ['POST note', () => request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`).send({ body: 'x' })],
    ];
    for (const [label, fire] of attempts) {
      const res = await fire();
      expect(res.status, label).toBe(401);
      expect(res.body.error).toBe('Not authenticated');
      expect(JSON.stringify(res.body), label).not.toContain(t.ticketNumber);
    }
    await deleteProbe(t.ticketNumber);
  });

  it('client-supplied requester identity on ticket create is ignored — server forces session identity (BR-03)', async () => {
    // Body id AND the legacy Lab 2 header both point at the staff user; the
    // created ticket must still belong to the session requester.
    const created = await withWriteAuth(
      requester,
      request(app)
        .post('/api/tickets')
        .set('X-Dev-Requester-Id', String(staff.userId))
        .send({
          title: 'Matrix BR-03 probe',
          description: 'd',
          categoryId: 1,
          relatedSystemId: 1,
          priority: 'LOW',
          requesterId: staff.userId,
        }),
    );
    expect(created.status).toBe(201);
    expect(created.body.requester.id).toBe(requester.requesterId);
    expect(created.body.requester.id).not.toBe(staff.userId);
    await prisma.ticket.deleteMany({ where: { ticketNumber: created.body.ticketNumber } });
  });
});

// ---------------------------------------------------------------------------
// Public Comments via the staff aliases (§7) + Internal Notes (§8)
// ---------------------------------------------------------------------------
describe('Staff comment aliases (§7)', () => {
  it('staff reads and posts comments through /api/staff/tickets/:number/comments', async () => {
    const t = await createProbeTicket();
    const post = await withWriteAuth(
      staff,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/comments`),
    ).send({ body: 'Staff reply through the alias.' });
    expect(post.status).toBe(201);
    expect(post.body.author.role).toBe('IT_STAFF');

    const list = await withCookie(admin, request(app).get(`/api/staff/tickets/${t.ticketNumber}/comments`));
    expect(list.status).toBe(200);
    expect(list.body.map((c: { body: string }) => c.body)).toContain('Staff reply through the alias.');

    // Requester stays 403 on the staff surface (their canonical route is /api/tickets).
    const reqRes = await withCookie(requester, request(app).get(`/api/staff/tickets/${t.ticketNumber}/comments`));
    expect(reqRes.status).toBe(403);
    await deleteProbe(t.ticketNumber);
  });
});

describe('Internal Notes — §8 visibility and integrity (FR-09, BR-04, BR-14)', () => {
  it('staff creates and reads notes; author/createdAt server-derived', async () => {
    const t = await createProbeTicket();
    const created = await withWriteAuth(
      staff,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'Spare SSD ready on shelf 2.' });
    expect(created.status).toBe(201);
    expect(created.body.author.id).toBe(staff.userId);
    expect(created.body.author.role).toBe('IT_STAFF');
    expect(created.body.createdAt).toBeTruthy();

    const list = await withCookie(staff, request(app).get(`/api/staff/tickets/${t.ticketNumber}/internal-notes`));
    expect(list.status).toBe(200);
    expect(list.body.map((n: { body: string }) => n.body)).toEqual(['Spare SSD ready on shelf 2.']);

    // Append-only: no edit/delete paths.
    const patch = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/internal-notes/${created.body.id}`),
    ).send({ body: 'edited' });
    expect([404, 405]).toContain(patch.status);
    const del = await withWriteAuth(
      staff,
      request(app).delete(`/api/staff/tickets/${t.ticketNumber}/internal-notes/${created.body.id}`),
    );
    expect([404, 405]).toContain(del.status);

    // Validation: empty / whitespace / over-length.
    for (const bad of ['', '    ', 42, null]) {
      const badRes = await withWriteAuth(
        staff,
        request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
      ).send({ body: bad });
      expect(badRes.status).toBe(400);
      expect(badRes.body.details[0].field).toBe('body');
    }
    const over = await withWriteAuth(
      staff,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'a'.repeat(2001) });
    expect(over.status).toBe(400);
    expect(over.body.details[0].message).toBe('Note must be at most 2000 characters');
    await deleteProbe(t.ticketNumber);
  });

  it('admin reads and posts notes (BR-04 allows both staff roles)', async () => {
    const t = await createProbeTicket();
    const created = await withWriteAuth(
      admin,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'Admin note: check warranty.' });
    expect(created.status).toBe(201);
    expect(created.body.author.role).toBe('ADMINISTRATOR');
    const list = await withCookie(admin, request(app).get(`/api/staff/tickets/${t.ticketNumber}/internal-notes`));
    expect(list.status).toBe(200);
    await deleteProbe(t.ticketNumber);
  });

  it('REQUESTER gets the masked 404 — never 403, never note content (BR-04/§1.5)', async () => {
    const t = await createProbeTicket();
    await withWriteAuth(
      staff,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'Secret internal context.' });

    // Own ticket: list is masked 404 identical to a missing ticket.
    const ownList = await withCookie(
      requester,
      request(app).get(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    );
    expect(ownList.status).toBe(404);
    expect(ownList.body).not.toHaveProperty('notes');
    expect(ownList.body).not.toHaveProperty('data');
    expect(JSON.stringify(ownList.body)).not.toMatch(/internal|Secret/i);

    // Create is masked 404 as well.
    const ownPost = await withWriteAuth(
      requester,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'should never land' });
    expect(ownPost.status).toBe(404);
    expect(JSON.stringify(ownPost.body)).not.toMatch(/internal/i);

    // The masked body is identical for an absent ticket (no existence signal).
    const absentList = await withCookie(
      requester,
      request(app).get('/api/staff/tickets/TTK-2026-999998/internal-notes'),
    );
    expect(absentList.status).toBe(404);
    expect(absentList.body).toEqual(ownList.body);
    await deleteProbe(t.ticketNumber);
  });

  it('staff detail note counts reflect the internal thread (and 404 remains masked for requesters)', async () => {
    const t = await createProbeTicket();
    await withWriteAuth(
      staffB,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/internal-notes`),
    ).send({ body: 'Count me.' });
    await withWriteAuth(
      staff,
      request(app).post(`/api/staff/tickets/${t.ticketNumber}/comments`),
    ).send({ body: 'Public reply.' });
    const detail = await withCookie(staff, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.internalNoteCount).toBe(1);
    expect(detail.body.commentCount).toBe(1);
    await deleteProbe(t.ticketNumber);
  });
});
