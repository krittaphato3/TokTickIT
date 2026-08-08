import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with status ok and service name', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API' });
  });
});