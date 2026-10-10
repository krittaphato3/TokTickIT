import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  cleanupAllSessions,
  createSession,
  uniqueEmail,
  withCookie,
  withWriteAuth,
  type SessionFixture,
} from '../helpers/session.js';

// L4-2 — Actions Taken API (docs/lab-04/tests.md rows API-01..API-08 plus the
// AC-04/AC-05/AC-17/AC-23 authorization and lifecycle cases owned by this
// issue). Disposable probe tickets live in the reserved TTK-2026-9020xx band
// (migration-regression.test.ts owns 9030xx); everything is removed in
// afterAll so the shared database stays pristine. Serial suite
// (fileParallelism: false).

const prisma = getPrisma();
const db = prisma as unknown as Record<string, any>;

const BAND_BASE = 902000;
let counter = 0;
function nextNumber(): string {
  counter += 1;
  return `TTK-2026-${String(BAND_BASE + counter).padStart(6, '0')}`;
}

const sessions: SessionFixture[] = [];
let staffA: SessionFixture;
let staffB: SessionFixture;
let admin: SessionFixture;
let requester: SessionFixture;
let requesterB: SessionFixture;
let requesterLinkedId = -1;
let foreignLinkedId = -1;

async function createProbeTicket(opts: {
  requesterId?: number;
  status?: string;
  ownerId?: number | null;
} = {}): Promise<{ id: number; ticketNumber: string; createdAt: Date }> {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: nextNumber(),
      title: 'Actions probe',
      description: 'Actions Taken probe body',
      status: ((opts.status ?? 'OPEN') as never),
      priority: 'MEDIUM',
      itPriority: null,
      ownerId: opts.ownerId ?? null,
      requesterId: opts.requesterId ?? requesterLinkedId,
      categoryId: 1,
      relatedSystemId: 1,
    },
  });
  return { id: ticket.id, ticketNumber: ticket.ticketNumber, createdAt: ticket.createdAt };
}

async function deleteProbe(ticketNumber: string): Promise<void> {
  try {
    const row = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (row && db.actionTaken) {
      await db.actionTaken.deleteMany({ where: { ticketId: row.id } });
    }
  } catch {
    // Red phase: ActionTaken table does not exist yet.
  }
  await prisma.ticket.deleteMany({ where: { ticketNumber } });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: 'Replaced the failing switch port.',
    result: 'Link came up at 1 Gbps and stayed stable.',
    ...overrides,
  };
}

async function createAction(
  auth: SessionFixture,
  ticketNumber: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return withWriteAuth(auth, request(app).post(`/api/tickets/${ticketNumber}/actions`)).send(body);
}

beforeAll(async () => {
  sessions.push(await createSession({ label: 'at-staff-a', role: 'IT_STAFF' }));
  sessions.push(await createSession({ label: 'at-staff-b', role: 'IT_STAFF' }));
  sessions.push(await createSession({ label: 'at-admin', role: 'ADMINISTRATOR' }));
  sessions.push(
    await createSession({ label: 'at-req', role: 'REQUESTER', withLinkedRequester: true }),
  );
  sessions.push(
    await createSession({ label: 'at-req-b', role: 'REQUESTER', withLinkedRequester: true }),
  );
  [staffA, staffB, admin, requester, requesterB] = sessions;
  requesterLinkedId = requester.requesterId as number;
  foreignLinkedId = requesterB.requesterId as number;
  expect(foreignLinkedId).not.toBe(requesterLinkedId);
}, 60_000);

afterAll(async () => {
  // Actions Restrict-delete their ticket: clear band actions first so the
  // ticket wipe below never fails on the FK (per-test deleteProbe already
  // does this; this is the failure-path safety net).
  try {
    if (db.actionTaken) {
      await db.actionTaken.deleteMany({
        where: { ticket: { ticketNumber: { gte: 'TTK-2026-902000', lt: 'TTK-2026-903000' } } },
      });
    }
  } catch {
    // Red phase: ActionTaken table does not exist yet.
  }
  await prisma.ticket.deleteMany({
    where: { ticketNumber: { gte: 'TTK-2026-902000', lt: 'TTK-2026-903000' } },
  }).catch(() => undefined);
  for (const fixture of sessions.splice(0, sessions.length)) {
    await fixture.dispose().catch(() => undefined);
  }
  await cleanupAllSessions();
});

