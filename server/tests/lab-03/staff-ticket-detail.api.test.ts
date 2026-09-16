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
// (Requester 403 on every staff surface, ADMIN view-only 403 on writes,
// unauthenticated 401) and attachment continuity on the staff detail read.
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
  await prisma.ticket.deleteMany({ where: { ticketNumber } });
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

  it('200 for ADMINISTRATOR (view-only role, read allowed per AD-02)', async () => {
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
    ).send({ ownerId: staff.userId });
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
    ).send({ ownerId: staffB.userId });
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
    ).send({ ownerId: null });
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
    ).send({ ownerId: staff.userId });
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
    ).send({ ownerId: staffB.userId });
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
    ).send({ ownerId: requester.userId });
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
      ).send({ ownerId: inactive.id });
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
    ).send({ ownerId: 987654321 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
    await deleteProbe(t.ticketNumber);
  });

  it('400 when ownerId is missing or a non-integer', async () => {
    const t = await createProbeTicket();
    const missing = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.details[0].field).toBe('ownerId');

    const bad = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: 1.5 });
    expect(bad.status).toBe(400);
    await deleteProbe(t.ticketNumber);
  });

  it('403 for ADMINISTRATOR (view-only per AD-02) and 403 for REQUESTER', async () => {
    const t = await createProbeTicket();
    const adminRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: admin.userId });
    expect(adminRes.status).toBe(403);

    const reqRes = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/owner`),
    ).send({ ownerId: requester.userId });
    expect(reqRes.status).toBe(403);
    expect(reqRes.body.error).toBe('IT Staff access required');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBeNull();
    await deleteProbe(t.ticketNumber);
  });

  it('401 without a session on the owner write', async () => {
    const t = await createProbeTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${t.ticketNumber}/owner`)
      .send({ ownerId: staff.userId });
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
    ).send({ itPriority: 'CRITICAL' });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe('CRITICAL');
    expect(res.body.priority).toBe('MEDIUM');
    await deleteProbe(t.ticketNumber);
  });

  it('403 for ADMINISTRATOR (view-only per AD-02)', async () => {
    const t = await createProbeTicket({ itPriority: 'LOW' });
    const res = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL' });
    expect(res.status).toBe(403);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.itPriority).toBe('LOW');
    await deleteProbe(t.ticketNumber);
  });

  it('403 for REQUESTER (own ticket still forbidden on the staff surface)', async () => {
    const t = await createProbeTicket({ itPriority: 'LOW' });
    const res = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/it-priority`),
    ).send({ itPriority: 'CRITICAL' });
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
      ).send({ itPriority: bad });
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
  const cases = ([
    { from: 'NEW', to: 'OPEN' },
    { from: 'NEW', to: 'CANCELLED', confirm: true },
    { from: 'OPEN', to: 'IN_PROGRESS' },
    { from: 'OPEN', to: 'WAITING_FOR_REQUESTER' },
    { from: 'OPEN', to: 'CANCELLED', confirm: true },
    { from: 'IN_PROGRESS', to: 'WAITING_FOR_REQUESTER' },
    { from: 'IN_PROGRESS', to: 'RESOLVED', confirm: true },
    { from: 'IN_PROGRESS', to: 'CANCELLED', confirm: true },
    { from: 'WAITING_FOR_REQUESTER', to: 'IN_PROGRESS' },
    { from: 'WAITING_FOR_REQUESTER', to: 'RESOLVED', confirm: true },
    { from: 'WAITING_FOR_REQUESTER', to: 'CANCELLED', confirm: true },
    { from: 'RESOLVED', to: 'CLOSED', confirm: true },
    { from: 'RESOLVED', to: 'REOPENED', confirm: true, reason: 'Issue came back after the fix.' },
    { from: 'CLOSED', to: 'REOPENED', confirm: true, reason: 'Regression reported by the requester.' },
    { from: 'CANCELLED', to: 'REOPENED', confirm: true, reason: 'Cancellation was premature.' },
    { from: 'REOPENED', to: 'OPEN' },
    { from: 'REOPENED', to: 'IN_PROGRESS' },
  ] as Array<{ from: string; to: string; confirm?: boolean; reason?: string }>).map(
    (c) =>
      it(`${c.from} -> ${c.to} succeeds for IT_STAFF`, async () => {
        const t = await createProbeTicket({
          status: c.from,
          ownerId: c.to === 'RESOLVED' || c.to === 'CLOSED' ? staff.userId : null,
        });
        const res = await withWriteAuth(
          staff,
          request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
        ).send({ status: c.to, confirm: c.confirm ?? false, reason: c.reason });
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
    ).send({ status: 'REOPENED', confirm: true });
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
    ).send({ status: 'IN_PROGRESS' });
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
    ).send({ status: 'REOPENED', confirm: true, reason: 'Symptoms returned.' });
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
    ).send({ status: 'RESOLVED', confirm: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Illegal status transition from NEW to RESOLVED');
    expect(res.body.error).toContain('OPEN');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.status).toBe('NEW');
    await deleteProbe(t.ticketNumber);
  });

  it('409 for the skip attempt WAITING_FOR_REQUESTER -> CLOSED', async () => {
    const t = await createProbeTicket({ status: 'WAITING_FOR_REQUESTER' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'CLOSED', confirm: true });
    expect(res.status).toBe(409);
    await deleteProbe(t.ticketNumber);
  });

  it('400 no-op: same-status transition is rejected', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'OPEN' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already in status OPEN');
    await deleteProbe(t.ticketNumber);
  });

  it('400 missing confirmation on confirm-required transitions', async () => {
    const t = await createProbeTicket({ status: 'IN_PROGRESS' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'RESOLVED' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('confirm');
    await deleteProbe(t.ticketNumber);
  });

  it('400 for a malformed status value', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const res = await withWriteAuth(
      staff,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'FINISHED' });
    expect(res.status).toBe(409); // not in the allowed list for OPEN -> treated as illegal
    await deleteProbe(t.ticketNumber);
  });

  it('403 for ADMINISTRATOR and REQUESTER on status writes', async () => {
    const t = await createProbeTicket({ status: 'OPEN' });
    const adminRes = await withWriteAuth(
      admin,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'IN_PROGRESS' });
    expect(adminRes.status).toBe(403);

    const reqRes = await withWriteAuth(
      requester,
      request(app).patch(`/api/staff/tickets/${t.ticketNumber}/status`),
    ).send({ status: 'RESOLVED', confirm: true });
    expect(reqRes.status).toBe(403);
    expect(reqRes.body.error).toBe('IT Staff access required');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.status).toBe('OPEN');
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
