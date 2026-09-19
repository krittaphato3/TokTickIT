import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { FullConfig } from '@playwright/test';

// Playwright setup for the TokTickIT e2e suites.
//
// E2E journeys deliberately mutate seeded users' passwords (mandatory
// first-login change, forgot-password reset) and an earlier test's mutation
// would otherwise break later tests that sign in with the initial credential.
// The seed itself never overwrites a developer-changed password, so this
// module restores the seeded auth users to their initial credentials:
//   - once before the whole run (globalSetup, also covers lab-02 spec runs),
//   - and before EVERY test (resetSeededUsers via e2e/fixtures.ts) so tests
//     stay order-independent.
//
// Only toktickit.test accounts are touched, with their exact seed state
// (epsilon and leo are inactive by design — do NOT "fix" them here).
// Database access is direct SQL because this runs before the API web server
// (and its dotenv) is up; DATABASE_URL is read from server/.env directly.

// createRequire anchored at server/ resolves pg + bcryptjs from the server
// workspace; import.meta is unavailable under the root CJS package.
const require_ = createRequire(path.join(process.cwd(), 'server', 'package.json'));
const { Client } = require_('pg') as typeof import('pg');
const bcrypt = require_('bcryptjs') as typeof import('bcryptjs');

// Mirrors server/prisma/seed.ts (LOCAL-DEVELOPMENT credentials only).
const SEED_USERS: Record<string, { password: string; isActive: boolean }> = {
  'alpha@toktickit.test': { password: 'Requester123!', isActive: true },
  'beta@toktickit.test': { password: 'Requester123!', isActive: true },
  'gamma@toktickit.test': { password: 'Requester123!', isActive: true },
  'delta@toktickit.test': { password: 'Requester123!', isActive: true },
  'epsilon@toktickit.test': { password: 'Requester123!', isActive: false },
  'sara.it@toktickit.test': { password: 'Staff123!', isActive: true },
  'tom.it@toktickit.test': { password: 'Staff123!', isActive: true },
  'priya.it@toktickit.test': { password: 'Staff123!', isActive: true },
  'leo.it@toktickit.test': { password: 'Staff123!', isActive: false },
  'admin@toktickit.test': { password: 'Admin123!', isActive: true },
};

const hashCache = new Map<string, string>();

function cachedHash(plain: string): string {
  let hash = hashCache.get(plain);
  if (!hash) {
    hash = bcrypt.hashSync(plain, 12);
    hashCache.set(plain, hash);
  }
  return hash;
}

function loadDatabaseUrl(): string {
  const candidates = [
    path.resolve(process.cwd(), 'server/.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    try {
      const raw = readFileSync(file, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('DATABASE_URL not found for e2e setup (server/.env)');
}

// The dev database may be the embedded server (port 5434, `npm run db:up`)
// OR the dockerized Compose one (port 5433, `docker compose up`). Both use
// identical credentials; probe both ports and use whichever accepts first.
async function resolveDatabaseUrl(): Promise<string> {
  const raw = loadDatabaseUrl();
  const url = new URL(raw);
  const configuredPort = url.port || '5432';
  const portOrder = [...new Set([configuredPort, '5434', '5433'])];
  const { connect } = await import('node:net');
  for (const port of portOrder) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: '127.0.0.1', port: Number(port), timeout: 800 });
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) {
      url.port = port;
      return url.toString();
    }
  }
  throw new Error(`No dev database reachable on ports ${portOrder.join(', ')} — start one with "npm run db:up" (server) or "docker compose up -d postgres".`);
}

export async function resetSeededUsers(): Promise<void> {
  const client = new Client({ connectionString: await resolveDatabaseUrl() });
  await client.connect();
  try {
    for (const [email, seed] of Object.entries(SEED_USERS)) {
      await client.query(
        `UPDATE "User"
            SET "passwordHash" = $1,
                "mustChangePassword" = true,
                "isActive" = $2
          WHERE "email" = $3`,
        [cachedHash(seed.password), seed.isActive, email],
      );
    }
    // Stale sessions from a previous run would break logout-invalidation
    // assertions if a replayed cookie ever hit a still-valid session row.
    await client.query('DELETE FROM "Session"');
  } finally {
    await client.end();
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await resetSeededUsers();
}
