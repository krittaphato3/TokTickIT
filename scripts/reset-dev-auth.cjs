// Resets all seeded user passwords in Docker / local PostgreSQL to their
// documented initial credentials and sets mustChangePassword = false so developers
// can immediately sign in on http://localhost:5173 without being locked out.
//
// Usage: npm run auth:reset

const path = require('node:path');
const { createRequire } = require('node:module');
const net = require('node:net');

const require_ = createRequire(path.join(process.cwd(), 'server', 'package.json'));
const { Client } = require_('pg');
const bcrypt = require_('bcryptjs');

const USERS = [
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

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port), timeout: 500 });
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
}

async function main() {
  const ports = [5433, 5434, 5432];
  let touched = 0;

  for (const port of ports) {
    const isUp = await checkPort(port);
    if (!isUp) continue;

    const connectionString = `postgresql://toktickit:toktickit_dev_password@127.0.0.1:${port}/toktickit_dev?schema=public`;
    const client = new Client({ connectionString });
    try {
      await client.connect();
      for (const u of USERS) {
        const hash = bcrypt.hashSync(u.pass, 12);
        await client.query(
          `UPDATE "User"
              SET "passwordHash" = $1,
                  "mustChangePassword" = $2,
                  "isActive" = $3
            WHERE "email" = $4`,
          [hash, u.mustChange, u.isActive, u.email]
        );
      }
      await client.query('DELETE FROM "Session"');
      console.log(`Successfully reset credentials on PostgreSQL port ${port}`);
      touched++;
    } catch (err) {
      // Continue to next port
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (touched === 0) {
    console.error('No PostgreSQL database was reachable on ports 5433, 5434, or 5432.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
