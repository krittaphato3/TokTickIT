# TokTickIT

IT service desk application — CPE334 Lab 1 project foundation (React + TypeScript + Vite + Bootstrap frontend, Node.js + Express + TypeScript backend, PostgreSQL, Prisma ORM).

## Prerequisites

- Node.js 20+ and npm
- **Either** Docker Desktop **or** nothing at all — see the two run modes below

---

## Run mode 1 — everything in Docker (one command)

Builds and starts all three services. The server container applies migrations and seeds automatically at startup.

```bash
docker compose up -d --build
```

| Service  | URL                   | Notes |
| -------- | --------------------- | ----- |
| client   | http://localhost:5173 | React UI served by nginx |
| server   | http://localhost:4000 | Express API |
| postgres | localhost:**5433**    | Host port 5433, not 5432 — see the port note below |

Stop with `docker compose down` (add `-v` to also wipe the database volume).

## Run mode 2 — npm only, no Docker (embedded PostgreSQL)

A real PostgreSQL runs straight from `node_modules` — no Docker Desktop, no native install. Data lives in `server/.pgdata` (gitignored).

```bash
cd server
npm install           # first time only
cp .env.example .env  # then point DATABASE_URL at port 5434 (see .env.example)
npm run db:up         # start PostgreSQL on 127.0.0.1:5434 + migrate + seed
npm run dev           # the API on http://localhost:4000
```

In a second terminal:

```bash
cd client
npm install
cp .env.example .env
npm run dev           # the UI on http://localhost:5173
```

Useful database commands:

```bash
npm run db:up     # idempotent: starts the DB if needed, migrates, seeds
npm run db:down   # stops it cleanly
```

Delete `server/.pgdata` to reset the database completely.

## Run mode 3 — hybrid: Docker Postgres + hot-reload apps on the host

If you prefer the Compose database but hot reload for the apps:

```bash
docker compose up -d postgres   # DB only, on 127.0.0.1:5433
cd server && npm run dev        # .env points at port 5433 in this mode
cd client && npm run dev
```

---

## Port map (why these ports)

Your machine may already run a native Windows PostgreSQL service on 5432, and on Windows `localhost` can resolve to IPv6 `::1` first — both caused real "credentials invalid" / wrong-database failures during setup. So:

| Database            | Host port | Use in `DATABASE_URL` |
| ------------------- | --------- | ---------------------- |
| Native Windows PG   | 5432      | avoid                  |
| Compose postgres    | **5433**  | `127.0.0.1:5433`       |
| Embedded (`db:up`)  | **5434**  | `127.0.0.1:5434`       |

Always use `127.0.0.1`, never `localhost`. Inside the Compose network, containers use the hostname `postgres` with the normal port 5432.

## Database (Prisma)

Schema: `server/prisma/schema.prisma`. The seed inserts four categories (**Account and Access**, **Hardware**, **Software**, **Network**), five dev requesters, and seven related systems — all idempotent upserts.

```bash
cd server
npm run prisma:migrate   # create/apply a migration in dev
npm run prisma:seed      # seed reference data
```

In Docker mode this happens automatically when the server container starts.

## Tests

```bash
cd server && npm test    # 26 tests; DB-backed — run mode 1, 2 or 3 first
cd client && npm test    # 16 tests; no database needed
```

## Build

```bash
cd server && npm run build
cd client && npm run build
```

## Responsive layout check

The Create Ticket page is verified at 375 / 800 / 1280 px. With the client dev server running:

```bash
cd client
node scripts/responsive-check.mjs   # screenshots into artifacts/lab-02/screenshots/create-ticket/
```

It fails loudly if any width produces horizontal overflow.

## Notes

- `.env` files are gitignored; only `.env.example` is committed. `cp .env.example .env` works in PowerShell and Git Bash; on cmd use `copy`.
- The server container runs committed migrations automatically at startup (`prisma migrate deploy`); re-running is safe.
- The Development Requester selector in the navbar is test scaffolding (BR-03), not real authentication.
