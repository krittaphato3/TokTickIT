# TokTickIT

IT service desk application — CPE334 Lab 1 project foundation (React + TypeScript + Vite + Bootstrap frontend, Node.js + Express + TypeScript backend, PostgreSQL via Docker, Prisma ORM).

## Prerequisites

- Node.js 20+ (tested on v25.8.1)
- npm
- Docker Desktop (for PostgreSQL)

## Setup

1. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

2. Install and configure the server:

   ```bash
   cd server
   npm install
   cp .env.example .env
   npx prisma generate
   npm run dev
   ```

   The API runs on http://localhost:4000.

3. In a new terminal, install and run the client:

   ```bash
   cd client
   npm install
   cp .env.example .env
   npm run dev
   ```

   The UI runs on http://localhost:5173 and calls the API at `VITE_API_URL` (default `http://localhost:4000/api`).

## Tests

```bash
cd server && npm test
cd client && npm test
```

## Build

```bash
cd server && npm run build
cd client && npm run build
```

## Notes

- `.env` is gitignored; only `.env.example` is committed. `cp .env.example .env` works in PowerShell and Git Bash; on cmd use `copy .env.example .env`.
- PostgreSQL data persists in the `toktickit_pgdata` Docker volume.
