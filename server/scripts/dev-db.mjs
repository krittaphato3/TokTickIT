// Embedded PostgreSQL for Docker-free development (`npm run db:up` etc.).
// Runs a real PostgreSQL server from node_modules — no Docker Desktop and no
// native installation required. Data lives in server/.pgdata (gitignored) on
// port 5434 so it never clashes with the native Windows service (5432), the
// Compose database (5433), or anything else.
//
//   npm run db:up      start it in the background and wait until ready
//   npm run db:down    stop it cleanly
//
// How it works: `up` spawns a detached `serve` keeper process that owns the
// PostgreSQL child, writes a ready-marker when the database accepts
// connections, and shuts the database down cleanly when it sees a stop-file.
// The keeper is required because on Windows the PostgreSQL child does not
// outlive the Node process that started it.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATA_DIR = join(process.cwd(), '.pgdata');
const READY_MARKER = join(DATA_DIR, '.ready');
const STOP_MARKER = join(DATA_DIR, '.stop');
const CREATED_MARKER = join(DATA_DIR, '.db-created');
const PORT = Number(process.env.DEV_DB_PORT ?? 5434);
const USER = 'toktickit';
const PASSWORD = 'toktickit_dev_password';
const DB_NAME = 'toktickit_dev';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isPortAccepting() {
  const { connect } = await import('node:net');
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: PORT, timeout: 800 });
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

function buildOptions() {
  return {
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    persistent: true,
    port: PORT,
    onError: (messageOrError) =>
      console.error('[embedded-postgres]', messageOrError),
  };
}

const command = process.argv[2];

if (command === 'up') {
  rmSync(READY_MARKER, { force: true });
  rmSync(STOP_MARKER, { force: true });

  if (await isPortAccepting()) {
    console.log('Embedded PostgreSQL already running.');
    process.exit(0);
  }

  // Not listening: any postmaster.pid / leftover state here is stale (the
  // previous keeper is gone). Clear it so initdb/start don't trip on it.
  rmSync(join(DATA_DIR, 'postmaster.pid'), { force: true });

  const { openSync } = await import('node:fs');
  const logFd = openSync(join(process.cwd(), '.pgdata-keeper.log'), 'a');
  const keeper = spawn(process.execPath, [SCRIPT_PATH, 'serve'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  keeper.unref();

  for (let i = 0; i < 120 && !existsSync(READY_MARKER); i++) await sleep(250);
  if (!existsSync(READY_MARKER)) {
    console.error(
      'Embedded PostgreSQL did not become ready in time. See server/.pgdata-keeper.log',
    );
    process.exit(1);
  }
  console.log(
    `Embedded PostgreSQL ready on port ${PORT} (user ${USER}, db ${DB_NAME}).`,
  );
} else if (command === 'down') {
  writeFileSync(STOP_MARKER, String(Date.now()));
  for (let i = 0; i < 40; i++) {
    if (!existsSync(STOP_MARKER)) {
      console.log('Embedded PostgreSQL stopped.');
      process.exit(0);
    }
    await sleep(250);
  }
  console.error('Keeper did not confirm shutdown; is it running?');
  process.exit(1);
} else if (command === 'serve') {
  // Detached keeper: owns the PostgreSQL child process for its lifetime.
  const firstRun = !existsSync(join(DATA_DIR, 'PG_VERSION'));
  const pg = new EmbeddedPostgres(buildOptions());
  if (firstRun) await pg.initialise();
  await pg.start();
  if (!existsSync(CREATED_MARKER)) {
    await pg.createDatabase(DB_NAME);
    writeFileSync(CREATED_MARKER, String(Date.now()));
  }
  writeFileSync(READY_MARKER, String(Date.now()));

  // Park until asked to stop, then shut PostgreSQL down cleanly.
  while (true) {
    if (existsSync(STOP_MARKER)) break;
    await sleep(300);
  }
  rmSync(STOP_MARKER);
  rmSync(READY_MARKER);
  await pg.stop();
  process.exit(0);
} else {
  console.error('Usage: node scripts/dev-db.mjs <up|down>');
  process.exit(1);
}
