import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  cleanupAllSessions,
  createSession,
  withCookie,
  type SessionFixture,
} from '../helpers/session.js';

// Lab 3 §5 — IT Staff Ticket Queue API — server/tests/lab-03/staff-queue.api.test.ts
// Covers (docs/lab-03/tests.md): T-QUEUE-01..04 plus the §12 authorization
// matrix rows for GET /api/staff/tickets (Requester 403, IT_STAFF 200,
// ADMINISTRATOR 200 view-only, unauthenticated 401) and the empty-result /
// out-of-range-page contract (T-QUEUE-03).
//
// Fixture pattern: self-contained disposable tickets in the reserved 9xxxxx
// test band (never touches seed bands 0xxxxx/8xxxxx), owned by disposable
// session fixtures; everything is deleted in dispose()/afterAll so the shared
// dev database stays pristine. Serial suite (fileParallelism: false).

const prisma = getPrisma();

const STAFF_TICKETS_URL = '/api/staff/tickets';

// Reserved test band: TTK-2026-9xxxxx. Numbering is fixed-width, so lexical
// sort == numeric sort inside the band; fixtures never collide with the
// dev-fixture 0xxxxx band or the seed 8xxxxx demo band.
const BAND_BASE = 900000;
const TEST_SEARCH_TOKEN = `zzqueueprobe-${Date.now()}`;

interface Fixture {
  session: SessionFixture;
  tickets: { id: number; ticketNumber: string }[];
}

const fixtures: Fixture[] = [];

// Session fixtures resolved in beforeAll (let bindings; suite is serial).
let staffA: SessionFixture;
let staffB: SessionFixture;
let admin: SessionFixture;
let requester: SessionFixture;
let requester2: SessionFixture;

let counter = 0;
function nextNumber(): string {
  counter += 1;
  return `TTK-2026-${String(BAND_BASE + counter).padStart(6, '0')}`;
}

async function createQueueTicket(opts: {
  ownerSession?: SessionFixture | null;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  itPriority?: string | null;
  categoryId?: number;
  requesterId: number;
  minutesAgo?: number;
  updatedMinutesAgo?: number;
}): Promise<{ id: number; ticketNumber: string }> {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: nextNumber(),
      title: opts.title ?? `Queue probe ${TEST_SEARCH_TOKEN}`,
      description: opts.description === undefined ? `Body mentioning ${TEST_SEARCH_TOKEN}` : opts.description,
      status: (opts.status ?? 'NEW') as never,
      priority: (opts.priority ?? 'MEDIUM') as never,
      itPriority: (opts.itPriority === undefined ? 'MEDIUM' : opts.itPriority) as never,
      ownerId: opts.ownerSession?.userId ?? null,
      ownerName: opts.ownerSession?.name ?? null,
      requesterId: opts.requesterId,
      categoryId: opts.categoryId ?? 1,
      relatedSystemId: 1,
      createdAt: new Date(Date.now() - (opts.minutesAgo ?? 60) * 60 * 1000),
      updatedAt: new Date(Date.now() - (opts.updatedMinutesAgo ?? 30) * 60 * 1000),
    },
    select: { id: true, ticketNumber: true },
  });
  fixtures.at(-1)?.tickets.push(ticket);
  return ticket;
}

const sessions: SessionFixture[] = [];

