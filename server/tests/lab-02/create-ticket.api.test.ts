import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  withWriteAuth,
} from '../helpers/session.js';

// API-01..API-06, API-23, API-24 — POST /api/tickets (create ticket).
// Lab 3 port: identity comes from an authenticated session instead of the
// retired X-Dev-Requester-Id header (BR-03). All Lab 2 request/response
// assertions are preserved; see tests/helpers/session.ts.
// These tests read from and write to PostgreSQL through Prisma, so the
// database must be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate deploy && npx prisma db seed

const prisma = getPrisma();

// Ticket numbers created by these tests are tracked so that afterEach can
// remove them from the database, keeping the shared seed data pristine.
let createdTicketNumbers: string[] = [];

afterEach(async () => {
  await prisma.ticket.deleteMany({
    where: { ticketNumber: { in: createdTicketNumbers } },
  });
  createdTicketNumbers = [];
});

afterAll(async () => {
  await cleanupAllSessions();
});

describe('POST /api/tickets — authentication contract (Lab 3, BR-03)', () => {
  it('API-01: returns 401 without a session (unauthenticated)', async () => {
    const res = await request(app).post('/api/tickets').send({
      title: 'Laptop will not boot after update',
      categoryId: 1,
      relatedSystemId: 1,
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('BR-03: ignores a client-supplied X-Dev-Requester-Id and uses the session identity', async () => {
    const session = await createSession({ label: 'ct-devhdr', withLinkedRequester: true });
    const hardware = await prisma.category.findUniqueOrThrow({ where: { name: 'Hardware' } });
    const printer = await prisma.relatedSystem.findUniqueOrThrow({ where: { name: 'Printer' } });

    // A stale Lab 2 client sends a forged/spoofed dev requester id (e.g. Beta
    // or a nonexistent one). The server must create the ticket for the
    // session user's linked requester, never the header value.
    const res = await withWriteAuth(session, request(app).post('/api/tickets'))
      .set('X-Dev-Requester-Id', '2')
      .send({
        title: 'Spoofed header is ignored',
        categoryId: hardware.id,
        relatedSystemId: printer.id,
      });

    expect(res.status).toBe(201);
    createdTicketNumbers.push(res.body.ticketNumber);
    const created = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(created.requesterId).toBe(session.requesterId);
    expect(created.requesterId).not.toBe(2);
  });
});

describe('POST /api/tickets — happy path and defaults (API-04)', () => {
  it('API-04: creates a ticket with 201, echoed fields, and ownership', async () => {
    const session = await createSession({ label: 'ct-alpha', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: '  Laptop will not boot after update  ',
      description: 'Screen stays black.',
      categoryId: hardware!.id,
      priority: 'HIGH',
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(201);
    // Track the number FIRST so afterEach cleans up even if a later
    // assertion in this test fails.
    createdTicketNumbers.push(res.body.ticketNumber);
    expect(res.body.ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);
    expect(res.body.status).toBe('NEW');
    expect(res.body.priority).toBe('HIGH');
    expect(res.body.title).toBe('Laptop will not boot after update');
    expect(res.body.description).toBe('Screen stays black.');
    expect(res.body.category).toEqual({
      id: hardware!.id,
      name: 'Hardware',
    });
    expect(res.body.relatedSystem).toEqual({
      id: printer!.id,
      name: 'Printer',
    });
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('updatedAt');

    // FR-14 — the created ticket must be owned by the session's linked requester.
    const created = await prisma.ticket.findUnique({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(created).not.toBeNull();
    expect(created!.requesterId).toBe(session.requesterId);
    expect(created!.relatedSystemId).toBe(printer!.id);
    // Lab-pure ownership: Owner is Unassigned (null), Requester is creator
    expect(res.body.ownerName).toBeNull();
    expect(res.body.owner).toBeNull();
    expect(res.body.requester).toEqual(expect.objectContaining({ id: session.requesterId, name: session.name }));
    expect(res.body.itPriority).toBeNull();
    expect(created!.ownerName).toBeNull();

    // Verify the owner appears as Unassigned in GET /api/tickets list
    const listRes = await withCookie(session, request(app).get('/api/tickets'));
    expect(listRes.status).toBe(200);
    const listed = listRes.body.data.find(
      (t: { ticketNumber: string }) => t.ticketNumber === res.body.ticketNumber,
    );
    expect(listed).toBeDefined();
    expect(listed.ownerName).toBeNull();
    expect(listed.owner).toBeNull();
  });

  it('AC-04: defaults to MEDIUM priority and NEW status with a related system', async () => {
    const session = await createSession({ label: 'ct-defaults', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Defaults ticket',
      categoryId: hardware!.id,
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(201);
    createdTicketNumbers.push(res.body.ticketNumber);
    expect(res.body.priority).toBe('MEDIUM');
    expect(res.body.status).toBe('NEW');
    expect(res.body.description).toBeNull();
    expect(res.body.relatedSystem).toEqual({
      id: printer!.id,
      name: 'Printer',
    });
  });

  it('owner is Unassigned for a second requester session', async () => {
    const session = await createSession({ label: 'ct-beta', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Beta owner probe',
      categoryId: hardware!.id,
      relatedSystemId: printer!.id,
    });
    expect(res.status).toBe(201);
    createdTicketNumbers.push(res.body.ticketNumber);
    expect(res.body.ownerName).toBeNull();
    expect(res.body.owner).toBeNull();
    expect(res.body.requester).toEqual(expect.objectContaining({ id: session.requesterId, name: session.name }));
    const listed = await withCookie(session, request(app).get('/api/tickets'));
    const found = listed.body.data.find(
      (t: { ticketNumber: string }) => t.ticketNumber === res.body.ticketNumber,
    );
    expect(found.ownerName).toBeNull();
    expect(found.owner).toBeNull();

    // Detail also carries Unassigned owner and correct requester
    const detail = await withCookie(session, request(app).get(`/api/tickets/${res.body.ticketNumber}`));
    expect(detail.status).toBe(200);
    expect(detail.body.ownerName).toBeNull();
    expect(detail.body.owner).toBeNull();
    expect(detail.body.requester).toEqual(expect.objectContaining({ id: session.requesterId, name: session.name }));
  });
});

describe('POST /api/tickets — validation failures 400 (API-05, API-06, API-24)', () => {
  it('API-05: rejects a blank title', async () => {
    const session = await createSession({ label: 'ct-blank', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: '   ',
      categoryId: hardware!.id,
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'title',
      message: 'Title is required',
    });
  });

  it('API-05: rejects a title longer than 120 characters', async () => {
    const session = await createSession({ label: 'ct-long', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'x'.repeat(121),
      categoryId: hardware!.id,
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'title',
      message: 'Title must be 120 characters or fewer',
    });
  });

  it('API-05: rejects a description longer than 4000 characters', async () => {
    const session = await createSession({ label: 'ct-longdesc', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Long description ticket',
      description: 'x'.repeat(4001),
      categoryId: hardware!.id,
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'description',
      message: 'Description must be 4000 characters or fewer',
    });
  });

  it('API-05: rejects a missing categoryId', async () => {
    const session = await createSession({ label: 'ct-nocat', withLinkedRequester: true });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(printer).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'No category ticket',
      relatedSystemId: printer!.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'categoryId',
      message: 'Category is required',
    });
  });

  it('API-24: rejects a missing relatedSystemId (required field)', async () => {
    const session = await createSession({ label: 'ct-nosys', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'No related system ticket',
      categoryId: hardware!.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'relatedSystemId',
      message: 'Related system is required',
    });
  });

  it('API-06: rejects a nonexistent categoryId', async () => {
    const session = await createSession({ label: 'ct-badcat', withLinkedRequester: true });
    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Bad category ticket',
      categoryId: 999999,
      relatedSystemId: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'categoryId',
      message: 'Category does not exist',
    });
  });

  it('API-06: rejects an invalid priority value', async () => {
    const session = await createSession({ label: 'ct-badprio', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Urgent ticket',
      categoryId: hardware!.id,
      relatedSystemId: 1,
      priority: 'URGENT',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'priority',
      message: 'Priority must be one of LOW, MEDIUM, HIGH, CRITICAL',
    });
  });

  it('API-24: rejects a nonexistent relatedSystemId', async () => {
    const session = await createSession({ label: 'ct-badsys', withLinkedRequester: true });
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await withWriteAuth(session, request(app).post('/api/tickets')).send({
      title: 'Bad related system ticket',
      categoryId: hardware!.id,
      relatedSystemId: 999999,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'relatedSystemId',
      message: 'Related system does not exist',
    });
  });
});

describe('POST /api/tickets — body parsing', () => {
  it('returns 400 Invalid JSON body for malformed JSON', async () => {
    const session = await createSession({ label: 'ct-badjson', withLinkedRequester: true });
    const res = await withWriteAuth(session, request(app).post('/api/tickets'))
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });
});
