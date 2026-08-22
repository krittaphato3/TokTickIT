import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

// API-22 — FR-17, AC-22. GET /api/related-systems is public (no identity
// header) and returns all seeded systems ordered by id. Requires the seed
// data (7 related systems).

describe('GET /api/related-systems (API-22)', () => {
  it('returns 200 with at least 6 seeded systems ordered by id', async () => {
    const res = await request(app).get('/api/related-systems');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Labsheet requires at least 6 related systems; seed provides 7.
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body.length).toBe(7);
    for (const sys of res.body) {
      expect(sys).toHaveProperty('id');
      expect(typeof sys.name).toBe('string');
    }
    // Ordered by id ascending.
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].id).toBeGreaterThan(res.body[i - 1].id);
    }
  });
});