import { describe, it } from 'vitest';

// Lab 3 Authorization — server/tests/lab-03/authorization.api.test.ts
// PLACEHOLDER ONLY. T-GATE-01 is covered in auth.api.test.ts; the full
// T-AUTHZ role-matrix suite is owned by other issues. This skeleton keeps
// `vitest run` green while documenting the reserved blocks.

describe('T-GATE-01 / T-AUTHZ authorization (placeholder)', () => {
  it.todo('should block mustChangePassword users from non-auth routes');
  it.todo('should enforce REQUESTER vs IT_STAFF vs ADMINISTRATOR matrix');
  it.todo('should return 401 without session and 403 without role');
});
