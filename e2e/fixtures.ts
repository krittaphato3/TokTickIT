import { test as base } from '@playwright/test';
import { resetSeededUsers } from './global-setup';

// Per-test fixture: restore the seeded auth users to their initial credentials
// before every test, so e2e journeys that change passwords (mandatory
// first-login change, forgot-password reset) never interfere with each other
// regardless of execution order. See global-setup.ts for the seed mirror.
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page }, use) => {
    await resetSeededUsers();
    await use(page);
  },
});

export { expect } from '@playwright/test';