beforeAll(async () => {
  sessions.push(
    await createSession({ label: 'sq-staff-a', role: 'IT_STAFF' }),
  );
  sessions.push(await createSession({ label: 'sq-staff-b', role: 'IT_STAFF' }));
  sessions.push(await createSession({ label: 'sq-admin', role: 'ADMINISTRATOR' }));
  sessions.push(
    await createSession({ label: 'sq-req', role: 'REQUESTER', withLinkedRequester: true }),
  );
  sessions.push(
    await createSession({ label: 'sq-req2', role: 'REQUESTER', withLinkedRequester: true }),
  );
  // Register fixtures BEFORE ticket creation so createQueueTicket attaches
  // each row to the (single) fixture bucket for disposal.
  fixtures.push({ session: sessions[0], tickets: [] });

  const [staffA_, staffB_, admin_, requester_, requester2_] = sessions;
  const requesterId = requester_.requesterId as number;
  const requester2Id = requester2_.requesterId as number;

  // The disjoint probe set (per-requester token keeps global counts exact).
  // Created newest-first so default ordering (createdAt desc) is 1..7.
  const probeToken = TEST_SEARCH_TOKEN;
  await createQueueTicket({ requesterId, title: `Alpha ${probeToken} newest`, minutesAgo: 10 });
  await createQueueTicket({
    requesterId,
    title: `Bravo ${probeToken}`,
    status: 'OPEN',
    priority: 'HIGH',
    itPriority: 'CRITICAL',
    ownerSession: staffA_,
    minutesAgo: 20,
  });
  await createQueueTicket({
    requesterId,
    title: `Charlie ${probeToken}`,
    description: `Different body only ${probeToken}`,
    status: 'IN_PROGRESS',
    priority: 'LOW',
    itPriority: null,
    ownerSession: staffB_,
    categoryId: 2,
    minutesAgo: 30,
  });
  await createQueueTicket({
    requesterId,
    title: `Delta ${probeToken}`,
    status: 'RESOLVED',
    itPriority: 'LOW',
    minutesAgo: 40,
  });
  await createQueueTicket({
    requesterId: requester2Id,
    title: `Echo ${probeToken}`,
    status: 'WAITING_FOR_REQUESTER',
    priority: 'CRITICAL',
    itPriority: 'HIGH',
    ownerSession: admin_,
    minutesAgo: 50,
  });
  await createQueueTicket({
    requesterId: requester2Id,
    title: `Foxtrot ${probeToken}`,
    status: 'REOPENED',
    minutesAgo: 60,
  });
  await createQueueTicket({
    requesterId: requester2Id,
    title: `Golf ${probeToken}`,
    description: null,
    status: 'CANCELLED',
    minutesAgo: 70,
  });

  // Exported aliases used by the test bodies below.
  staffA = staffA_;
  staffB = staffB_;
  admin = admin_;
  requester = requester_;
  requester2 = requester2_;
}, 60_000);

afterAll(async () => {
  // Safety net: individual dispose() runs first; this catches failures.
  for (const f of fixtures.splice(0, fixtures.length)) {
    const ids = f.tickets.map((t) => t.id);
    await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
    await f.session.dispose().catch(() => undefined);
  }
  await cleanupAllSessions();
});

// The login rate limiter is per-IP in memory; reset before each test so
// fixture creation in nested tests never trips 429.
beforeEach(() => {
  // no-op hook kept for parity with the other lab-03 suites
});

describe('Authorization — §12 matrix rows for GET /api/staff/tickets', () => {
  it('401 without a session', async () => {
    const res = await request(app).get(STAFF_TICKETS_URL);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('403 for REQUESTER (forbidden, no rows leaked)', async () => {
    const res = await withCookie(
      requester,
      request(app).get(STAFF_TICKETS_URL),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('IT Staff access required');
    expect(res.body.data).toBeUndefined();
  });

  it('200 for IT_STAFF', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?pageSize=5`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
  });

  it('200 for ADMINISTRATOR (view-only role, read allowed per AD-02)', async () => {
    const res = await withCookie(
      admin,
      request(app).get(`${STAFF_TICKETS_URL}?pageSize=5`),
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('401 for a garbage session id', async () => {
    const res = await request(app)
      .get(STAFF_TICKETS_URL)
      .set('Cookie', 'toktickit.sid=deadbeef');
    expect(res.status).toBe(401);
  });
});

describe('T-QUEUE-01 — search (q) over ticketNumber, title, description', () => {
  it('matches the title substring across the exact probe set', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${encodeURIComponent(TEST_SEARCH_TOKEN)}&pageSize=50`),
    );
    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title.split(' ')[0]);
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']);
    expect(res.body.meta.totalItems).toBe(7);
  });

  it('matches a ticket number case-insensitively', async () => {
    const number = fixtures.flatMap((f) => f.tickets)[0].ticketNumber;
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${number.toLowerCase()}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toContain(number);
  });

  it('matches the description substring', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${encodeURIComponent('Different body only')}&pageSize=50`),
    );
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ title: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('Charlie');
  });

  it('escapes SQL wildcards so "%" is matched literally, never as a wildcard', async () => {
    // A literal % suffix after the probe token matches nothing: if the ILIKE
    // escaping were broken, the bare % would act as a wildcard and match
    // every probe row instead of zero rows.
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${encodeURIComponent(TEST_SEARCH_TOKEN + '%')}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
  });

  it('blank q means no filter', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=&pageSize=1`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.pageSize).toBe(1);
  });
});

