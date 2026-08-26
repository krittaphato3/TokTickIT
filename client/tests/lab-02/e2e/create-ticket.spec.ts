import { expect, test } from '@playwright/test';

// E2E-01 / E2E-06 — full create flow against the real API + seeded database,
// including a deliberate double-click on Submit (AC-01/AC-05) and a related
// system chip check (FR-17/AC-22). Requires: postgres (db:up), server :4000,
// client :5173 (webServer in playwright.config.ts reuses them when running).
//
// The created ticket is owned by Dev User Delta (requester 4) so the shared
// Alpha/Beta fixture sets stay untouched for the other specs.

const CREATE_URL = '#/new-ticket';

async function openCreate(page: import('@playwright/test').Page) {
  await page.goto(`/${CREATE_URL}`);
  await expect(page.getByRole('heading', { name: /create ticket/i, level: 1 })).toBeVisible();
  // Create as Dev User Delta so the shared Alpha/Beta fixture counts stay
  // untouched for the ownership and responsive specs.
  await page.getByLabel('Development Requester').selectOption({ label: 'Dev User Delta' });
}

test('E2E-01: create flow succeeds, double-submit creates exactly one ticket', async ({
  page,
}) => {
  await openCreate(page);

  const title = `E2E-01 printer offline ${Date.now()}`;
    await page.getByLabel('Category').selectOption({ label: 'Hardware' });
  await page.getByLabel('Related System').selectOption({ index: 1 });
  await page.getByLabel('Requested Priority').selectOption({ label: 'High' });
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel('Description').fill('E2E-01: the office printer keeps showing offline after the driver update.');

  // Deliberate double-click: the second press must be ignored (BR-12).
  const submit = page.getByRole('button', { name: /submit ticket/i });
  await submit.dblclick();

  // App navigates to the detail view on success.
  await expect(page.getByRole('heading', { name: /ticket detail/i })).toBeVisible();
  await expect(page.getByText('Official number:')).toBeVisible();
  const ticketNumber = await page.locator('.tt-ticket-number').textContent();
  expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

  // Exactly one ticket with this title exists for the creating requester.
  const list = await page.request.get(
    'http://localhost:4000/api/tickets?pageSize=50',
    { headers: { 'X-Dev-Requester-Id': '4' } },
  );
  expect(list.ok()).toBeTruthy();
  const { data, meta } = await list.json();
  const matches = data.filter((t: { title: string }) => t.title === title);
  expect(matches).toHaveLength(1);
  expect(matches[0].status).toBe('NEW');
  expect(matches[0].priority).toBe('HIGH');
  expect(matches[0].ticketNumber).toBe(ticketNumber);
  expect(meta.totalItems).toBeGreaterThanOrEqual(1);
});

test('E2E-06: related system is required and the created ticket carries it', async ({
  page,
}) => {
  await openCreate(page);

  // Submitting without a related system must show the inline field error.
  await page.getByLabel(/^Title/).fill(`E2E-06 missing system ${Date.now()}`);
  await page.getByLabel('Category').selectOption({ label: 'Software' });
  await page.getByRole('button', { name: /submit ticket/i }).click();
  await expect(page.getByText(/related system/i).first()).toBeVisible();

  // Fill it in; the create succeeds and the success banner shows the number.
  await page.getByLabel('Related System').selectOption({ index: 1 });
  await page.getByRole('button', { name: /submit ticket/i }).click();
  await expect(page.getByRole('heading', { name: /ticket detail/i })).toBeVisible();
  const ticketNumber = await page.locator('.tt-ticket-number').textContent();
  expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

  // The list row for the new ticket renders the related system name.
  await page.goto('/#/tickets');
  const row = page.locator('tbody').getByRole('link', { name: ticketNumber! });
  await expect(row).toBeVisible();
});
