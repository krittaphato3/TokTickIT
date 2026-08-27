import { defineConfig, devices } from '@playwright/test';

// Supplementary local verification only — outside Lab 1's required
// Vitest/Supertest scope (npm test still runs Vitest/Supertest only).
export default defineConfig({
  // Lab 1 smoke + Lab 2 full-stack flows live in sibling dirs; Playwright
  // discovers both because testMatch scopes to spec files under tests/e2e.
  testDir: './tests',
  testMatch: '**/e2e/**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../server run dev',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