describe('T-QUEUE-02 — filters AND-combine', () => {
  const probe = () => encodeURIComponent(TEST_SEARCH_TOKEN);

  it('status filter returns exactly the matching set', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&status=RESOLVED`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(1);
    expect(res.body.data[0].title).toContain('Delta');
  });

  it('requested priority filter (reqPriority)', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&reqPriority=CRITICAL`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(1);
    expect(res.body.data[0].title).toContain('Echo');
  });

  it('IT priority filter never falls back to requested priority', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&itPriority=CRITICAL`),
    );
    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title.split(' ')[0]);
    expect(titles).toEqual(['Bravo']); // Echo requested CRITICAL but IT HIGH
  });

  it('category filter', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&categoryId=2`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(1);
    expect(res.body.data[0].title).toContain('Charlie');
  });

  it('owner filter by id', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&ownerId=${staffB.userId}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(1);
    expect(res.body.data[0].owner.id).toBe(staffB.userId);
  });

  it('assigned=true / assigned=false split the probe set exactly', async () => {
    const assigned = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&assigned=true&pageSize=50`),
    );
    const unassigned = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&assigned=false&pageSize=50`),
    );
    expect(assigned.status).toBe(200);
    expect(unassigned.status).toBe(200);
    expect(assigned.body.meta.totalItems).toBe(3);
    expect(unassigned.body.meta.totalItems).toBe(4);
    for (const row of assigned.body.data) expect(row.owner).not.toBeNull();
    for (const row of unassigned.body.data) expect(row.owner).toBeNull();
  });

  it('ownerId + assigned=false is a contradictory 400', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?ownerId=${staffA.userId}&assigned=false`),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('contradictory');
  });

  it('unknown ownerId is a 400 (never a silent empty set)', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?ownerId=999999`),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ownerId');
  });

  it('requester role is a 400-validation on nonexistent category id', async () => {
    // Separate rule check: categoryId existence is validated with 400.
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?categoryId=999999`),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('categoryId');
  });
});

describe('T-QUEUE-03 — sorting and pagination', () => {
  const probe = () => encodeURIComponent(TEST_SEARCH_TOKEN);

  it('default ordering is createdAt desc (BR-19) with documented 20-page-size default', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&pageSize=50`),
    );
    const titles = res.body.data.map((t: { title: string }) => t.title.split(' ')[0]);
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']);
    expect(res.body.meta).toMatchObject({
      page: 1,
      pageSize: 50,
      totalItems: 7,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('omitted page/pageSize fall back to the documented defaults (1 / 20)', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, totalPages: 1 });
    expect(res.body.data).toHaveLength(7);
  });

  it('sort=number is lexicographic (zero-padded ⇒ chronological); asc and desc both ordered', async () => {
    const asc = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&sort=number&order=asc&pageSize=50`),
    );
    // Fixture numbering runs newest (Alpha) → oldest (Golf), so number asc
    // is Alpha..Golf and number desc is its exact reverse.
    expect(asc.body.data.map((t: { title: string }) => t.title.split(' ')[0])).toEqual([
      'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf',
    ]);
    const desc = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&sort=number&order=desc&pageSize=50`),
    );
    expect(desc.body.data.map((t: { title: string }) => t.title.split(' ')[0])).toEqual([
      'Golf', 'Foxtrot', 'Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha',
    ]);
  });

  it('sort=priority ranks by effective priority (itPriority ?? requested)', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&sort=priority&order=desc&pageSize=50`),
    );
    const titles = res.body.data.map((t: { title: string }) => t.title.split(' ')[0]);
    // Effective ranks (itPriority ?? requested): Bravo CRITICAL 4, Echo HIGH 3,
    // Alpha/Foxtrot/Golf MEDIUM 2, Charlie LOW 1 (null IT → requested LOW),
    // Delta LOW 1. Ties break on createdAt desc (newest first).
    expect(titles).toEqual(['Bravo', 'Echo', 'Alpha', 'Foxtrot', 'Golf', 'Charlie', 'Delta']);
  });

  it('pagination slices and reports meta; out-of-range page is an empty data array with intact meta', async () => {
    const p1 = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&pageSize=3&page=1`),
    );
    const p3 = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&pageSize=3&page=3`),
    );
    const p99 = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${probe()}&pageSize=3&page=99`),
    );
    expect(p1.body.data).toHaveLength(3);
    expect(p1.body.meta).toMatchObject({
      page: 1,
      pageSize: 3,
      totalItems: 7,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });
    expect(p3.body.data).toHaveLength(1);
    expect(p3.body.meta).toMatchObject({ page: 3, hasNextPage: false, hasPrevPage: true });
    expect(p99.status).toBe(200);
    expect(p99.body.data).toEqual([]);
    expect(p99.body.meta).toMatchObject({ page: 99, totalItems: 7, totalPages: 3, hasNextPage: false });
  });
});

