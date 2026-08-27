import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

const prisma = getPrisma();
let createdTicketIds: number[] = [];

afterEach(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    createdTicketIds = [];
  }
});

async function createOwnedTicket(requesterId: number) {
  const cat = await prisma.category.findFirstOrThrow();
  const sys = await prisma.relatedSystem.findFirstOrThrow();
  const pr = await prisma.requester.findUniqueOrThrow({ where: { id: requesterId } });
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

describe('GET /api/tickets/:ticketNumber — ticket detail (API-12, API-19, API-25)', () => {
  it('API-12: owned detail returns 200 with requester + active attachments', async () => {
    const ticket = await createOwnedTicket(1);
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

    const res = await request(app)
      .get(`/api/tickets/${ticket.ticketNumber}`)
      .set('X-Dev-Requester-Id', '1');

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(ticket.ticketNumber);
    expect(res.body.requester).toMatchObject({ id: 1, name: 'Dev User Alpha' });
    expect(res.body.relatedSystem).toBeDefined();
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0]).toMatchObject({ fileName: 'shot.png', mimeType: 'image/png' });
  });

  it('API-19: detail excludes removed attachments', async () => {
    const ticket = await createOwnedTicket(1);
    const a1 = await prisma.attachment.create({
      data: { ticketId: ticket.id, fileName: 'keep.png', storedName: `stored-${Date.now()}-keep`, mimeType: 'image/png', sizeBytes: 10, removedAt: null },
    });
    const a2 = await prisma.attachment.create({
      data: { ticketId: ticket.id, fileName: 'gone.png', storedName: `stored-${Date.now()}-gone`, mimeType: 'image/png', sizeBytes: 10, removedAt: new Date() },
    });
    void a1;
    const res = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('X-Dev-Requester-Id', '1');
    expect(res.status).toBe(200);
    const names = res.body.attachments.map((a: any) => a.fileName);
    expect(names).toContain('keep.png');
    expect(names).not.toContain('gone.png');
  });

  it('API-12: other owner gets 403 with no data leak', async () => {
    const ticket = await createOwnedTicket(1);
    const res = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('X-Dev-Requester-Id', '2');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong/i);
    expect(res.body.title).toBeUndefined();
    expect(res.body.description).toBeUndefined();
  });

  it('API-12: nonexistent ticket returns 404', async () => {
    const res = await request(app).get('/api/tickets/TTK-2026-999999').set('X-Dev-Requester-Id', '1');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/does not exist/i);
  });

  it('API-12: malformed ticket number returns 400', async () => {
    const res = await request(app).get('/api/tickets/BAD-123').set('X-Dev-Requester-Id', '1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid ticket number format/i);
  });

  it('API-25: detail includes relatedSystem', async () => {
    const ticket = await createOwnedTicket(1);
    const res = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('X-Dev-Requester-Id', '1');
    expect(res.status).toBe(200);
    expect(res.body.relatedSystem).toBeDefined();
    expect(res.body.relatedSystem.id).toBeDefined();
  });
});
