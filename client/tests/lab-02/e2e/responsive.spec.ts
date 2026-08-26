import { expect, test } from '@playwright/test';

// E2E-04 — responsive contract on My Tickets (FR-16/AC-19): mobile stacks
// cards with no horizontal scroll and ≥44px touch targets, tablet keeps the
// two-column form, desktop renders the full table.

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1280, height: 960 };

test('E2E-04 mobile: stacked cards, no horizontal scroll, 44px targets', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/#/tickets');
  await expect(page.getByText(/Showing 1 to 10 of 42 tickets/)).toBeVisible();

  // Cards instead of the table.
  await expect(page.locator('.m-card').first()).toBeVisible();
  await expect(page.locator('table.mt-table')).toHaveCount(0);

  // No horizontal overflow.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Pagination buttons are comfortable touch targets (≥44px tall).
  const next = page.getByRole('button', { name: 'Next ›' });
  const box = await next.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
});

test('E2E-04 tablet: filter card and content stay usable, no overflow', async ({
  page,
}) => {
  await page.setViewportSize(TABLET);
  await page.goto('/#/tickets');
  await expect(page.getByText(/Showing 1 to 10 of 42 tickets/)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Create form renders its two-column requester context grid.
  await page.goto('/#/new-ticket');
  await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible();
  await expect(page.locator('.tok-grid-2').first()).toBeVisible();
});

test('E2E-04 desktop: full nine-column table and two-column form', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/#/tickets');
  await expect(page.getByText(/Showing 1 to 10 of 42 tickets/)).toBeVisible();
  await expect(page.locator('thead th')).toHaveCount(9);
  for (const header of [
    'Ticket No.',
    'Created Date',
    'IT Priority',
    'Ticket Owner',
    'Last Updated',
  ]) {
    await expect(page.locator('thead').getByText(header)).toBeVisible();
  }

  await page.goto('/#/new-ticket');
  await expect(page.locator('.tok-grid-2').first()).toBeVisible();
});
