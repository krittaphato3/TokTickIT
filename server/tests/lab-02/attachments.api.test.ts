import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  withWriteAuth,
  type SessionFixture,
} from '../helpers/session.js';

// Attachments API (API-13..18).
// Lab 3 port: identity comes from an authenticated session instead of the
// retired X-Dev-Requester-Id header (BR-03). Lab 2 assertions are preserved
// except where Lab 3 hardens ownership into a masked 404 (api-spec §1.5).
// These tests read from and write to PostgreSQL through Prisma, so the
// database must be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate deploy && npx prisma db seed

const prisma = getPrisma();
let createdTicketIds: number[] = [];
let createdAttachIds: number[] = [];

afterEach(async () => {
  if (createdAttachIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { id: { in: createdAttachIds } } });
    createdAttachIds = [];
  }
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    createdTicketIds = [];
  }
  // clean uploads created by valid upload test
  const dir = path.join(process.cwd(), 'uploads');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('test-clean') || f.startsWith('stored-')) fs.unlinkSync(path.join(dir, f));
    }
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
  const ticketNumber = `TTK-${new Date().getFullYear()}-${String(seq[0].nextval).padStart(6, '0')}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      title: 'Attachment probe',
      priority: 'MEDIUM',
      ownerName: null,
      requesterId,
      categoryId: cat.id,
      relatedSystemId: sys.id,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

// A session fixture with a linked requester id — createOwnedTicket targets it.
let ownerSession: SessionFixture;
let otherSession: SessionFixture;

beforeAll(async () => {
  ownerSession = await createSession({ label: 'att-owner', withLinkedRequester: true });
  otherSession = await createSession({ label: 'att-other', withLinkedRequester: true });
});

describe('Attachments API (API-13..18)', () => {
  it('API-13: valid 1KB PNG upload 201, file stored, metadata matches', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.alloc(1024, 0x89);
    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', buf, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe('photo.png');
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.sizeBytes).toBe(1024);
    createdAttachIds.push(res.body.id);
    const row = await prisma.attachment.findUnique({ where: { id: res.body.id } });
    expect(row).not.toBeNull();
    expect(row!.storedName).not.toBe('photo.png');
    // file exists
    const full = path.join(process.cwd(), 'uploads', row!.storedName);
    expect(fs.existsSync(full)).toBe(true);
    const stored = fs.readFileSync(full);
    expect(stored.equals(buf)).toBe(true);
  });

  it('API-13: unauthenticated upload returns 401', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .attach('file', Buffer.from([1]), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('API-14: >5MB returns 413 and persists nothing', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);
    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', big, { filename: 'huge.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    const count = await prisma.attachment.count({ where: { ticketId: ticket.id } });
    expect(count).toBe(0);
  });

  it('API-15: disallowed type (.exe/.svg) returns 415 and persists nothing', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('MZ');
    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', buf, { filename: 'bad.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(415);
    const count = await prisma.attachment.count({ where: { ticketId: ticket.id } });
    expect(count).toBe(0);

    const res2 = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', Buffer.from('<svg/>'), { filename: 'bad.svg', contentType: 'image/svg+xml' });
    expect(res2.status).toBe(415);
  });

  it('API-16: 6th upload onto ticket with 5 active returns 400 limit', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    for (let i = 0; i < 5; i++) {
      const r = await prisma.attachment.create({
        data: { ticketId: ticket.id, fileName: `f${i}.png`, storedName: `stored-limit-${Date.now()}-${i}-${Math.random()}`, mimeType: 'image/png', sizeBytes: 10 },
      });
      createdAttachIds.push(r.id);
    }
    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', Buffer.from([1, 2, 3]), { filename: 'sixth.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/i);
  });

  it('API-17: soft-remove sets removedAt; download after remove 404; re-remove 404; DB row persists', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from([1, 2, 3, 4]);
    const up = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', buf, { filename: 'toremove.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    createdAttachIds.push(up.body.id);

    const del = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    );
    expect(del.status).toBe(200);
    expect(del.body.removedAt).toBeTruthy();

    const dl = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/download`),
    );
    expect(dl.status).toBe(404);
    expect(dl.body.error).toMatch(/removed/i);

    const reDel = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    );
    expect(reDel.status).toBe(404);
    expect(reDel.body.error).toMatch(/already.*removed/i);

    const row = await prisma.attachment.findUnique({ where: { id: up.body.id } });
    expect(row).not.toBeNull();
    expect(row!.removedAt).not.toBeNull();
  });

  it('API-18: download byte-identical with correct headers; cross-requester masked 404', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('hello world bytes');
    const up = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).attach('file', buf, { filename: 'hello.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    createdAttachIds.push(up.body.id);

    const dl = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/download`),
    );
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toMatch(/image\/png/);
    expect(dl.headers['content-disposition']).toMatch(/hello\.png/);
    expect(Buffer.compare(dl.body, buf)).toBe(0);

    // Lab 3 (api-spec §1.5): cross-owner access is a masked 404 so requester B
    // cannot probe requester A's ticket numbers. No existence is leaked.
    const cross = await withCookie(
      otherSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/download`),
    );
    expect(cross.status).toBe(404);
    expect(cross.body.error).toMatch(/not found/i);
    expect(cross.body.fileName).toBeUndefined();
  });

  it('upload missing file part returns 400', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments`),
    ).field('notfile', 'x');
    expect(res.status).toBe(400);
  });

  it('malformed attachment id returns 400', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const res = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/attachments/abc/download`),
    );
    expect(res.status).toBe(400);
  });
});
