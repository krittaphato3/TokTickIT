import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

// API-07..API-11, API-20 — GET /api/tickets (paginated list of my tickets).
// These tests read from and write to PostgreSQL through Prisma, so the
// database must be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate dev && npx prisma db seed

const prisma = getPrisma();

const ALPHA_ID = 1;
const BETA_ID = 2;

// Tickets created by the fixtures are tracked so the suite removes them from
// the shared seeded database after itself.
let createdTicketIds: number[] = [];

// Fixture ticket numbers live in a reserved 9xxxxx band of the TTK space so
// they can never collide with the dedicated ticket_number_seq values.
let fixtureSeq = 900000 + Math.floor(Math.random() * 100000);

function nextFixtureTicketNumber(): string {
  fixtureSeq += 1;
  return `TTK-${new Date().getFullYear()}-${String(fixtureSeq).padStart(6, '0')}`;
}

async function seedTicket(opts: {
  requesterId: number;
  title: string;
  description?: string;
  categoryId: number;
  relatedSystemId: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  secondsAgo?: number;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: nextFixtureTicketNumber(),
      title: opts.title,
      description: opts.description ?? null,
      priority: opts.priority ?? 'MEDIUM',
      requesterId: opts.requesterId,
      categoryId: opts.categoryId,
      relatedSystemId: opts.relatedSystemId,
      ...(opts.secondsAgo === undefined
        ? {}
        : { createdAt: new Date(Date.now() - opts.secondsAgo * 1000) }),
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

async function cleanupCreatedTickets() {
  if (createdTicketIds.length === 0) return;
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  createdTicketIds = [];
}

async function categoryIdOf(name: string): Promise<number> {
  const category = await prisma.category.findUniqueOrThrow({ where: { name } });
  return category.id;
}

async function systemIdOf(name: string): Promise<number> {
  const system = await prisma.relatedSystem.findUniqueOrThrow({
    where: { name },
  });
  return system.id;
}

function getList(query = '', requesterId: number = ALPHA_ID) {
  return request(app)
    .get(`/api/tickets${query}`)
    .set('X-Dev-Requester-Id', String(requesterId));
}

// Fixture ticket numbers live exclusively in the reserved 9xxxxx band, so a
// file-level sweep removes anything an interrupted run (crash, Ctrl+C) left
// behind without touching sequence-numbered tickets from other suites or
// seed data. Live runs already clean up after themselves via afterEach.
beforeAll(async () => {
  await prisma.ticket.deleteMany({
    where: { ticketNumber: { startsWith: `TTK-${new Date().getFullYear()}-9` } },
  });
});

function titlesOf(body: { data: { title: string }[] }): string[] {
  return body.data.map((t) => t.title);
}

describe('GET /api/tickets — ownership isolation (API-07)', () => {
  afterEach(cleanupCreatedTickets);

  it('returns only the active requester\'s tickets and totalItems counts only theirs', async () => {
    const hardware = await categoryIdOf('Hardware');
    const software = await categoryIdOf('Software');
    const printer = await systemIdOf('Printer');
    const email = await systemIdOf('Email Server');

    await seedTicket({ requesterId: ALPHA_ID, title: 'Alpha printer jam', categoryId: hardware, relatedSystemId: printer });
    await seedTicket({ requesterId: ALPHA_ID, title: 'Alpha laptop overheating', categoryId: hardware, relatedSystemId: printer });
    await seedTicket({ requesterId: ALPHA_ID, title: 'Alpha IDE crash', categoryId: software, relatedSystemId: email });
    await seedTicket({ requesterId: BETA_ID, title: 'Beta VPN drop', categoryId: software, relatedSystemId: email });
    await seedTicket({ requesterId: BETA_ID, title: 'Beta Wi-Fi outage', categoryId: software, relatedSystemId: email });

    const alphaRes = await getList('');
    expect(alphaRes.status).toBe(200);
    expect(alphaRes.body.data).toHaveLength(3);
    for (const title of titlesOf(alphaRes.body)) {
      expect(title.startsWith('Alpha')).toBe(true);
    }
    expect(alphaRes.body.meta.totalItems).toBe(3);

    const betaRes = await getList('', BETA_ID);
    expect(betaRes.status).toBe(200);
    expect(titlesOf(betaRes.body).sort()).toEqual([
      'Beta VPN drop',
      'Beta Wi-Fi outage',
    ]);
    expect(betaRes.body.meta.totalItems).toBe(2);
  });

  it('returns the documented list-row shape and default pagination meta', async () => {
    const hardware = await categoryIdOf('Hardware');
    const printer = await systemIdOf('Printer');
    const seeded = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Shape probe ticket',
      categoryId: hardware,
      relatedSystemId: printer,
    });

    const res = await getList('');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: seeded.id,
      ticketNumber: expect.stringMatching(/^TTK-\d{4}-\d{6}$/),
      title: 'Shape probe ticket',
      description: null,
      status: 'NEW',
      priority: 'MEDIUM',
      category: { id: hardware, name: 'Hardware' },
      relatedSystem: { id: printer, name: 'Printer' },
    });
    expect(res.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('enforces the same header contract as every /api/tickets endpoint (400/401/403)', async () => {
    const missing = await request(app).get('/api/tickets');
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      error: 'Missing or invalid X-Dev-Requester-Id header',
    });

    const unknown = await getList('', 999999);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual({ error: 'Unknown development requester' });

    const epsilon = await prisma.requester.findUniqueOrThrow({
      where: { email: 'epsilon@toktickit.test' },
    });
    const inactive = await getList('', epsilon.id);
    expect(inactive.status).toBe(403);
    expect(inactive.body).toEqual({ error: 'Requester account is inactive' });
  });
});

