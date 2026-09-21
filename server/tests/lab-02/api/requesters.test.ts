import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

// API-21 — selector data endpoint. Lab 2 returned the active Development
// Requesters for the client-side selector. Lab 3 removes the selector
// (BR-03/AC-03) and its data source with it (docs/lab-03/api-spec.md §10:
// "GET /api/requesters — Removed in Lab 3; use GET /api/users as admin").
// This test now pins the removal: the route must not answer with requester
// identity data anymore.

const SHAPES = ['Dev User Alpha', 'alpha@toktickit.test'];

describe('GET /api/requesters — removed in Lab 3 (BR-03)', () => {
  it('no longer returns requester identity data', async () => {
    const res = await request(app).get('/api/requesters');

    // The route is gone (Express default 404). If someone reintroduces it,
    // fail loudly unless it also stopped leaking identity rows.
    if (res.status === 200) {
      expect(Array.isArray(res.body) ? res.body : []).toEqual([]);
      return;
    }
    expect([404, 405, 501]).toContain(res.status);
    // No requester identity may leak through any fallback body.
    for (const leak of SHAPES) {
      expect(JSON.stringify(res.body ?? {})).not.toContain(leak);
    }
  });
});
