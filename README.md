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

Schema: `server/prisma/schema.prisma`. The seed inserts four categories (**Account and Access**, **Hardware**, **Software**, **Network**), seven related systems, five dev requesters, and the Lab 3 user accounts (roles, passwords, sessions) — all idempotent upserts.

```bash
cd server
npm run prisma:migrate   # create/apply a migration in dev
npm run prisma:seed      # seed reference data
```

In Docker mode this happens automatically when the server container starts.

## Seeded accounts (local development only)

The seed creates these logins for the Lab 3 authentication flow. **Local development and grading only — never use these credentials anywhere real.**

| Role          | Email                     | Initial password | Notes                              |
| ------------- | ------------------------- | ---------------- | ---------------------------------- |
| Requester     | `alpha@toktickit.test`    | `Requester123!`  | active — has demo tickets          |
| Requester     | `beta@toktickit.test`     | `Requester123!`  | active                             |
| Requester     | `gamma@toktickit.test`    | `Requester123!`  | active                             |
| Requester     | `delta@toktickit.test`    | `Requester123!`  | active                             |
| Requester     | `epsilon@toktickit.test`  | `Requester123!`  | **inactive** — login is refused    |
| IT Staff      | `sara.it@toktickit.test`  | `Staff123!`      | active                             |
| IT Staff      | `tom.it@toktickit.test`   | `Staff123!`      | active                             |
| IT Staff      | `priya.it@toktickit.test` | `Staff123!`      | active                             |
| IT Staff      | `leo.it@toktickit.test`   | `Staff123!`      | **inactive** — login is refused    |
| Administrator | `admin@toktickit.test`    | `Admin123!`      | active                             |

- Every seeded account starts with `mustChangePassword = true`: after the first login you are placed on the **Change Password** screen and must set a new password before the app opens.
- Re-running the seed never resets a password you have already changed (updates leave `passwordHash` and `mustChangePassword` untouched). To restore the table above, delete the user's row or reset the database (`docker compose down -v`, or delete `server/.pgdata`).
- Inactive accounts demonstrate the safe-failure path: their login returns the same generic error as a wrong password, without revealing account status.

## Tests

### Running Unit & API Test Suites
```bash
# Server unit & API suites (DB-backed, vitest)
npm --prefix server test

# Client component & UI test suites (vitest + testing-library)
npm --prefix client test

# Run specific Lab 4 test suites:
npm --prefix server test -- server/tests/lab-04/authz-sweep.api.test.ts
npm --prefix server test -- server/tests/lab-04/actions-taken.api.test.ts
npm --prefix server test -- server/tests/lab-04/ticket-workflow.api.test.ts
npm --prefix server test -- server/tests/lab-04/staff-dashboard.api.test.ts
npm --prefix server test -- server/tests/lab-04/requester-dashboard.api.test.ts
npm --prefix server test -- server/tests/lab-04/migration-regression.test.ts
npm --prefix client test -- client/tests/lab-04/
```

### Running E2E Test Suites (Playwright)
```bash
# Run all Playwright E2E suites across Labs 2, 3, 4
npx playwright test

# Run Lab 4 specific E2E specs
npx playwright test e2e/lab-04/actions-taken-flow.spec.ts
npx playwright test e2e/lab-04/ticket-resolution.spec.ts
npx playwright test e2e/lab-04/dashboards.spec.ts
npx playwright test e2e/lab-04/regression-a11y-responsive.spec.ts
```

### Database Migrations & Rollback

```bash
# Run migrations forward
cd server && npx prisma migrate deploy

# Run seed (idempotent)
cd server && npm run db:seed

# Reset developer account credentials to initial seed state
npm run auth:reset

# Rollback Lab 4 migration (reverts schema back to Lab 3 state preserving data)
# With Docker Postgres on port 5433:
PGPASSWORD=toktickit psql -h localhost -p 5433 -U toktickit -d toktickit -f server/prisma/rollback/lab4_down.sql

# With embedded Postgres on port 5434:
PGPASSWORD=toktickit psql -h localhost -p 5434 -U toktickit -d toktickit -f server/prisma/rollback/lab4_down.sql
```

## Demo Walkthrough Per Role

### 1. Requester Journey
1. Sign in with `eta@toktickit.test` / `Requester123!` (or `alpha@toktickit.test`).
2. Land on **Requester Dashboard** (`#/dashboard`):
   - View operational metric cards: Active Tickets, Waiting for You, Resolved, Closed. Click any card to drill down into `#/my`.
   - Inspect **My Recent Tickets** (top 3) and **Recently Resolved** (top 3).
3. Click **+ New Ticket** quick action (navigates to `#/new`) to submit a new ticket.
4. Click into any ticket to open **Ticket Detail** (`#/tickets/:number`):
   - View ticket status badge, priority, details, and attachments.
   - Post public comments.
   - View **Actions Taken** section: read-only timeline of staff interventions, timestamps, follow-up flags, and attachment references with zero write affordances.

### 2. IT Staff Journey
1. Sign in with `sara.it@toktickit.test` / `Staff123!` (or `tom.it@toktickit.test`).
2. Land on **Staff Dashboard** (`#/dashboard`):
   - View 5 status count cards, Unassigned Active card, and Owned by Me card with real-time drill-down links to `#/staff/queue`.
   - View active ticket breakdown by IT Priority.
   - Inspect Recent Active Tickets (top 3) and My Recent Actions (top 3), linking directly to `#/staff/tickets/:number`.
3. Open **Staff Queue** (`#/staff/queue`): filter by status, priority, or search summary.
4. Open a ticket to reach **Staff Ticket Detail** (`#/staff/tickets/:number`):
   - Claim or assign ticket.
   - Post internal notes.
   - Under **Actions Taken**: click **+ Record Action**, fill description and result, optionally check "Follow-up required" with note, and submit.
   - Edit previously recorded actions inline.
   - Change ticket status via the workflow dropdown. When transitioning to **RESOLVED**, the Resolution Gate dialog automatically opens requiring a resolution summary.

### 3. Administrator Journey
1. Sign in with `admin@toktickit.test` / `Admin123!`.
2. Land on **Staff / Admin Dashboard** (`#/dashboard`):
   - In addition to all Staff operational metrics, view the **User Directory** card displaying active/inactive breakdown and counts by role (Requester, IT Staff, Administrator) with a link to `#/admin/users`.
3. Open **User Management** (`#/admin/users`):
   - Filter users by role or active status.
   - Search user accounts.
   - Create new user accounts or reset passwords.

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
- Lab 3: real authentication replaced the Lab 2 Development Requester selector. Signing in is required, identity comes from the server-side session, and the first login on a seeded account forces a password change (see the accounts table above).