describe('GET /api/tickets — search (API-08)', () => {
  afterEach(cleanupCreatedTickets);

  async function seedSearchFixtures() {
    const hardware = await categoryIdOf('Hardware');
    const printer = await systemIdOf('Printer');
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Printer jams on floor 3',
      description: 'Paper tray is broken',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 30,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'VPN drops every hour',
      description: 'A stable network connection is needed',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 20,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Email quota exceeded',
      description: 'Cannot send messages',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 10,
    });
  }

  it('matches case-insensitively against the title', async () => {
    await seedSearchFixtures();
    const res = await getList('?search=printer');
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['Printer jams on floor 3']);
    expect(res.body.meta.totalItems).toBe(1);
  });

  it('matches case-insensitively against the description too', async () => {
    await seedSearchFixtures();
    const res = await getList('?search=NETWORK');
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['VPN drops every hour']);
  });

  it('an empty or whitespace-only search returns every ticket for the requester', async () => {
    await seedSearchFixtures();
    const empty = await getList('?search=');
    expect(empty.status).toBe(200);
    expect(empty.body.meta.totalItems).toBe(3);

    const blank = await getList('?search=%20%20%20');
    expect(blank.status).toBe(200);
    expect(blank.body.meta.totalItems).toBe(3);
  });

  it('pagination applies to the matched subset starting at page 1', async () => {
    await seedSearchFixtures();
    // Every fixture contains the letter "o" in its title or description.
    const res = await getList('?search=o&page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.totalItems).toBe(3);
    expect(res.body.meta.totalPages).toBe(2);
    expect(res.body.meta.hasNextPage).toBe(true);
  });

  it('no-results searches return an empty data array with zero totals', async () => {
    await seedSearchFixtures();
    const res = await getList('?search=zzz-no-match');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
    expect(res.body.meta.hasNextPage).toBe(false);
  });

  it('treats SQL wildcards (% _ \\) as literal characters consistently in rows and counts', async () => {
    const hardware = await categoryIdOf('Hardware');
    const printer = await systemIdOf('Printer');
    // Only these two contain a literal "%" / "_" character.
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Save at 50%',
      description: 'path C:\\temp',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 30,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'under_score keys',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 20,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'plain keyboard broken',
      description: 'no wildcard characters here',
      categoryId: hardware,
      relatedSystemId: printer,
      secondsAgo: 10,
    });

    // If "%" leaked into ILIKE as a wildcard it would match all three
    // fixtures; escaped, it matches only the literal percent titles.
    // .query() percent-encodes values, so "50%" arrives as the three
    // characters 5, 0, % at the handler.
    const percent = await getList('').query({ search: '50%' });
    expect(percent.status).toBe(200);
    expect(titlesOf(percent.body)).toEqual(['Save at 50%']);
    // BR-07/BR-10: the count must agree with the returned rows even when the
    // term contains wildcard characters.
    expect(percent.body.meta.totalItems).toBe(
      percent.body.data.length,
    );

    const underscore = await getList('').query({ search: 'under_score' });
    expect(underscore.status).toBe(200);
    expect(titlesOf(underscore.body)).toEqual(['under_score keys']);
    expect(underscore.body.meta.totalItems).toBe(1);

    const backslash = await getList('').query({ search: 'C:\\temp' });
    expect(backslash.status).toBe(200);
    expect(titlesOf(backslash.body)).toEqual(['Save at 50%']);

    // A term consisting of a bare wildcard character is the sharpest case:
    // unescaped it acts as a match-everything pattern, so the row set and
    // the count diverge if either path forgets to escape.
    const barePercent = await getList('').query({ search: '%' });
    expect(barePercent.status).toBe(200);
    expect(barePercent.body.data).toHaveLength(1);
    expect(barePercent.body.meta.totalItems).toBe(1);

    const bareUnderscore = await getList('').query({ search: '_' });
    expect(bareUnderscore.status).toBe(200);
    expect(bareUnderscore.body.data).toHaveLength(1);
    expect(bareUnderscore.body.meta.totalItems).toBe(1);
  });
});