// ---------------------------------------------------------------------------
// API-01 (AC-01): client-supplied performedById is ignored; the session user
// is stored.
// ---------------------------------------------------------------------------
describe('API-01 — performedBy is server-derived (AC-01)', () => {
  it('201 stores the session user even with a wrong performedById in the body', async () => {
    const t = await createProbeTicket();
    const res = await createAction(staffA, t.ticketNumber, validBody({ performedById: 999999 }));
    expect(res.status).toBe(201);
    expect(res.body.performedBy).toMatchObject({ id: staffA.userId, role: 'IT_STAFF' });
    const row = await db.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.performedById).toBe(staffA.userId);
    expect(row.ticketId).toBe(t.id);
    expect(row.version).toBe(1);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-02 + API-03 (AC-03): follow-up note conditional.
// ---------------------------------------------------------------------------
describe('API-02 — followUpRequired=true without a note is 400 (AC-03)', () => {
  it('400 with field followUpNote when the note is missing, empty or whitespace', async () => {
    const t = await createProbeTicket();
    for (const note of [undefined, '', '   ']) {
      const body = validBody({ followUpRequired: true });
      if (note !== undefined) body.followUpNote = note;
      const res = await createAction(staffA, t.ticketNumber, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain('followUpNote');
    }
    expect(await db.actionTaken.count({ where: { ticketId: t.id } })).toBe(0);
    await deleteProbe(t.ticketNumber);
  });

  it('201 when a valid follow-up note is supplied', async () => {
    const t = await createProbeTicket();
    const res = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ followUpRequired: true, followUpNote: 'Recheck counters tomorrow.' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.followUpRequired).toBe(true);
    expect(res.body.followUpNote).toBe('Recheck counters tomorrow.');
    await deleteProbe(t.ticketNumber);
  });
});

describe('API-03 — clearing followUpRequired clears the note (AC-03)', () => {
  it('PATCH followUpRequired=false returns 200 and stores followUpNote null', async () => {
    const t = await createProbeTicket();
    const created = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ followUpRequired: true, followUpNote: 'Recheck counters tomorrow.' }),
    );
    expect(created.status).toBe(201);
    const patched = await withWriteAuth(
      staffA,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${created.body.id}`),
    ).send({ expectedVersion: 1, followUpRequired: false });
    expect(patched.status).toBe(200);
    expect(patched.body.followUpRequired).toBe(false);
    expect(patched.body.followUpNote).toBeNull();
    const row = await db.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.followUpNote).toBeNull();
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-04 (AC-24): actionAt window.
// ---------------------------------------------------------------------------
describe('API-04 — actionAt window: +5min future cap, not before createdAt (AC-24)', () => {
  it('+6min future is 400; near-boundary future is accepted', async () => {
    const t = await createProbeTicket();
    const late = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ actionAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() }),
    );
    expect(late.status).toBe(400);
    expect(late.body.details.map((d: { field: string }) => d.field)).toContain('actionAt');
    const edge = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ actionAt: new Date(Date.now() + 5 * 60 * 1000 - 10 * 1000).toISOString() }),
    );
    expect(edge.status).toBe(201);
    await deleteProbe(t.ticketNumber);
  });

  it('before ticket.createdAt is 400; equal to createdAt is accepted', async () => {
    const t = await createProbeTicket();
    const early = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ actionAt: new Date(t.createdAt.getTime() - 1000).toISOString() }),
    );
    expect(early.status).toBe(400);
    expect(early.body.details.map((d: { field: string }) => d.field)).toContain('actionAt');
    const equal = await createAction(
      staffA,
      t.ticketNumber,
      validBody({ actionAt: t.createdAt.toISOString() }),
    );
    expect(equal.status).toBe(201);
    await deleteProbe(t.ticketNumber);
  });

  it('omitted actionAt defaults to now with 201', async () => {
    const t = await createProbeTicket();
    const res = await createAction(staffA, t.ticketNumber, validBody());
    expect(res.status).toBe(201);
    expect(new Date(res.body.actionAt).getTime()).toBeLessThanOrEqual(Date.now() + 60 * 1000);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-05 (AC-24): length boundaries on POST and PATCH.
// ---------------------------------------------------------------------------
describe('API-05 — description/result/attachmentNotes boundaries (AC-24)', () => {
  it('POST: 0/whitespace/2001-char description+result and 501-char notes are 400; 1/2000/500 ok', async () => {
    const t = await createProbeTicket();
    const bad: Array<Record<string, unknown>> = [
      validBody({ description: '' }),
      validBody({ description: '   ' }),
      validBody({ description: 'x'.repeat(2001) }),
      validBody({ result: '' }),
      validBody({ result: '   ' }),
      validBody({ result: 'x'.repeat(2001) }),
      validBody({ attachmentNotes: 'x'.repeat(501) }),
    ];
    for (const body of bad) {
      const res = await createAction(staffA, t.ticketNumber, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(Array.isArray(res.body.details)).toBe(true);
    }
    expect(await db.actionTaken.count({ where: { ticketId: t.id } })).toBe(0);

    const good: Array<Record<string, unknown>> = [
      validBody({ description: 'x', result: 'y' }),
      validBody({ description: 'x'.repeat(2000), result: 'y'.repeat(2000) }),
      validBody({ attachmentNotes: 'x'.repeat(500) }),
    ];
    for (const body of good) {
      const res = await createAction(staffA, t.ticketNumber, body);
      expect(res.status).toBe(201);
    }
    await deleteProbe(t.ticketNumber);
  });

  it('PATCH: the same limits hold and write nothing on 400', async () => {
    const t = await createProbeTicket();
    const created = await createAction(staffA, t.ticketNumber, validBody());
    expect(created.status).toBe(201);
    const id = created.body.id;
    for (const patch of [
      { expectedVersion: 1, description: '' },
      { expectedVersion: 1, result: 'x'.repeat(2001) },
      { expectedVersion: 1, attachmentNotes: 'x'.repeat(501) },
    ]) {
      const res = await withWriteAuth(
        staffA,
        request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${id}`),
      ).send(patch);
      expect(res.status).toBe(400);
    }
    const row = await db.actionTaken.findUniqueOrThrow({ where: { id } });
    expect(row.version).toBe(1);
    expect(row.description).toBe('Replaced the failing switch port.');
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-06 (AC-08): duplicate-safe create.
// ---------------------------------------------------------------------------
describe('API-06 — clientRequestId idempotency (AC-08)', () => {
  it('same performer + same id replays the original with 200; different performer inserts; absent id always inserts', async () => {
    const t = await createProbeTicket();
    const clientRequestId = randomUUID();
    const first = await createAction(staffA, t.ticketNumber, validBody({ clientRequestId }));
    expect(first.status).toBe(201);
    const replay = await createAction(staffA, t.ticketNumber, validBody({ clientRequestId }));
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(await db.actionTaken.count({ where: { ticketId: t.id } })).toBe(1);

    const otherPerformer = await createAction(staffB, t.ticketNumber, validBody({ clientRequestId }));
    expect(otherPerformer.status).toBe(201);
    expect(otherPerformer.body.id).not.toBe(first.body.id);

    const a = await createAction(staffA, t.ticketNumber, validBody({ description: 'No id one' }));
    const b = await createAction(staffA, t.ticketNumber, validBody({ description: 'No id two' }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
    await deleteProbe(t.ticketNumber);
  });

  it('400 for a malformed clientRequestId', async () => {
    const t = await createProbeTicket();
    const res = await createAction(staffA, t.ticketNumber, validBody({ clientRequestId: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toContain('clientRequestId');
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-07 (AC-06): ordering + empty log.
// ---------------------------------------------------------------------------
describe('API-07 — stable actionAt-desc/id-desc order; empty log is 200 [] (AC-06)', () => {
  it('three actions sharing one timestamp read back id-desc across repeated reads', async () => {
    const t = await createProbeTicket();
    // Share the ticket's own createdAt: equal-to-createdAt is inside the
    // BR-03 window, while an arbitrary past instant would predate the ticket.
    const stamp = t.createdAt.toISOString();
    const ids: number[] = [];
    for (const description of ['First action', 'Second action', 'Third action']) {
      const res = await createAction(staffA, t.ticketNumber, validBody({ description, actionAt: stamp }));
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    const expected = [...ids].sort((a, b) => b - a);
    for (let i = 0; i < 2; i += 1) {
      const list = await withCookie(staffA, request(app).get(`/api/tickets/${t.ticketNumber}/actions`));
      expect(list.status).toBe(200);
      expect(list.body.ticketNumber).toBe(t.ticketNumber);
      expect(list.body.actions.map((a: { id: number }) => a.id)).toEqual(expected);
    }
    await deleteProbe(t.ticketNumber);
  });

  it('legacy ticket with no actions returns 200 with an empty array', async () => {
    const t = await createProbeTicket();
    const list = await withCookie(staffA, request(app).get(`/api/tickets/${t.ticketNumber}/actions`));
    expect(list.status).toBe(200);
    expect(list.body.actions).toEqual([]);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// API-08 (AC-07): optimistic concurrency on PATCH.
// ---------------------------------------------------------------------------
describe('API-08 — action PATCH expectedVersion (AC-07)', () => {
  it('stale version is 409 with currentVersion and writes nothing; correct is 200 version+1; missing is 400', async () => {
    const t = await createProbeTicket();
    const created = await createAction(staffA, t.ticketNumber, validBody());
    expect(created.status).toBe(201);
    const id = created.body.id;

    const stale = await withWriteAuth(
      staffA,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${id}`),
    ).send({ expectedVersion: 99, result: 'Stale write must not land.' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    expect(stale.body.currentVersion).toBe(1);
    const untouched = await db.actionTaken.findUniqueOrThrow({ where: { id } });
    expect(untouched.result).toBe('Link came up at 1 Gbps and stayed stable.');
    expect(untouched.version).toBe(1);

    const missing = await withWriteAuth(
      staffA,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${id}`),
    ).send({ result: 'No version sent.' });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: { field: string }) => d.field)).toContain('expectedVersion');

    const ok = await withWriteAuth(
      staffA,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${id}`),
    ).send({ expectedVersion: 1, result: 'Counters stayed clean for 24 hours.' });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    expect(ok.body.result).toBe('Counters stayed clean for 24 hours.');
    await deleteProbe(t.ticketNumber);
  });

  it('PATCH for an action of another ticket is 404 (no cross-ticket write)', async () => {
    const a = await createProbeTicket();
    const b = await createProbeTicket();
    const created = await createAction(staffA, a.ticketNumber, validBody());
    expect(created.status).toBe(201);
    const cross = await withWriteAuth(
      staffA,
      request(app).patch(`/api/tickets/${b.ticketNumber}/actions/${created.body.id}`),
    ).send({ expectedVersion: 1, result: 'Cross-ticket write.' });
    expect(cross.status).toBe(404);
    await deleteProbe(a.ticketNumber);
    await deleteProbe(b.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// AC-04: requester / foreign / unauthenticated callers.
// ---------------------------------------------------------------------------
describe('AC-04 — requester 403, foreign masked 404, unauthenticated 401', () => {
  it('requester POST and PATCH on their own ticket are 403 with no row written', async () => {
    const t = await createProbeTicket();
    const post = await createAction(requester, t.ticketNumber, validBody());
    expect(post.status).toBe(403);
    expect(post.body.code).toBe('FORBIDDEN');

    const seeded = await createAction(staffA, t.ticketNumber, validBody());
    expect(seeded.status).toBe(201);
    const patch = await withWriteAuth(
      requester,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${seeded.body.id}`),
    ).send({ expectedVersion: 1, result: 'Requester edit.' });
    expect(patch.status).toBe(403);
    expect(await db.actionTaken.count({ where: { ticketId: t.id } })).toBe(1);
    await deleteProbe(t.ticketNumber);
  });

  it('requester probing a foreign ticket gets masked 404 on GET/POST', async () => {
    const t = await createProbeTicket();
    const get = await withCookie(requesterB, request(app).get(`/api/tickets/${t.ticketNumber}/actions`));
    expect(get.status).toBe(404);
    expect(get.body.error).toBe('Ticket not found');
    const post = await createAction(requesterB, t.ticketNumber, validBody());
    expect(post.status).toBe(404);
    expect(post.body.error).toBe('Ticket not found');
    await deleteProbe(t.ticketNumber);
  });

  it('unauthenticated GET/POST/PATCH are 401 UNAUTHENTICATED', async () => {
    const t = await createProbeTicket();
    const get = await request(app).get(`/api/tickets/${t.ticketNumber}/actions`);
    expect(get.status).toBe(401);
    expect(get.body.code).toBe('UNAUTHENTICATED');
    const post = await request(app).post(`/api/tickets/${t.ticketNumber}/actions`).send(validBody());
    expect(post.status).toBe(401);
    const patch = await request(app)
      .patch(`/api/tickets/${t.ticketNumber}/actions/1`)
      .send({ expectedVersion: 1 });
    expect(patch.status).toBe(401);
    await deleteProbe(t.ticketNumber);
  });

  it('malformed ticket number is 400; absent ticket is 404', async () => {
    const malformed = await withCookie(staffA, request(app).get('/api/tickets/not-a-number/actions'));
    expect(malformed.status).toBe(400);
    const absent = await withCookie(staffA, request(app).get('/api/tickets/TTK-2026-999999/actions'));
    expect(absent.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// AC-05: non-owner staff records work; ownership never moves.
// ---------------------------------------------------------------------------
describe('AC-05 — staff B records on A-owned ticket; owner stays A', () => {
  it('action by non-owner is accepted and ownerId is unchanged', async () => {
    const t = await createProbeTicket({ ownerId: staffA.userId });
    const res = await createAction(staffB, t.ticketNumber, validBody({ description: 'Work by B.' }));
    expect(res.status).toBe(201);
    expect(res.body.performedBy.id).toBe(staffB.userId);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: t.ticketNumber } });
    expect(row.ownerId).toBe(staffA.userId);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// AC-17: Admin operates as IT Staff on actions.
// ---------------------------------------------------------------------------
describe('AC-17 — Admin creates (201) and updates (200) actions (D-01)', () => {
  it('admin POST then PATCH succeed with the admin as performer', async () => {
    const t = await createProbeTicket();
    const created = await createAction(admin, t.ticketNumber, validBody({ description: 'Admin work.' }));
    expect(created.status).toBe(201);
    expect(created.body.performedBy).toMatchObject({ id: admin.userId, role: 'ADMINISTRATOR' });
    const patched = await withWriteAuth(
      admin,
      request(app).patch(`/api/tickets/${t.ticketNumber}/actions/${created.body.id}`),
    ).send({ expectedVersion: 1, result: 'Admin follow-through.' });
    expect(patched.status).toBe(200);
    expect(patched.body.version).toBe(2);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// AC-23: deactivated staff cannot write; prior actions stay readable.
// ---------------------------------------------------------------------------
describe('AC-23 — deactivated staff write rejection, history preserved', () => {
  it('inactive account cannot log in (403)', async () => {
    const email = uniqueEmail('at-inactive');
    const passwordHash = await bcrypt.hash('StartValid1!', 4);
    const ghost = await prisma.user.create({
      data: { name: 'At Ghost', email, passwordHash, role: 'IT_STAFF', isActive: false, mustChangePassword: false },
    });
    try {
      const login = await request(app).post('/api/auth/login').send({ email, password: 'StartValid1!' });
      expect(login.status).toBe(403);
    } finally {
      await prisma.session.deleteMany({ where: { userId: ghost.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: ghost.id } }).catch(() => undefined);
    }
  });

  it('mid-session deactivation rejects the next write with 403; prior actions remain readable', async () => {
    const doomed = await createSession({ label: 'at-doomed', role: 'IT_STAFF' });
    sessions.push(doomed);
    const t = await createProbeTicket();
    const before = await createAction(doomed, t.ticketNumber, validBody({ description: 'Work before deactivation.' }));
    expect(before.status).toBe(201);
    await prisma.user.update({ where: { id: doomed.userId }, data: { isActive: false } });
    const after = await createAction(doomed, t.ticketNumber, validBody({ description: 'Work after deactivation.' }));
    expect(after.status).toBe(403);
    const list = await withCookie(staffA, request(app).get(`/api/tickets/${t.ticketNumber}/actions`));
    expect(list.status).toBe(200);
    expect(list.body.actions.map((a: { id: number }) => a.id)).toContain(before.body.id);
    await prisma.user.update({ where: { id: doomed.userId }, data: { isActive: true } }).catch(() => undefined);
    await deleteProbe(t.ticketNumber);
  });
});

// ---------------------------------------------------------------------------
// L4-2 foundation: ticket detail carries version (+ null lifecycle fields).
// ---------------------------------------------------------------------------
describe('ticket detail version foundation (api-spec §3.1)', () => {
  it('staff detail exposes version 1 with null resolvedAt/resolutionSummary', async () => {
    const t = await createProbeTicket();
    const res = await withCookie(staffA, request(app).get(`/api/staff/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.resolvedAt).toBeNull();
    expect(res.body.resolutionSummary).toBeNull();
    await deleteProbe(t.ticketNumber);
  });

  it('requester detail exposes version 1', async () => {
    const t = await createProbeTicket();
    const res = await withCookie(requester, request(app).get(`/api/tickets/${t.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    await deleteProbe(t.ticketNumber);
  });
});
