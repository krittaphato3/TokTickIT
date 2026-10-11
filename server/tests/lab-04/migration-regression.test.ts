import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/prisma.js';

// L4-2 — migration + rollback + seed regression (docs/lab-04/tests.md rows
// MIG-01..MIG-03; PERF-01 is out of scope — dashboards land in L4-5).
// Serial suite (fileParallelism: false). Leaves the database in the pre-test
// state: MIG-02 re-applies the migration after exercising the rollback.

const execFileAsync = promisify(execFile);
const prisma = getPrisma();
const db = prisma as unknown as Record<string, any>;
const serverDir = process.cwd();
const rollbackPath = join(serverDir, 'prisma', 'rollback', 'lab4_down.sql');

const LAB3_TABLES = [
  'Category',
  'Requester',
  'User',
  'Ticket',
  'PublicComment',
  'InternalNote',
  'Attachment',
] as const;

type Snapshot = {
  counts: Record<string, number>;
  sampleTickets: Array<{ ticketNumber: string; title: string; status: string }>;
  sampleUser: { email: string; role: string } | null;
};

async function snapshotLab3(): Promise<Snapshot> {
  // Raw SQL throughout: after the MIG-02 rollback drops `Ticket.version`,
  // the generated (Lab 4) client can no longer read the Ticket model, so
  // typed delegates are unusable on the rolled-back database.
  const counts: Record<string, number> = {};
  for (const model of LAB3_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM "${model}"`,
    );
    counts[model] = Number(rows[0]?.n ?? 0);
  }
  const sampleTickets = await prisma.$queryRawUnsafe<
    Array<{ ticketNumber: string; title: string; status: string }>
  >(
    `SELECT "ticketNumber", "title", "status" FROM "Ticket" ORDER BY "id" ASC LIMIT 5`,
  );
  const users = await prisma.$queryRawUnsafe<Array<{ email: string; role: string }>>(
    `SELECT "email", "role" FROM "User" ORDER BY "id" ASC LIMIT 1`,
  );
  const firstUser = users[0] ?? null;
  return {
    counts,
    sampleTickets,
    sampleUser: firstUser ? { email: firstUser.email, role: firstUser.role } : null,
  };
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function ticketColumnExists(column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Ticket' AND column_name = ${column}
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

describe('MIG-01 — lab4_actions_taken preserves every Lab 3 row (AC-16)', () => {
  it('row counts and sample rows are identical after migrate deploy; new columns default cleanly', async () => {
    const before = await snapshotLab3();
    await execFileAsync('cmd', ['/c', 'npx prisma migrate deploy'], { cwd: serverDir });
    const after = await snapshotLab3();
    expect(after.counts).toEqual(before.counts);
    expect(after.sampleTickets).toEqual(before.sampleTickets);
    expect(after.sampleUser).toEqual(before.sampleUser);

    expect(await tableExists('ActionTaken')).toBe(true);
    const dirty = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM "Ticket"
      WHERE "version" IS DISTINCT FROM 1
        OR "resolvedAt" IS NOT NULL
        OR "resolutionSummary" IS NOT NULL
    `;
    expect(Number(dirty[0]?.n ?? 1)).toBe(0);
  }, 120_000);
});

describe('MIG-02 — rollback removes Lab 4 objects, keeps Lab 3 data, re-apply works (AC-16)', () => {
  it('lab4_down.sql drops the additions only; migrate deploy re-applies', async () => {
    const before = await snapshotLab3();
    const sql = await readFile(rollbackPath, 'utf8');
    expect(sql).toContain('ActionTaken');
    // Strip `--` comment LINES first: a naive startsWith('--') filter on
    // `;`-split segments would also drop the statement following a comment.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    expect(await tableExists('ActionTaken')).toBe(false);
    expect(await ticketColumnExists('version')).toBe(false);
    expect(await ticketColumnExists('resolvedAt')).toBe(false);
    expect(await ticketColumnExists('resolutionSummary')).toBe(false);
    const after = await snapshotLab3();
    expect(after.counts).toEqual(before.counts);
    expect(after.sampleTickets).toEqual(before.sampleTickets);

    await execFileAsync('cmd', ['/c', 'npx prisma migrate deploy'], { cwd: serverDir });
    expect(await tableExists('ActionTaken')).toBe(true);
    expect(await ticketColumnExists('version')).toBe(true);
  }, 180_000);
});

describe('MIG-03 — seed is idempotent and covers the Lab 4 matrix (AC-16)', () => {
  it('two seed runs change no counts and every coverage case is present', async () => {
    await execFileAsync('cmd', ['/c', 'npx tsx prisma/seed.ts'], { cwd: serverDir });
    const first = {
      tickets: await prisma.ticket.count(),
      users: await prisma.user.count(),
      actions: await db.actionTaken.count(),
    };
    await execFileAsync('cmd', ['/c', 'npx tsx prisma/seed.ts'], { cwd: serverDir });
    const second = {
      tickets: await prisma.ticket.count(),
      users: await prisma.user.count(),
      actions: await db.actionTaken.count(),
    };
    expect(second).toEqual(first);

    const statuses = await prisma.ticket.groupBy({ by: ['status'], _count: { status: true } });
    const present = new Set(statuses.map((s) => s.status));
    for (const status of ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']) {
      expect(present.has(status as never), `status ${status} seeded`).toBe(true);
    }
    expect(await prisma.ticket.count({ where: { ownerId: null } })).toBeGreaterThan(0);
    expect(await prisma.ticket.count({ where: { ownerId: { not: null } } })).toBeGreaterThan(0);

    const actionCounts = await db.actionTaken.groupBy({
      by: ['ticketId'],
      _count: { ticketId: true },
    });
    const counts = new Set(actionCounts.map((g: { _count: { ticketId: number } }) => g._count.ticketId));
    expect(counts.has(1), 'exactly-one-action ticket seeded').toBe(true);
    expect([...counts].some((n) => n >= 3), '≥3-action ticket seeded').toBe(true);
    const ticketIdsWithActions = new Set(actionCounts.map((g: { ticketId: number }) => g.ticketId));
    const zeroAction = await prisma.ticket.count({
      where: { id: { notIn: [...ticketIdsWithActions] } },
    });
    expect(zeroAction).toBeGreaterThan(0);

    expect(await db.actionTaken.count({ where: { followUpRequired: true } })).toBeGreaterThan(0);

    const zeroTicketRequester = await prisma.user.findUnique({ where: { email: 'zeta@toktickit.test' } });
    expect(zeroTicketRequester).not.toBeNull();

    const legacy = await prisma.ticket.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] } },
    });
    const legacyWithoutActions = legacy.filter((t: { id: number }) => !ticketIdsWithActions.has(t.id));
    expect(legacyWithoutActions.length).toBeGreaterThan(0);
  }, 300_000);
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => undefined);
});
