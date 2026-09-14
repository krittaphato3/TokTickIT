import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  withWriteAuth,
  type SessionFixture,
} from '../helpers/session.js';

// Lab 3 Issue #41 — Public Comments (api-spec §7, FR-08/FR-09/FR-10,
// BR-04/BR-05/BR-14). Rows owned here (docs/lab-03/tests.md §2):
//   T-COMM-01  public comment visibility per role (AC-12)
//   T-COMM-02  internal notes stay requester-masked (masked 404, no leak) —
//              notes routes do not exist yet; absence asserted 404-safe
//   T-COMM-03  append-only: no edit/delete paths (404/405)
//   T-COMM-04  empty/whitespace/2001-char bodies -> 400 with details
//   T-STAT-03  appears-resolved indication: timestamp set, status unchanged,
//              one active signal (AC-14)
// Staff alias routes (GET/POST /api/staff/tickets/:number/comments) ship with
// the staff detail issue; here the requester-facing routes are normative.

const prisma = getPrisma();

let createdTicketNumbers: string[] = [];
const fixtures: SessionFixture[] = [];

async function fixture(opts: Parameters<typeof createSession>[0]): Promise<SessionFixture> {
  const f = await createSession(opts);
  fixtures.push(f);
  return f;
}

async function createTicketAs(f: SessionFixture, title: string) {
  const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Hardware' } });
  const system = await prisma.relatedSystem.findUniqueOrThrow({ where: { name: 'Printer' } });
  const res = await withWriteAuth(f, request(app).post('/api/tickets')).send({
    title,
    categoryId: category.id,
    relatedSystemId: system.id,
  });
  expect(res.status).toBe(201);
  createdTicketNumbers.push(res.body.ticketNumber);
  return res.body as { ticketNumber: string };
}

afterEach(async () => {
  // Comments cascade with their ticket.
  await prisma.ticket.deleteMany({
    where: { ticketNumber: { in: createdTicketNumbers } },
  });
  createdTicketNumbers = [];
});

afterAll(async () => {
  await cleanupAllSessions();
});