describe('GET /api/tickets — category/priority filters combine with AND (API-09)', () => {
  afterEach(cleanupCreatedTickets);

  async function seedFilterFixtures() {
    const hardware = await categoryIdOf('Hardware');
    const software = await categoryIdOf('Software');
    const printer = await systemIdOf('Printer');
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Laptop overheating',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'HIGH',
      secondsAgo: 30,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Mouse cable frayed',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'LOW',
      secondsAgo: 20,
    });
    await seedTicket({
      requesterId: ALPHA_ID,
      title: 'IDE crashes on build',
      categoryId: software,
      relatedSystemId: printer,
      priority: 'HIGH',
      secondsAgo: 10,
    });
  }

  it('returns only tickets matching both categoryId and priority', async () => {
    await seedFilterFixtures();
    const hardware = await categoryIdOf('Hardware');
    const res = await getList(`?categoryId=${hardware}&priority=HIGH`);
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['Laptop overheating']);
    expect(res.body.meta.totalItems).toBe(1);
  });

  it('each filter on its own returns the corresponding superset', async () => {
    await seedFilterFixtures();
    const hardware = await categoryIdOf('Hardware');
    const categoryOnly = await getList(`?categoryId=${hardware}`);
    expect(categoryOnly.body.meta.totalItems).toBe(2);

    const priorityOnly = await getList('?priority=HIGH');
    expect(priorityOnly.body.meta.totalItems).toBe(2);
  });

  it('rejects an invalid priority filter value with 400', async () => {
    await seedFilterFixtures();
    const res = await getList('?priority=URGENT');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'priority must be one of LOW, MEDIUM, HIGH, CRITICAL',
    });
  });
});

describe('GET /api/tickets — sorting (API-10)', () => {
  afterEach(cleanupCreatedTickets);

  // Ordered oldest → newest: zebra, apple, mangoOld, cherry, mangoNew.
  async function seedSortFixtures() {
    const hardware = await categoryIdOf('Hardware');
    const printer = await systemIdOf('Printer');
    const zebra = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Zebra enclosure error',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'LOW',
      secondsAgo: 50,
    });
    const apple = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Apple login issue',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'MEDIUM',
      secondsAgo: 40,
    });
    const mangoOld = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Mango printer offline',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'HIGH',
      secondsAgo: 30,
    });
    const cherry = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Cherry vpn tunnel down',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'CRITICAL',
      secondsAgo: 20,
    });
    const mangoNew = await seedTicket({
      requesterId: ALPHA_ID,
      title: 'Mango backup stuck',
      categoryId: hardware,
      relatedSystemId: printer,
      priority: 'HIGH',
      secondsAgo: 10,
    });
    return { zebra, apple, mangoOld, cherry, mangoNew };
  }

  it('defaults to createdAt desc (newest first)', async () => {
    const { zebra, apple, mangoOld, cherry, mangoNew } = await seedSortFixtures();
    const res = await getList('');
    expect(res.status).toBe(200);
    // Newest first: mangoNew (10s ago) leads, cherry (20s) follows.
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      mangoNew.ticketNumber,
      cherry.ticketNumber,
      mangoOld.ticketNumber,
      apple.ticketNumber,
      zebra.ticketNumber,
    ]);
  });

  it('sorts by title asc and desc', async () => {
    const { zebra, apple, mangoOld, cherry, mangoNew } = await seedSortFixtures();
    const asc = await getList('?sortBy=title&sortDir=asc');
    expect(asc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      apple.ticketNumber,
      cherry.ticketNumber,
      mangoNew.ticketNumber,
      mangoOld.ticketNumber,
      zebra.ticketNumber,
    ]);

    const desc = await getList('?sortBy=title&sortDir=desc');
    expect(desc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      zebra.ticketNumber,
      mangoOld.ticketNumber,
      mangoNew.ticketNumber,
      cherry.ticketNumber,
      apple.ticketNumber,
    ]);
  });

  it('sorts by priority rank (Critical > High > Medium > Low) with createdAt desc as tie-break', async () => {
    const { zebra, apple, mangoOld, cherry, mangoNew } = await seedSortFixtures();
    const desc = await getList('?sortBy=priority&sortDir=desc');
    expect(desc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      cherry.ticketNumber,
      mangoNew.ticketNumber,
      mangoOld.ticketNumber,
      apple.ticketNumber,
      zebra.ticketNumber,
    ]);

    const asc = await getList('?sortBy=priority&sortDir=asc');
    // Ties break by createdAt desc even in ascending rank order, so the two
    // HIGH tickets keep mangoNew ahead of mangoOld.
    expect(asc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      zebra.ticketNumber,
      apple.ticketNumber,
      mangoNew.ticketNumber,
      mangoOld.ticketNumber,
      cherry.ticketNumber,
    ]);
  });

  it('rejects an invalid sortBy with 400', async () => {
    await seedSortFixtures();
    const res = await getList('?sortBy=banana');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'sortBy must be one of createdAt, updatedAt, title, priority',
    });
  });

  it('rejects an invalid sortDir with 400', async () => {
    await seedSortFixtures();
    const res = await getList('?sortDir=sideways');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'sortDir must be asc or desc' });
  });
});

