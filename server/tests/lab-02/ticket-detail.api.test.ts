import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  type SessionFixture,
} from '../helpers/session.js';

// GET /api/tickets/:ticketNumber — ticket detail (API-12, API-19, API-25).
// Lab 3 port: identity comes from an authenticated session instead of the
// retired X-Dev-Requester-Id header (BR-03). Lab 2 assertions are preserved
// except where Lab 3 hardens ownership into a masked 404 (api-spec §1.5),
// which makes absent and cross-owner tickets indistinguishable.
// These tests read from and write to PostgreSQL through Prisma, so the
// database must be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate deploy && npx prisma db seed

const prisma = getPrisma();
let createdTicketIds: number[] = [];

afterEach(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    createdTicketIds = [];
  }
});

afterAll(async () => {
  await cleanupAllSessions();
});

async function createOwnedTicket(requesterId: number) {
  const cat = await prisma.category.findFirstOrThrow();
  const sys = await prisma.relatedSystem.findFirstOrThrow();
  await prisma.requester.findUniqueOrThrow({ where: { id: requesterId } });
  const seq = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq')`;
  const n = seq[0].nextval;
  const ticketNumber = `TTK-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      title: 'Detail probe ticket',
      description: 'Detailed description here',
      priority: 'HIGH',
      ownerName: null,
      requesterId,
      categoryId: cat.id,
      relatedSystemId: sys.id,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

let ownerSession: SessionFixture;
let otherSession: SessionFixture;

beforeAll(async () => {
  ownerSession = await createSession({ label: 'det-owner', withLinkedRequester: true });
  otherSession = await createSession({ label: 'det-other', withLinkedRequester: true });
});

describe('GET /api/tickets/:ticketNumber — ticket detail (API-12, API-19, API-25)', () => {
  it('API-12: unauthenticated detail returns 401', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await request(app).get(`/api/tickets/${ticket.ticketNumber}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('API-12: owned detail returns 200 with requester + active attachments', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        fileName: 'shot.png',
        storedName: `stored-${Date.now()}-1`,
        mimeType: 'image/png',
        sizeBytes: png.length,
      },
    });

    const res = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}`),
    );

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(ticket.ticketNumber);
    expect(res.body.requester).toMatchObject({ id: ownerSession.requesterId, name: ownerSession.name });
    expect(res.body.relatedSystem).toBeDefined();
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0]).toMatchObject({ fileName: 'shot.png', mimeType: 'image/png' });
  });

  it('API-19: detail returns soft-removed attachments with removedAt set (Lab 2 soft-remove display)', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const a1 = await prisma.attachment.create({
      data: { ticketId: ticket.id, fileName: 'keep.png', storedName: `stored-${Date.now()}-keep`, mimeType: 'image/png', sizeBytes: 10, removedAt: null },
    });
    const a2 = await prisma.attachment.create({
      data: { ticketId: ticket.id, fileName: 'gone.png', storedName: `stored-${Date.now()}-gone`, mimeType: 'image/png', sizeBytes: 10, removedAt: new Date() },
    });
    void a1;
    void a2;
    const res = await withCookie(ownerSession, request(app).get(`/api/tickets/${ticket.ticketNumber}`));
    expect(res.status).toBe(200);
    // Lab 2 soft-remove is display-preserving: the E2E journey asserts the
    // "Removed" chip AFTER a page reload, so the detail payload must include
    // removed rows (with removedAt set) — never silently dropping them.
    // Active-attachment limits still count only rows with removedAt: null.
    const names = res.body.attachments.map((a: any) => a.fileName);
    expect(names).toContain('keep.png');
    expect(names).toContain('gone.png');
    const gone = res.body.attachments.find((a: any) => a.fileName === 'gone.png');
    expect(gone.removedAt).toBeTruthy();
    const keep = res.body.attachments.find((a: any) => a.fileName === 'keep.png');
    expect(keep.removedAt).toBeNull();
  });

  it('API-12: other owner gets masked 404 with no data leak', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await withCookie(otherSession, request(app).get(`/api/tickets/${ticket.ticketNumber}`));
    // Lab 3 (api-spec §1.5): absent and cross-owner are indistinguishable so
    // requester B cannot probe requester A's ticket numbers. No 403 here.
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(res.body.title).toBeUndefined();
    expect(res.body.description).toBeUndefined();
  });

  it('API-12: nonexistent ticket returns 404', async () => {
    const res = await withCookie(ownerSession, request(app).get('/api/tickets/TTK-2026-999999'));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('API-12: malformed ticket number returns 400', async () => {
    const res = await withCookie(ownerSession, request(app).get('/api/tickets/BAD-123'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid ticket number format/i);
  });

  it('API-25: detail includes relatedSystem', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await withCookie(ownerSession, request(app).get(`/api/tickets/${ticket.ticketNumber}`));
    expect(res.status).toBe(200);
    expect(res.body.relatedSystem).toBeDefined();
    expect(res.body.relatedSystem.id).toBeDefined();
  });
});