describe('T-COMM-01 — public comment visibility (FR-08, BR-04, AC-12)', () => {
  it('requester posts on own ticket; thread lists chronologically with server-derived author/createdAt', async () => {
    const alpha = await fixture({ label: 'cm01a', withLinkedRequester: true });
    const staff = await fixture({ label: 'cm01s', role: 'IT_STAFF' });
    const admin = await fixture({ label: 'cm01d', role: 'ADMINISTRATOR' });
    const ticket = await createTicketAs(alpha, 'Comment visibility ticket');

    const first = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'First comment from requester.',
    });
    expect(first.status).toBe(201);
    expect(first.body.author.id).toBe(alpha.userId);
    expect(first.body.author.role).toBe('REQUESTER');
    expect(first.body.createdAt).toBeTruthy();
    expect(first.body.appearsResolved).toBe(false);

    // Staff and admin can post to any ticket (BR-04).
    const staffPost = await withWriteAuth(staff, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Staff reply.',
    });
    expect(staffPost.status).toBe(201);
    expect(staffPost.body.author.role).toBe('IT_STAFF');

    const adminPost = await withWriteAuth(admin, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Admin note to requester.',
    });
    expect(adminPost.status).toBe(201);

    // All three roles read the same chronological thread.
    for (const reader of [alpha, staff, admin]) {
      const list = await withCookie(reader, request(app).get(`/api/tickets/${ticket.ticketNumber}/comments`));
      expect(list.status).toBe(200);
      expect(list.body.map((c: { body: string }) => c.body)).toEqual([
        'First comment from requester.',
        'Staff reply.',
        'Admin note to requester.',
      ]);
      for (const c of list.body) {
        expect(c.author).toHaveProperty('name');
        expect(c.author).toHaveProperty('role');
        expect(c.createdAt).toBeTruthy();
      }
    }
  });

  it('unauthenticated callers get 401 on list and create', async () => {
    const alpha = await fixture({ label: 'cm01b', withLinkedRequester: true });
    const ticket = await createTicketAs(alpha, '401 probe ticket');
    const list = await request(app).get(`/api/tickets/${ticket.ticketNumber}/comments`);
    expect(list.status).toBe(401);
    const post = await request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`).send({ body: 'x' });
    expect(post.status).toBe(401);
  });

  it('CSRF is enforced on comment create', async () => {
    const alpha = await fixture({ label: 'cm01c', withLinkedRequester: true });
    const ticket = await createTicketAs(alpha, 'CSRF probe ticket');
    const res = await withCookie(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'no csrf token',
    });
    expect(res.status).toBe(403);
  });
});

describe('T-COMM-04 — body validation (BR-14)', () => {
  it('empty, whitespace-only, non-string, and 2001-char bodies -> 400 with field details', async () => {
    const alpha = await fixture({ label: 'cm04', withLinkedRequester: true });
    const ticket = await createTicketAs(alpha, 'Validation ticket');

    for (const bad of ['', '    ', 42, null]) {
      const res = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
        body: bad,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('body');
      expect(res.body.details[0].message).toMatch(/empty|must be a string/i);
    }

    const over = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'a'.repeat(2001),
    });
    expect(over.status).toBe(400);
    expect(over.body.details[0].message).toBe('Comment must be at most 2000 characters');

    // 2000 trimmed chars pass; leading/trailing whitespace is trimmed.
    const ok = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: `  ${'b'.repeat(2000)}  `,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.body.length).toBe(2000);
  });
});

describe('T-COMM-03 — append-only (BR-14)', () => {
  it('edit and delete paths do not exist for comments', async () => {
    const alpha = await fixture({ label: 'cm03', withLinkedRequester: true });
    const ticket = await createTicketAs(alpha, 'Append-only ticket');
    const created = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Immutable entry.',
    });
    expect(created.status).toBe(201);
    const commentId = created.body.id as number;

    const patch = await withWriteAuth(alpha, request(app).patch(`/api/tickets/${ticket.ticketNumber}/comments/${commentId}`)).send({
      body: 'edited',
    });
    expect([404, 405]).toContain(patch.status);

    const del = await withWriteAuth(alpha, request(app).delete(`/api/tickets/${ticket.ticketNumber}/comments/${commentId}`));
    expect([404, 405]).toContain(del.status);

    const list = await withCookie(alpha, request(app).get(`/api/tickets/${ticket.ticketNumber}/comments`));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].body).toBe('Immutable entry.');
  });
});

describe('T-STAT-03 — problem-appears-resolved indication (FR-10, BR-05, AC-14)', () => {
  it('sets appearsResolvedAt + flagged comment without touching status; one active signal', async () => {
    const alpha = await fixture({ label: 'st03a', withLinkedRequester: true });
    const staff = await fixture({ label: 'st03s', role: 'IT_STAFF' });
    const ticket = await createTicketAs(alpha, 'Appears-resolved ticket');

    const before = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: ticket.ticketNumber } });
    expect(before.status).toBe('NEW');
    expect(before.appearsResolvedAt).toBeNull();

    const signal = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'The problem appears resolved from my side.',
      appearsResolved: true,
    });
    expect(signal.status).toBe(201);
    expect(signal.body.appearsResolved).toBe(true);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: ticket.ticketNumber } });
    expect(after.status).toBe('NEW'); // status unchanged — BR-05
    expect(after.appearsResolvedAt).not.toBeNull();

    // One active signal per episode: a second hint conflicts (409)...
    const dup = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Trying to signal again.',
      appearsResolved: true,
    });
    expect(dup.status).toBe(409);

    // ...while a plain comment still works and the flagged entry stays.
    const plain = await withWriteAuth(alpha, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Regular follow-up comment.',
    });
    expect(plain.status).toBe(201);

    // Staff sees the flagged comment in the shared thread (triage input).
    const staffView = await withCookie(staff, request(app).get(`/api/tickets/${ticket.ticketNumber}/comments`));
    expect(staffView.status).toBe(200);
    const flagged = staffView.body.find((c: { appearsResolved: boolean }) => c.appearsResolved);
    expect(flagged.body).toBe('The problem appears resolved from my side.');
  });

  it('appearsResolved hint from non-requester authors is ignored (no signal stamped)', async () => {
    const alpha = await fixture({ label: 'st03b', withLinkedRequester: true });
    const staff = await fixture({ label: 'st03b-s', role: 'IT_STAFF' });
    const ticket = await createTicketAs(alpha, 'Staff hint ignored');

    const res = await withWriteAuth(staff, request(app).post(`/api/tickets/${ticket.ticketNumber}/comments`)).send({
      body: 'Staff comment with stray hint.',
      appearsResolved: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.appearsResolved).toBe(false);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: ticket.ticketNumber } });
    expect(after.appearsResolvedAt).toBeNull();
  });
});

describe('T-COMM-02 — internal notes stay requester-invisible (FR-09, BR-04, AC-04)', () => {
  it('note routes do not exist yet; probe returns a safe error with no note data', async () => {
    const alpha = await fixture({ label: 'cm02', withLinkedRequester: true });
    const staff = await fixture({ label: 'cm02-s', role: 'IT_STAFF' });
    const ticket = await createTicketAs(alpha, 'Notes probe ticket');

    // The internal-notes surface ships with the staff detail issue. Today the
    // routes are absent (404). Contract to hold either way: a requester gets
    // no note content and no existence signal (masked 404 or absent-route
    // 404), never 200 and never 403-with-content.
    const list = await withCookie(alpha, request(app).get(`/api/staff/tickets/${ticket.ticketNumber}/internal-notes`));
    expect(list.status).toBe(404);
    expect(list.body).not.toHaveProperty('notes');
    expect(JSON.stringify(list.body)).not.toMatch(/internal/i);

    const post = await withWriteAuth(alpha, request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/internal-notes`)).send({
      body: 'should never land',
    });
    expect(post.status).toBe(404);

    // Staff sees the same absent route today — no partial surface.
    const staffList = await withCookie(staff, request(app).get(`/api/staff/tickets/${ticket.ticketNumber}/internal-notes`));
    expect(staffList.status).toBe(404);
  });
});
