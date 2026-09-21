import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import {
  createSession,
  cleanupAllSessions,
  withCookie,
  withWriteAuth,
  type SessionFixture,
} from '../helpers/session.js';

// Attachment audit ledger: SHA-256 on upload, REMOVE with reason, RESTORE,
// DOWNLOAD audit, and the newest-first events endpoint.
// Requires PostgreSQL migrated (incl. attachment_audit) and seeded:
//   docker compose up -d
//   cd server && npx prisma migrate deploy && npx prisma db seed

const prisma = getPrisma();
let createdTicketIds: number[] = [];
let createdAttachIds: number[] = [];

afterEach(async () => {
  if (createdAttachIds.length > 0) {
    const rows = await prisma.attachment.findMany({
      where: { id: { in: createdAttachIds } },
      select: { storedName: true },
    });
    const dir = path.join(process.cwd(), 'uploads');
    for (const r of rows) {
      try { fs.unlinkSync(path.join(dir, r.storedName)); } catch {}
    }
    await prisma.attachmentEvent.deleteMany({ where: { attachmentId: { in: createdAttachIds } } });
    await prisma.attachment.deleteMany({ where: { id: { in: createdAttachIds } } });
    createdAttachIds = [];
  }
  if (createdTicketIds.length > 0) {
    await prisma.attachmentEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
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
  const ticketNumber = `TTK-${new Date().getFullYear()}-${String(seq[0].nextval).padStart(6, '0')}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      title: 'Audit probe',
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

async function uploadPng(
  session: SessionFixture,
  ticketNumber: string,
  buf: Buffer,
  filename = 'audit.png',
) {
  const res = await withWriteAuth(
    session,
    request(app).post(`/api/tickets/${ticketNumber}/attachments`),
  ).attach('file', buf, { filename, contentType: 'image/png' });
  if (res.status === 201) createdAttachIds.push(res.body.id);
  return res;
}

let ownerSession: SessionFixture;
let otherSession: SessionFixture;

beforeAll(async () => {
  ownerSession = await createSession({ label: 'audit-owner', withLinkedRequester: true });
  otherSession = await createSession({ label: 'audit-other', withLinkedRequester: true });
});

describe('Attachment audit ledger', () => {
  it('upload stores sha256 and emits UPLOAD with actor + snapshot', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('audit-bytes-123');
    const expected = crypto.createHash('sha256').update(buf).digest('hex');
    const up = await uploadPng(ownerSession, ticket.ticketNumber, buf);
    expect(up.status).toBe(201);
    expect(up.body.sha256).toBe(expected);

    const row = await prisma.attachment.findUnique({ where: { id: up.body.id } });
    expect(row?.sha256).toBe(expected);

    const events = await prisma.attachmentEvent.findMany({
      where: { ticketId: ticket.id, attachmentId: up.body.id, type: 'UPLOAD' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(ownerSession.userId);
    expect(events[0].actorName).toBe(ownerSession.name);
    expect(events[0].fileName).toBe('audit.png');
    expect(events[0].sha256).toBe(expected);
    expect(events[0].sizeBytes).toBe(buf.length);
  });

  it('delete with reasonCode+note persists fields and emits REMOVE', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const up = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([9, 9, 9]));
    expect(up.status).toBe(201);

    const del = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Duplicate', note: 'uploaded twice' });
    expect(del.status).toBe(200);
    expect(del.body.removedAt).toBeTruthy();
    expect(del.body.removeReason).toBe('Duplicate');
    expect(del.body.removeNote).toBe('uploaded twice');

    const row = await prisma.attachment.findUnique({ where: { id: up.body.id } });
    expect(row?.removeReason).toBe('Duplicate');
    expect(row?.removeNote).toBe('uploaded twice');

    const events = await prisma.attachmentEvent.findMany({
      where: { ticketId: ticket.id, attachmentId: up.body.id, type: 'REMOVE' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('Duplicate');
    expect(events[0].note).toBe('uploaded twice');
    expect(events[0].actorId).toBe(ownerSession.userId);
  });

  it('delete rejects unknown reasonCode and overlong note with 400', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const up = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([7]));
    expect(up.status).toBe(201);

    const badReason = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Nope' });
    expect(badReason.status).toBe(400);

    const badNote = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Other', note: 'x'.repeat(201) });
    expect(badNote.status).toBe(400);

    const row = await prisma.attachment.findUnique({ where: { id: up.body.id } });
    expect(row?.removedAt).toBeNull();
  });

  it('restore revives the file, clears reason/note, and emits RESTORE with ref', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const up = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([1, 2]));
    expect(up.status).toBe(201);

    await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Obsolete', note: 'oops' });

    const removeEvent = await prisma.attachmentEvent.findFirstOrThrow({
      where: { ticketId: ticket.id, attachmentId: up.body.id, type: 'REMOVE' },
    });

    const res = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/restore`),
    );
    expect(res.status).toBe(200);
    expect(res.body.removedAt).toBeNull();
    expect(res.body.removeReason).toBeNull();
    expect(res.body.removeNote).toBeNull();

    const restoreEvent = await prisma.attachmentEvent.findFirstOrThrow({
      where: { ticketId: ticket.id, attachmentId: up.body.id, type: 'RESTORE' },
    });
    expect(restoreEvent.id).toBeGreaterThan(removeEvent.id);

    const eventsRes = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/events`),
    );
    expect(eventsRes.status).toBe(200);
    const restoreEntry = (eventsRes.body as unknown[]).find(
      (e) => (e as { type: string }).type === 'RESTORE',
    ) as { ref: number } | undefined;
    expect(restoreEntry?.ref).toBe(removeEvent.id);
  });

  it('restore on an active file 404s; restore past the 5-active limit 409s', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const up = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([3]));
    expect(up.status).toBe(201);

    const notRemoved = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/restore`),
    );
    expect(notRemoved.status).toBe(404);

    // Fill to 5 active, then remove one and refill so a restore would be 6th.
    const ids: number[] = [up.body.id];
    for (let i = 0; i < 4; i++) {
      const r = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([i]), `fill${i}.png`);
      expect(r.status).toBe(201);
      ids.push(r.body.id);
    }
    const victim = ids[0];
    const del = await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${victim}`),
    ).send({ reasonCode: 'Other' });
    expect(del.status).toBe(200);
    const refill = await uploadPng(ownerSession, ticket.ticketNumber, Buffer.from([42]), 'refill.png');
    expect(refill.status).toBe(201);

    const over = await withWriteAuth(
      ownerSession,
      request(app).post(`/api/tickets/${ticket.ticketNumber}/attachments/${victim}/restore`),
    );
    expect(over.status).toBe(409);
  });

  it('events endpoint lists newest-first with file snapshots; cross-owner 404', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('snapshot-bytes');
    const up = await uploadPng(ownerSession, ticket.ticketNumber, buf, 'snap.png');
    expect(up.status).toBe(201);
    await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Duplicate', note: 'dup' });

    const res = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/events`),
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const body = res.body as Array<{
      id: number; type: string; at: string; createdAt: string;
      by: string; actorName: string;
      file: { id: number; name: string; size: number; mime: string; sha: string };
      reason: string | null; note: string | null;
    }>;
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body[0].type).toBe('REMOVE');
    expect(body[body.length - 1].type).toBe('UPLOAD');
    for (const e of body) {
      expect(e.file.name).toBe('snap.png');
      expect(e.file.sha).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
      expect(e.by).toBe(ownerSession.name);
      expect(e.actorName).toBe(ownerSession.name);
      expect(new Date(e.at).getTime()).not.toBeNaN();
    }
    const removeEntry = body.find((e) => e.type === 'REMOVE')!;
    expect(removeEntry.reason).toBe('Duplicate');
    expect(removeEntry.note).toBe('dup');

    const cross = await withCookie(
      otherSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/events`),
    );
    expect(cross.status).toBe(404);
  });

  it('download emits DOWNLOAD and still streams identical bytes', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('download-audit-bytes');
    const up = await uploadPng(ownerSession, ticket.ticketNumber, buf, 'dl.png');
    expect(up.status).toBe(201);

    const dl = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}/download`),
    );
    expect(dl.status).toBe(200);
    expect(Buffer.compare(dl.body, buf)).toBe(0);

    const events = await prisma.attachmentEvent.findMany({
      where: { ticketId: ticket.id, attachmentId: up.body.id, type: 'DOWNLOAD' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].actorId).toBe(ownerSession.userId);
    expect(events[0].fileName).toBe('dl.png');
  });

  it('ticket detail attachments carry sha256 + removeReason/removeNote', async () => {
    const ticket = await createOwnedTicket(ownerSession.requesterId!);
    const buf = Buffer.from('detail-sha');
    const up = await uploadPng(ownerSession, ticket.ticketNumber, buf, 'det.png');
    expect(up.status).toBe(201);
    await withWriteAuth(
      ownerSession,
      request(app).delete(`/api/tickets/${ticket.ticketNumber}/attachments/${up.body.id}`),
    ).send({ reasonCode: 'Sensitive content', note: 'pii' });

    const detail = await withCookie(
      ownerSession,
      request(app).get(`/api/tickets/${ticket.ticketNumber}`),
    );
    expect(detail.status).toBe(200);
    const att = (detail.body.attachments as Array<Record<string, unknown>>).find(
      (a) => a.id === up.body.id,
    )!;
    expect(att.sha256).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
    expect(att.removeReason).toBe('Sensitive content');
    expect(att.removeNote).toBe('pii');
  });
});
