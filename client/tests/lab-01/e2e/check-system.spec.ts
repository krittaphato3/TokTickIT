import { expect, test } from '@playwright/test';

// Human-sequence smoke test for the Lab 1 Check System flow.
// Requires: PostgreSQL running + migrated + seeded, backend on :4000,
// frontend on :5173 (webServer in playwright.config.ts starts both).
test('Check System shows Online and the four categories', async ({ page }) => {
  await page.goto('/');

  // 1. App heading and title text visible.
  await expect(page.getByRole('heading', { name: /toktickit/i })).toBeVisible();
  await expect(page.getByText('IT Service Desk')).toBeVisible();

  // 2. Click Check System.
  await page.getByRole('button', { name: 'Check System' }).click();

  // 3. Loading state appears while the request runs.
  await expect(page.getByRole('button', { name: /loading/i })).toBeVisible();

  // 4. Success state: Online + all four categories.
  await expect(page.getByText('System Status: Online')).toBeVisible();
  await expect(page.getByText('Supported Request Categories:')).toBeVisible();
  for (const name of ['Account and Access', 'Hardware', 'Software', 'Network']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});
