import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app';

describe('server foundation', () => {
  it('responds to requests through the Express app', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(404);
  });
});
