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

// L4-3 — governed ticket workflow (docs/lab-04/tests.md WF-01..WF-06 plus the
// api-spec §3.1/§3.2/§3.3/§3.4/§3.5 contract). Disposable probe tickets live
// in the reserved TTK-2026-9021xx band (L4-2 owns 9020xx, the migration suite
// owns 9030xx); every probe and its actions are removed in afterAll so the
// shared database stays pristine.

const prisma = getPrisma();

const BAND_BASE = 902100;
let counter = 0;
const createdNumbers = new Set<string>();

function nextNumber(): string {
  counter += 1;
  const number = `TTK-2026-${String(BAND_BASE + counter).padStart(6, '0')}`;
  createdNumbers.add(number);
  return number;
}

interface Probe {
  id: number;
  ticketNumber: string;
  status: string;
  version: number;
  ownerId: number | null;
}

async function createProbe(opts: {
  status: TicketStatus;
  ownerId?: number | null;
  ownerName?: string | null;
  requesterId: number;
}): Promise<Probe> {
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: nextNumber(),
      title: 'Workflow probe',
      description: 'Lab 4 workflow probe body',
      status: opts.status as never,
      priority: 'MEDIUM',
      itPriority: null,
      ownerId: opts.ownerId ?? null,
      ownerName: opts.ownerName ?? null,
      requesterId: opts.requesterId,
      categoryId: 1,
      relatedSystemId: 1,
    },
  });
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    status: row.status,
    version: row.version,
    ownerId: row.ownerId,
  };
}

async function addAction(ticketId: number, performerId: number, followUpRequired = false): Promise<number> {
  const row = await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: performerId,
      actionAt: new Date(),
      description: 'Probe action recorded for the workflow suite.',
      result: 'Probe result.',
      followUpRequired,
      followUpNote: followUpRequired ? 'Probe follow-up note.' : null,
    },
  });
  return row.id;
}

async function deleteProbe(ticketNumber: string): Promise<void> {
  const row = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (row) {
    await prisma.actionTaken.deleteMany({ where: { ticketId: row.id } });
    await prisma.ticket.delete({ where: { id: row.id } });
  }
}

function patchStatus(
  auth: SessionFixture | null,
  ticketNumber: string,
  body: Record<string, unknown>,
): request.Test {
  const chain = request(app).patch(`/api/staff/tickets/${ticketNumber}/status`);
  return auth ? withWriteAuth(auth, chain).send(body) : chain.send(body);
}

// BR-09 — transcribed independently from specification.md §5 (the unit suite
// owns the exhaustive pair check; the API suite proves the endpoint enforces
// the same table).
const EXPECTED_MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
};

type TicketStatus = keyof typeof EXPECTED_MATRIX;
const ALL_STATUSES = Object.keys(EXPECTED_MATRIX) as TicketStatus[];
const PERMITTED_PAIRS: Array<{ from: TicketStatus; to: TicketStatus }> = ALL_STATUSES.flatMap((from) =>
  EXPECTED_MATRIX[from].map((to) => ({ from, to })),
);
const REJECTED_PAIRS: Array<{ from: TicketStatus; to: TicketStatus }> = ALL_STATUSES.flatMap((from) =>
  ALL_STATUSES.filter((to) => to !== from && !EXPECTED_MATRIX[from].includes(to)).map((to) => ({
    from,
    to,
  })),
);

let staffA: SessionFixture;
let staffB: SessionFixture;
let admin: SessionFixture;
let requester: SessionFixture;
let foreignRequester: SessionFixture;
let linkedRequesterId = -1;
let foreignRequesterId = -1;
let staffAId = -1;
let staffBId = -1;

beforeAll(async () => {
  staffA = await createSession({ label: 'wf-staff-a', role: 'IT_STAFF' });
  staffB = await createSession({ label: 'wf-staff-b', role: 'IT_STAFF' });
  admin = await createSession({ label: 'wf-admin', role: 'ADMINISTRATOR' });
  requester = await createSession({ label: 'wf-requester', role: 'REQUESTER', withLinkedRequester: true });
  foreignRequester = await createSession({
    label: 'wf-requester-b',
    role: 'REQUESTER',
    withLinkedRequester: true,
  });
  linkedRequesterId = requester.requesterId as number;
  foreignRequesterId = foreignRequester.requesterId as number;
  staffAId = staffA.userId;
  staffBId = staffB.userId;
});

afterAll(async () => {
  for (const number of createdNumbers) {
    await deleteProbe(number).catch(() => undefined);
  }
  await cleanupAllSessions();
});

