import { createRequire } from 'node:module';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

// Permanent fix: globalTeardown runs after all e2e specs finish.
// It restores all seeded users to their standard documented passwords
// and sets mustChangePassword = false for demo accounts (sara.it, eta, admin)
// so the developer can immediately log in on http://localhost:5173 without
// being locked out or forced through password change screens.

const require_ = createRequire(path.join(process.cwd(), 'server', 'package.json'));
const { Client } = require_('pg') as typeof import('pg');
const bcrypt = require_('bcryptjs') as typeof import('bcryptjs');

const DEMO_CREDENTIALS: Array<{ email: string; pass: string; mustChange: boolean; isActive: boolean }> = [
  { email: 'sara.it@toktickit.test', pass: 'Staff123!', mustChange: false, isActive: true },
  { email: 'tom.it@toktickit.test', pass: 'Staff123!', mustChange: false, isActive: true },
  { email: 'priya.it@toktickit.test', pass: 'Staff123!', mustChange: false, isActive: true },
  { email: 'leo.it@toktickit.test', pass: 'Staff123!', mustChange: true, isActive: false },
  { email: 'eta@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'zeta@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'alpha@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'beta@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'gamma@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'delta@toktickit.test', pass: 'Requester123!', mustChange: false, isActive: true },
  { email: 'epsilon@toktickit.test', pass: 'Requester123!', mustChange: true, isActive: false },
  { email: 'admin@toktickit.test', pass: 'Admin123!', mustChange: false, isActive: true },
];

export async function restoreDeveloperPasswords(): Promise<void> {
  const { connect } = await import('node:net');
  const ports = ['5433', '5434', '5432'];
  const reachablePorts: string[] = [];

  for (const port of ports) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: '127.0.0.1', port: Number(port), timeout: 500 });
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
    if (ok) reachablePorts.push(port);
  }

  for (const port of reachablePorts) {
    const connectionString = `postgresql://toktickit:toktickit_dev_password@127.0.0.1:${port}/toktickit_dev?schema=public`;
    let client: import('pg').Client | null = null;
    try {
      client = new Client({ connectionString });
      await client.connect();
      for (const item of DEMO_CREDENTIALS) {
        const hash = bcrypt.hashSync(item.pass, 12);
        await client.query(
          `UPDATE "User"
              SET "passwordHash" = $1,
                  "mustChangePassword" = $2,
                  "isActive" = $3
            WHERE "email" = $4`,
          [hash, item.mustChange, item.isActive, item.email],
        );
      }
      await client.query('DELETE FROM "Session"');
    } catch {
      // Ignore errors on secondary ports
    } finally {
      if (client) {
        await client.end().catch(() => undefined);
      }
    }
  }
}

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  await restoreDeveloperPasswords();
}