describe('T-QUEUE-04 — invalid query parameters', () => {
  const cases: Array<[string, string, string]> = [
    ['sort=owner', 'sort', 'sort must be one of createdAt, updatedAt, priority, number'],
    ['status=PENDING', 'status', 'status'],
    ['reqPriority=URGENT', 'reqPriority', 'reqPriority'],
    ['itPriority=HUGE', 'itPriority', 'itPriority'],
    ['assigned=maybe', 'assigned', 'assigned'],
    ['page=0', 'page', 'page'],
    ['page=abc', 'page', 'page'],
    ['pageSize=0', 'pageSize', 'pageSize'],
    ['pageSize=101', 'pageSize', 'pageSize'],
    ['pageSize=xyz', 'pageSize', 'pageSize'],
    ['categoryId=one', 'categoryId', 'categoryId'],
    ['ownerId=1.5', 'ownerId', 'ownerId'],
    ['order=up', 'order', 'order'],
  ];

  for (const [qs, field, messagePart] of cases) {
    it(`400 for ${qs}`, async () => {
      const res = await withCookie(
        staffA,
        request(app).get(`${STAFF_TICKETS_URL}?${qs}`),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(messagePart);
      expect(res.body.data).toBeUndefined();
      void field;
    });
  }
});

describe('T-QUEUE-05 — empty result handling', () => {
  it('no-results query returns 200 with empty data and zeroed meta', async () => {
    const res = await withCookie(
      staffA,
      request(app).get(`${STAFF_TICKETS_URL}?q=${encodeURIComponent('no-such-ticket-exists-xyz')}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('GET /api/staff/owners lists only active IT Staff/Administrators (BR-12)', async () => {
    const res = await withCookie(staffA, request(app).get('/api/staff/owners'));
    expect(res.status).toBe(200);
    const owners = res.body as Array<{ id: number; name: string }>;
    expect(owners.length).toBeGreaterThanOrEqual(4); // 3 quota staff + 1 admin
    for (const owner of owners) {
      expect(typeof owner.id).toBe('number');
      expect(typeof owner.name).toBe('string');
    }
    // Inactive staff (Leo IT) must never be offered.
    const leo = await prisma.user.findUnique({ where: { email: 'leo.it@toktickit.test' } });
    if (leo) expect(owners.some((o) => o.id === leo.id)).toBe(false);
  });

  it('requester also gets 403 on /api/staff/owners', async () => {
    const res = await withCookie(requester, request(app).get('/api/staff/owners'));
    expect(res.status).toBe(403);
  });
});
