import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Load DATABASE_URL etc. from server/.env so DB-backed tests run locally
    // and in CI without duplicating env vars in the command line.
    setupFiles: ['dotenv/config'],
  },
});
