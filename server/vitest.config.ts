import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // API suites share one PostgreSQL database and some assert exact list
    // counts for a requester, so test files must not run in parallel
    // (the serial-execution option anticipated by tests.md §5).
    fileParallelism: false,
    // Load DATABASE_URL etc. from server/.env so DB-backed tests run locally
    // and in CI without duplicating env vars in the command line.
    setupFiles: ['dotenv/config'],
  },
});