describe('GET /api/tickets — pagination (API-11)', () => {
  // 25 tickets, ordered newest → oldest, created once for this describe and
  // removed afterwards.
  let orderedNumbers: string[] = [];

  beforeAll(async () => {
    const hardware = await categoryIdOf('Hardware');
    const printer = await systemIdOf('Printer');
    orderedNumbers = [];
    for (let i = 0; i < 25; i += 1) {
      const ticket = await seedTicket({
        requesterId: ALPHA_ID,
        title: `Bulk ticket ${String(i).padStart(2, '0')}`,
        categoryId: hardware,
        relatedSystemId: printer,
        secondsAgo: 10000 - i * 10,
      });
      orderedNumbers.unshift(ticket.ticketNumber);
    }
  });

  afterAll(cleanupCreatedTickets);

  it('serves page 2 with the default pageSize of 10 and correct meta', async () => {
    const res = await getList('?page=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    expect(res.body.data[0].ticketNumber).toBe(orderedNumbers[10]);
    expect(res.body.data[9].ticketNumber).toBe(orderedNumbers[19]);
  });

  it('the final partial page reports hasNextPage=false', async () => {
    const res = await getList('?page=3');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].ticketNumber).toBe(orderedNumbers[20]);
    expect(res.body.meta.hasNextPage).toBe(false);
    expect(res.body.meta.hasPrevPage).toBe(true);
  });

  it('rejects page=0 and non-integer pages with 400', async () => {
    const zero = await getList('?page=0');
    expect(zero.status).toBe(400);
    expect(zero.body).toEqual({ error: 'page must be an integer >= 1' });

    const notANumber = await getList('?page=abc');
    expect(notANumber.status).toBe(400);
    expect(notANumber.body.error).toBe('page must be an integer >= 1');
  });

  it('rejects pageSize outside 1-50 with 400', async () => {
    const oversized = await getList('?pageSize=51');
    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({ error: 'pageSize must be between 1 and 50' });

    const zero = await getList('?pageSize=0');
    expect(zero.status).toBe(400);
    expect(zero.body.error).toBe('pageSize must be between 1 and 50');
  });

  it('rejects a categoryId that references no existing category with 400', async () => {
    const res = await getList('?categoryId=999999');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'categoryId does not reference an existing category',
    });
  });
});

describe('GET /api/tickets — safe unexpected-error behavior (API-20)', () => {
  it('returns a generic 500 envelope with no stack trace or internal details on simulated DB failure', async () => {
    const simulatedFailure = new Error(
      'SIMULATED_DB_FAILURE: could not connect to server',
    );
    const spy = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValue(simulatedFailure);

    try {
      const res = await getList('');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: 'An unexpected error occurred. Please try again.',
      });
      expect(res.text).not.toContain('SIMULATED_DB_FAILURE');
      expect(res.text).not.toMatch(/\bat .*\(/);
    } finally {
      spy.mockRestore();
    }
  });
});
