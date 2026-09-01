import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

// API-21 — FR-13, BR-15, AC-21 (selector data): GET /api/requesters returns
// only active Development Requesters, ordered by id, excluding inactive ones.
describe('GET /api/requesters', () => {
  it('returns only active requesters ordered by id', async () => {
    const res = await request(app).get('/api/requesters');

    expect(res.status).toBe(200);
    // 5 seeded requesters: Alpha, Beta, Gamma, Delta (active) +
    // Epsilon (inactive) — Epsilon must be excluded.
    expect(res.body).toHaveLength(4);
    expect(res.body.map((r: { id: number }) => r.id)).toEqual([1, 2, 3, 4]);
    expect(res.body[0]).toEqual({
      id: 1,
      name: 'Dev User Alpha',
      email: 'alpha@toktickit.test',
    });
    // The inactive Epsilon requester must never be selectable.
    expect(res.body.some((r: { email: string }) =>
      r.email === 'epsilon@toktickit.test')).toBe(false);
  });
});
