import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// Lab 3 — client test helper: authenticate the session the same way the app
// does. The AuthProvider bootstraps identity from GET /api/auth/me, so tests
// stub that endpoint (plus auth/allowlist endpoints) with the fixture user and
// then render <App />. No Development Requester exists anymore (BR-03): the
// session user IS the identity.

export interface StubUser {
  id: number;
  name: string;
  email: string;
  role?: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export function sessionUser(overrides: Partial<StubUser> = {}): StubUser & { role: string } {
  return {
    id: 1,
    name: 'Dev User Alpha',
    email: 'alpha@toktickit.test',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

// Builds a fetch stub that answers the auth endpoints plus an optional
// per-test handler for everything else. Always call this INSTEAD of stubbing
// fetch directly when the test renders <App /> under Lab 3.
export function stubAuthenticatedFetch(
  user: StubUser,
  handler?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/auth/me')) {
      return ok({ user, csrfToken: 'test-csrf-token' });
    }
    if (url.includes('/api/auth/login')) {
      return ok({ user, csrfToken: 'test-csrf-token' });
    }
    if (url.includes('/api/auth/logout')) {
      return ok({ message: 'Logged out' });
    }
    const custom = await handler?.(url, init);
    if (custom) return custom;
    return ok({});
  }) as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

// Waits until the auth bootstrap (/api/auth/me) has resolved so role-gated
// screens are actually mounted before assertions run.
export async function waitForSession(): Promise<void> {
  await waitFor(() => {
    const app = document.querySelector('.tt-app');
    if (!app) throw new Error('app shell not mounted yet');
  });
}