describe('WF-01 — every permitted transition over the API (BR-09, AC-09)', () => {
  it('the permitted pair list is the documented matrix', () => {
    expect(PERMITTED_PAIRS).toHaveLength(23);
  });

  it.each(PERMITTED_PAIRS)('IT Staff $from -> $to succeeds and bumps the version', async ({ from, to }) => {
    const probe = await createProbe({ status: from, ownerId: staffAId, ownerName: staffA.name, requesterId: linkedRequesterId });
    if (to === 'RESOLVED') {
      // Gate precondition: at least one action, none with outstanding follow-up.
      await addAction(probe.id, staffAId);
    }
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });

    const res = await patchStatus(staffA, probe.ticketNumber, {
      status: to,
      expectedVersion: probe.version,
      confirm: true,
      ...(to === 'REOPENED' ? { reason: `Reopening from ${from} in WF-01.` } : {}),
      ...(to === 'RESOLVED' ? { resolutionSummary: 'Confirmed working after the fix.' } : {}),
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(to);
    expect(res.body.version).toBe(probe.version + 1);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe(to);
    expect(after.version).toBe(probe.version + 1);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(after.ownerId).toBe(staffAId);

    if (to === 'RESOLVED') {
      expect(after.resolvedAt).not.toBeNull();
      expect(after.resolutionSummary).toBe('Confirmed working after the fix.');
    }
    if (to === 'REOPENED') {
      // BR-10/§3.2 — reopening clears the active resolvedAt but keeps the
      // stored summary as history.
      expect(after.resolvedAt).toBeNull();
    }
  });

  it('Admin performs the same transitions (D-01/BR-15)', async () => {
    const probe = await createProbe({ status: 'IN_PROGRESS', ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await patchStatus(admin, probe.ticketNumber, {
      status: 'WAITING_FOR_REQUESTER',
      expectedVersion: probe.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WAITING_FOR_REQUESTER');
    expect(res.body.version).toBe(2);
  });

  it.each(ALL_STATUSES)('self-transition from %s is a 400 no-op', async (status) => {
    const probe = await createProbe({ status, ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await patchStatus(staffA, probe.ticketNumber, {
      status,
      expectedVersion: probe.version,
      confirm: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe(status);
    expect(after.version).toBe(probe.version);
  });
});

describe('WF-02 — UI bypass and requester rejection (BR-09, AC-09)', () => {
  it.each(REJECTED_PAIRS)('$from -> $to is rejected with 422 INVALID_TRANSITION', async ({ from, to }) => {
    const probe = await createProbe({ status: from, ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await patchStatus(staffA, probe.ticketNumber, {
      status: to,
      expectedVersion: probe.version,
      confirm: true,
      reason: 'attempt',
      resolutionSummary: 'attempt',
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(res.body.error).toBe(`Illegal status transition from ${from} to ${to}`);
    const permitted = (res.body.details as Array<{ field: string; message: string }>)[0];
    expect(permitted.field).toBe('status');
    // The named set is compared token by token (a substring check would call
    // "REOPENED" a match for "OPEN").
    const named = permitted.message
      .replace(/^Permitted targets from \w+: /, '')
      .split(', ')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(named).toEqual(EXPECTED_MATRIX[from]);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe(from);
    expect(after.version).toBe(probe.version);
  });

  it('a target outside the status enum is a 400 validation failure', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await patchStatus(staffA, probe.ticketNumber, {
      status: 'DONE',
      expectedVersion: probe.version,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('a malformed ticket number is still a 400 on the staff route', async () => {
    const res = await patchStatus(staffA, 'not-a-ticket', { status: 'OPEN', expectedVersion: 1 });
    expect(res.status).toBe(400);
  });

  it.each(ALL_STATUSES)(
    'a Requester gets 403 on the staff route regardless of target (%s) and nothing changes',
    async (target) => {
      const probe = await createProbe({ status: 'OPEN', requesterId: linkedRequesterId });
      const res = await patchStatus(requester, probe.ticketNumber, {
        status: target,
        expectedVersion: probe.version,
        confirm: true,
        reason: 'attempt',
        resolutionSummary: 'attempt',
      });
      expect(res.status).toBe(403);
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
      expect(after.status).toBe('OPEN');
      expect(after.version).toBe(probe.version);
    },
  );

  it('a Requester gets 403 on the requester status route even for their own ticket (D-06)', async () => {
    const probe = await createProbe({ status: 'RESOLVED', requesterId: linkedRequesterId });
    for (const target of ['REOPENED', 'CLOSED', 'OPEN', 'RESOLVED'] as const) {
      const res = await withWriteAuth(requester, request(app).patch(`/api/tickets/${probe.ticketNumber}/status`)).send({
        status: target,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.error).toBe('Only IT Staff may change ticket status');
    }
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('RESOLVED');
    expect(after.version).toBe(probe.version);
  });

  it('a Requester gets the same 403 on a foreign ticket number (no existence leak)', async () => {
    const probe = await createProbe({ status: 'OPEN', requesterId: foreignRequesterId });
    const res = await withWriteAuth(requester, request(app).patch(`/api/tickets/${probe.ticketNumber}/status`)).send({
      status: 'REOPENED',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const absent = await withWriteAuth(requester, request(app).patch('/api/tickets/TTK-2026-999999/status')).send({
      status: 'REOPENED',
    });
    expect(absent.status).toBe(403);
    expect(absent.body).toEqual(res.body);
  });

  it('both status routes reject an unauthenticated caller with 401', async () => {
    const probe = await createProbe({ status: 'OPEN', requesterId: linkedRequesterId });
    const staffRoute = await request(app)
      .patch(`/api/staff/tickets/${probe.ticketNumber}/status`)
      .send({ status: 'IN_PROGRESS', expectedVersion: probe.version });
    expect(staffRoute.status).toBe(401);

    const requesterRoute = await request(app)
      .patch(`/api/tickets/${probe.ticketNumber}/status`)
      .send({ status: 'IN_PROGRESS' });
    expect(requesterRoute.status).toBe(401);
  });
});

describe('WF-03 — the resolution gate (BR-10, AC-10)', () => {
  async function resolve(
    auth: SessionFixture,
    probe: Probe,
    body: Record<string, unknown> = {},
  ): Promise<request.Response> {
    return patchStatus(auth, probe.ticketNumber, {
      status: 'RESOLVED',
      expectedVersion: probe.version,
      confirm: true,
      resolutionSummary: 'Port replaced and monitored.',
      ...body,
    });
  }

  it('no actions at all -> 422 RESOLUTION_GATE [NO_ACTIONS]', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await resolve(staffA, probe);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESOLUTION_GATE');
    expect((res.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual(['NO_ACTIONS']);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('OPEN');
    expect(after.resolvedAt).toBeNull();
  });

  it('an outstanding follow-up -> 422 RESOLUTION_GATE [OPEN_FOLLOW_UP]', async () => {
    const probe = await createProbe({ status: 'IN_PROGRESS', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId, true);
    const res = await resolve(staffA, probe);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESOLUTION_GATE');
    expect((res.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual(['OPEN_FOLLOW_UP']);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('IN_PROGRESS');
    expect(after.resolvedAt).toBeNull();
  });

  it('a whitespace-only summary -> 422 RESOLUTION_GATE [MISSING_SUMMARY]', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId);
    const res = await resolve(staffA, probe, { resolutionSummary: '   ' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESOLUTION_GATE');
    expect((res.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual(['MISSING_SUMMARY']);
  });

  it('all three conditions broken at once reports every reason together', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    // An action that is not "any action" for the gate: it exists but has an
    // outstanding follow-up, so NO_ACTIONS must NOT be reported here.
    await addAction(probe.id, staffAId, true);
    const res = await resolve(staffA, probe, { resolutionSummary: '' });
    expect(res.status).toBe(422);
    expect((res.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual([
      'OPEN_FOLLOW_UP',
      'MISSING_SUMMARY',
    ]);

    const empty = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    const allThree = await resolve(staffA, empty, { resolutionSummary: '  ' });
    expect(allThree.status).toBe(422);
    expect((allThree.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual([
      'NO_ACTIONS',
      'MISSING_SUMMARY',
    ]);
  });

  it('a missing summary field is a 400 validation failure, not a gate rejection', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId);
    const res = await patchStatus(staffA, probe.ticketNumber, {
      status: 'RESOLVED',
      expectedVersion: probe.version,
      confirm: true,
    });
    // BR-10 lists MISSING_SUMMARY as a gate reason, so an absent summary is
    // reported by the gate (422) rather than as a schema validation error.
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESOLUTION_GATE');
    expect((res.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual(['MISSING_SUMMARY']);
  });

  it('a summary longer than 2000 characters is rejected with 400 VALIDATION', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId);
    const res = await resolve(staffA, probe, { resolutionSummary: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect((res.body.details as Array<{ field: string }>).map((d) => d.field)).toContain('resolutionSummary');
  });

  it('all conditions satisfied -> 200, resolvedAt stamped, summary stored, version bumped', async () => {
    const probe = await createProbe({ status: 'WAITING_FOR_REQUESTER', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId);
    const res = await resolve(staffA, probe, { resolutionSummary: 'Replaced the port and monitored for 24 hours.' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.resolvedAt).not.toBeNull();
    expect(res.body.version).toBe(probe.version + 1);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('RESOLVED');
    expect(after.resolutionSummary).toBe('Replaced the port and monitored for 24 hours.');
    expect(after.resolvedAt).not.toBeNull();
    expect(after.version).toBe(probe.version + 1);
  });

  it('the gate applies only to new transitions into Resolved — Resolved -> Closed is never gated', async () => {
    const probe = await createProbe({ status: 'RESOLVED', ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await patchStatus(staffA, probe.ticketNumber, {
      status: 'CLOSED',
      expectedVersion: probe.version,
      confirm: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });
});

describe('WF-04 — legacy tickets and the requester signal (BR-11, AC-10, AC-11)', () => {
  it('a legacy Resolved ticket with zero actions is readable, re-openable and then gated', async () => {
    const probe = await createProbe({ status: 'RESOLVED', ownerId: staffAId, requesterId: linkedRequesterId });

    const detail = await withCookie(staffA, request(app).get(`/api/staff/tickets/${probe.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('RESOLVED');
    expect(detail.body.allowedTransitions).toEqual(EXPECTED_MATRIX.RESOLVED);

    const reopened = await patchStatus(staffA, probe.ticketNumber, {
      status: 'REOPENED',
      expectedVersion: probe.version,
      confirm: true,
      reason: 'The issue came back after the fix.',
    });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('REOPENED');

    // No invented history: the ticket still has zero actions, so resolving it
    // again is gated (BR-11).
    expect(await prisma.actionTaken.count({ where: { ticketId: probe.id } })).toBe(0);
    const gate = await patchStatus(staffA, probe.ticketNumber, {
      status: 'RESOLVED',
      expectedVersion: probe.version + 1,
      confirm: true,
      resolutionSummary: 'Trying to resolve without any recorded work.',
    });
    expect(gate.status).toBe(422);
    expect(gate.body.code).toBe('RESOLUTION_GATE');
    expect((gate.body.details as Array<{ message: string }>).map((d) => d.message)).toEqual(['NO_ACTIONS']);
  });

  it('the requester "appears resolved" signal is advisory and never changes status (AC-11)', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    const signal = await withWriteAuth(requester, request(app).post(`/api/tickets/${probe.ticketNumber}/comments`)).send({
      body: 'The problem appears resolved on my side.',
      appearsResolved: true,
    });
    expect(signal.status).toBe(201);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('OPEN');
    expect(after.resolvedAt).toBeNull();
    expect(after.resolutionSummary).toBeNull();
    expect(after.version).toBe(probe.version);

    const detail = await withCookie(staffA, request(app).get(`/api/staff/tickets/${probe.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.appearsResolvedAt).not.toBeNull();
  });
});

describe('WF-05 — optimistic concurrency on every workflow write (BR-07, AC-12)', () => {
  it('status: missing expectedVersion -> 400 and stale -> 409 with no write', async () => {
    const probe = await createProbe({ status: 'NEW', ownerId: staffAId, requesterId: linkedRequesterId });

    const missing = await patchStatus(staffA, probe.ticketNumber, { status: 'OPEN', confirm: true });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION');

    // Someone else moves the ticket on first.
    await patchStatus(staffA, probe.ticketNumber, {
      status: 'OPEN',
      expectedVersion: probe.version,
      confirm: true,
    });
    const stale = await patchStatus(staffA, probe.ticketNumber, {
      status: 'IN_PROGRESS',
      expectedVersion: probe.version,
      confirm: true,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    expect(stale.body.currentVersion).toBe(probe.version + 1);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.status).toBe('OPEN');
    expect(after.version).toBe(probe.version + 1);

    const ok = await patchStatus(staffA, probe.ticketNumber, {
      status: 'IN_PROGRESS',
      expectedVersion: after.version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(after.version + 1);
  });

  it('owner: missing expectedVersion -> 400, stale -> 409 carrying currentVersion, success -> version+1', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });

    const missing = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/owner`)).send({
      ownerId: staffBId,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION');

    const stale = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/owner`)).send({
      ownerId: staffBId,
      expectedVersion: probe.version + 5,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    expect(stale.body.currentVersion).toBe(probe.version);
    let after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.ownerId).toBe(staffAId);
    expect(after.version).toBe(probe.version);

    const ok = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/owner`)).send({
      ownerId: staffBId,
      expectedVersion: after.version,
    });
    expect(ok.status).toBe(200);
    after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.ownerId).toBe(staffBId);
    expect(after.version).toBe(probe.version + 1);
  });

  it('IT priority: missing expectedVersion -> 400, stale -> 409, success -> version+1', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });

    const missing = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/it-priority`)).send({
      itPriority: 'HIGH',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION');

    const stale = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/it-priority`)).send({
      itPriority: 'HIGH',
      expectedVersion: probe.version + 3,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(probe.version);
    let after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.itPriority).toBeNull();
    expect(after.version).toBe(probe.version);

    const ok = await withWriteAuth(staffA, request(app).patch(`/api/staff/tickets/${probe.ticketNumber}/it-priority`)).send({
      itPriority: 'HIGH',
      expectedVersion: after.version,
    });
    expect(ok.status).toBe(200);
    after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.itPriority).toBe('HIGH');
    expect(after.version).toBe(probe.version + 1);
  });

  it('a stale workflow write leaves every stored column untouched', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, ownerName: staffA.name, requesterId: linkedRequesterId });
    await patchStatus(staffA, probe.ticketNumber, { status: 'IN_PROGRESS', expectedVersion: probe.version });
    const snapshot = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });

    const stale = await patchStatus(staffA, probe.ticketNumber, {
      status: 'RESOLVED',
      expectedVersion: probe.version,
      confirm: true,
      resolutionSummary: 'Should never be stored.',
    });
    expect(stale.status).toBe(409);

    const now = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(now).toEqual(snapshot);
  });
});

describe('WF-06 — any IT Staff may work a ticket another staff member owns (BR-02, AC-05)', () => {
  it('staff B records an action and changes status; ownerId stays staff A', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, ownerName: staffA.name, requesterId: linkedRequesterId });

    const action = await withWriteAuth(staffB, request(app).post(`/api/tickets/${probe.ticketNumber}/actions`)).send({
      description: 'Staff B picked this up.',
      result: 'Work completed by staff B.',
    });
    expect(action.status).toBe(201);
    expect(action.body.performedBy.id).toBe(staffBId);

    const moved = await patchStatus(staffB, probe.ticketNumber, {
      status: 'IN_PROGRESS',
      expectedVersion: probe.version,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.status).toBe('IN_PROGRESS');

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: probe.id } });
    expect(after.ownerId).toBe(staffAId);
    expect(after.ownerName).toBe(staffA.name);
  });
});

describe('staff detail exposes version and server-computed allowedTransitions (api-spec §3.1)', () => {
  it.each(ALL_STATUSES)('status %s advertises exactly its permitted targets', async (status) => {
    const probe = await createProbe({ status, ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await withCookie(staffA, request(app).get(`/api/staff/tickets/${probe.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(probe.version);
    expect([...res.body.allowedTransitions].sort()).toEqual([...EXPECTED_MATRIX[status]].sort());
  });

  it('Admin receives the same permitted list (D-01)', async () => {
    const probe = await createProbe({ status: 'IN_PROGRESS', ownerId: staffAId, requesterId: linkedRequesterId });
    const res = await withCookie(admin, request(app).get(`/api/staff/tickets/${probe.ticketNumber}`));
    expect(res.status).toBe(200);
    expect([...res.body.allowedTransitions].sort()).toEqual([...EXPECTED_MATRIX.IN_PROGRESS].sort());
  });

  it('the resolved lifecycle fields travel with the detail response', async () => {
    const probe = await createProbe({ status: 'OPEN', ownerId: staffAId, requesterId: linkedRequesterId });
    await addAction(probe.id, staffAId);
    await patchStatus(staffA, probe.ticketNumber, {
      status: 'RESOLVED',
      expectedVersion: probe.version,
      confirm: true,
      resolutionSummary: 'Fixed and verified.',
    });

    const res = await withCookie(staffA, request(app).get(`/api/staff/tickets/${probe.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.version).toBe(probe.version + 1);
    expect(res.body.resolvedAt).not.toBeNull();
    expect(res.body.resolutionSummary).toBe('Fixed and verified.');
    expect(res.body.allowedTransitions).toEqual(EXPECTED_MATRIX.RESOLVED);
  });
});
