import { expect, test } from '@playwright/test';

// E2E-02 / E2E-05 — cross-requester ownership against the real API
// (FR-14, AC-06/07, FR-13/AC-16). Dev User Alpha's seeded list must be
// invisible to Dev User Beta, and switching requesters reloads only that
// requester's tickets.

test('E2E-02: Beta never sees Alpha tickets; switching reloads only own data', async ({
  page,
}) => {
  await page.goto('/#/tickets');
  await expect(page.getByRole('heading', { name: /my tickets/i, level: 1 })).toBeVisible();

  // Alpha (default) shows the seeded demo set.
  await expect(page.getByText(/Showing 1 to 10 of 42 tickets/)).toBeVisible();
  const alphaRow = page.getByRole('link', { name: 'TTK-2026-800000' });
  await expect(alphaRow).toBeVisible();

  // Switch to Beta: the list remounts with Beta's own data (BR-05).
  await page.getByLabel('Development Requester').selectOption({ label: 'Dev User Beta' });
  await expect(page.getByText(/Showing 1 to \d+ of 10 tickets/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'TTK-2026-800000' })).toHaveCount(0);

  // Beta's set is stable across a reload (server-side scoping, not stale DOM).
  await page.reload();
  await expect(page.getByText(/Showing 1 to \d+ of 10 tickets/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'TTK-2026-800000' })).toHaveCount(0);
});

test('E2E-05: a ticket created by Alpha is owned by Alpha, not by the next requester', async ({
  page,
}) => {
  // Delta creates a ticket through the API (the UI path is covered by
  // create-ticket.spec.ts); the number is unique per run.
  const created = await page.request.post('http://localhost:4000/api/tickets', {
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-Requester-Id': '4',
    },
    data: {
      title: `E2E-05 ownership probe ${Date.now()}`,
      categoryId: 2,
      priority: 'MEDIUM',
      relatedSystemId: 1,
    },
  });
  expect(created.status()).toBe(201);
  const { ticketNumber } = await created.json();

  // Delta sees it.
  await page.goto('/#/tickets');
  await page.getByLabel('Development Requester').selectOption({ label: 'Dev User Delta' });
  await expect(
    page.getByRole('link', { name: ticketNumber }).first(),
  ).toBeVisible();

  // Beta does not see it in the list…
  await page.getByLabel('Development Requester').selectOption({ label: 'Dev User Beta' });
  await expect(page.getByText(/Showing 1 to \d+ of 10 tickets/)).toBeVisible();
  await expect(page.getByRole('link', { name: ticketNumber })).toHaveCount(0);

  // …and the list API enforces the same boundary: Beta's full page never
  // contains the foreign ticket number.
  const betaList = await page.request.get('http://localhost:4000/api/tickets?pageSize=50', {
    headers: { 'X-Dev-Requester-Id': '2' },
  });
  const body = await betaList.text();
  expect(body).not.toContain(ticketNumber);
});
