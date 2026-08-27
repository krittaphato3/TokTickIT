import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

// API-01..API-06, API-23, API-24 — POST /api/tickets (create ticket).
// These tests read from and write to PostgreSQL through Prisma, so the
// database must be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate dev && npx prisma db seed

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

describe('POST /api/tickets — header validation (API-01..03)', () => {
  it('API-01: returns 400 when X-Dev-Requester-Id is missing', async () => {
    const res = await request(app).post('/api/tickets').send({
      title: 'Laptop will not boot after update',
      categoryId: 1,
      relatedSystemId: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing or invalid X-Dev-Requester-Id header',
    });
  });

  it('API-01: returns 400 when X-Dev-Requester-Id is malformed (non-integer)', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', 'abc')
      .send({
        title: 'Laptop will not boot after update',
        categoryId: 1,
        relatedSystemId: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing or invalid X-Dev-Requester-Id header',
    });
  });

  it('API-01: returns 400 for an out-of-range requester id (not 500)', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '123456789012345678901234567890')
      .send({
        title: 'Laptop will not boot after update',
        categoryId: 1,
        relatedSystemId: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing or invalid X-Dev-Requester-Id header',
    });
  });

  it('API-02: returns 401 for an unknown requester id', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '999999')
      .send({
        title: 'Laptop will not boot after update',
        categoryId: 1,
        relatedSystemId: 1,
      });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unknown development requester' });
  });

  it('API-03: returns 403 for an inactive requester', async () => {
    const epsilon = await prisma.requester.findUnique({
      where: { email: 'epsilon@toktickit.test' },
    });
    expect(epsilon).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', String(epsilon!.id))
      .send({
        title: 'Laptop will not boot after update',
        categoryId: 1,
        relatedSystemId: 1,
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Requester account is inactive' });
  });
});

describe('POST /api/tickets — happy path and defaults (API-04)', () => {
  it('API-04: creates a ticket with 201, echoed fields, and ownership', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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

    // FR-14 — the created ticket must be owned by the active requester (id 1).
    const created = await prisma.ticket.findUnique({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(created).not.toBeNull();
    expect(created!.requesterId).toBe(1);
    expect(created!.relatedSystemId).toBe(printer!.id);
    // Owner stamping (Lab 2 — owner defaults to creator)
    expect(res.body.ownerName).toBe('Dev User Alpha');
    expect(res.body.itPriority).toBeNull();
    expect(created!.ownerName).toBe('Dev User Alpha');

    // Verify the owner appears in GET /api/tickets list
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-Dev-Requester-Id', '1');
    expect(listRes.status).toBe(200);
    const listed = listRes.body.data.find(
      (t: { ticketNumber: string }) => t.ticketNumber === res.body.ticketNumber,
    );
    expect(listed).toBeDefined();
    expect(listed.ownerName).toBe('Dev User Alpha');
  });

  it('AC-04: defaults to MEDIUM priority and NEW status with a related system', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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

  it('owner is stamped from X-Dev-Requester-Id (Beta)', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '2')
      .send({
        title: 'Beta owner probe',
        categoryId: hardware!.id,
        relatedSystemId: printer!.id,
      });
    expect(res.status).toBe(201);
    createdTicketNumbers.push(res.body.ticketNumber);
    expect(res.body.ownerName).toBe('Dev User Beta');
    const listed = await request(app)
      .get('/api/tickets')
      .set('X-Dev-Requester-Id', '2');
    const found = listed.body.data.find(
      (t: { ticketNumber: string }) => t.ticketNumber === res.body.ticketNumber,
    );
    expect(found.ownerName).toBe('Dev User Beta');

    // Detail also carries owner
    const detail = await request(app)
      .get(`/api/tickets/${res.body.ticketNumber}`)
      .set('X-Dev-Requester-Id', '2');
    expect(detail.status).toBe(200);
    expect(detail.body.ownerName).toBe('Dev User Beta');
  });
});

describe('POST /api/tickets — validation failures 400 (API-05, API-06, API-24)', () => {
  it('API-05: rejects a blank title', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({ title: '   ', categoryId: hardware!.id, relatedSystemId: printer!.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'title',
      message: 'Title is required',
    });
  });

  it('API-05: rejects a title longer than 120 characters', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(hardware).not.toBeNull();
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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
    const printer = await prisma.relatedSystem.findUnique({
      where: { name: 'Printer' },
    });
    expect(printer).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({ title: 'No category ticket', relatedSystemId: printer!.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'categoryId',
      message: 'Category is required',
    });
  });

  it('API-24: rejects a missing relatedSystemId (required field)', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({ title: 'No related system ticket', categoryId: hardware!.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'relatedSystemId',
      message: 'Related system is required',
    });
  });

  it('API-06: rejects a nonexistent categoryId', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({ title: 'Bad category ticket', categoryId: 999999, relatedSystemId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContainEqual({
      field: 'categoryId',
      message: 'Category does not exist',
    });
  });

  it('API-06: rejects an invalid priority value', async () => {
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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
    const hardware = await prisma.category.findUnique({
      where: { name: 'Hardware' },
    });
    expect(hardware).not.toBeNull();

    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .send({
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
    const res = await request(app)
      .post('/api/tickets')
      .set('X-Dev-Requester-Id', '1')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });
});