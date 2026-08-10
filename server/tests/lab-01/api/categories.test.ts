import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

// NOTE: this test reads from PostgreSQL through Prisma, so the database must
// be migrated and seeded first:
//   docker compose up -d
//   cd server && npx prisma migrate dev && npx prisma db seed

describe('GET /api/categories', () => {
  it('returns 200 with the four seeded categories in id order', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    // Every item must expose id and name.
    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(typeof item.id).toBe('number');
      expect(typeof item.name).toBe('string');
    }

    // The seeded names must appear in this predictable order (id ascending).
    const names = res.body.map((item: { name: string }) => item.name);
    expect(names.slice(0, 4)).toEqual([
      'Account and Access',
      'Hardware',
      'Software',
      'Network',
    ]);
  });
});
