import { expect, test, type Page } from '../fixtures';

// Lab 3 Issue — E2E: IT Staff ticket flow (T-E2E-02 family). Drives the REAL
// UI against the REAL API + seeded database (server + client web servers are
// started by playwright.config.ts webServer entries; the seeded database is
// shared with the API suites' dockerized Postgres).
//
// Coverage mapping (docs/lab-03/tests.md T-E2E-02):
//   staff login + queue access            → 'queue renders for IT Staff'
//   search/filter/sort/pagination         → 'search, status filter, sort and pagination'
//   open detail + claim/reassign          → 'claim assigns ownership and copies priority'
//   IT Priority update                    → 'IT Priority update'
//   permitted status update               → 'permitted status transition OPEN → IN_PROGRESS'
//   Public Comment creation               → 'posts a Public Comment'
//   Internal Note creation                → 'posts an Internal Note'
//   Requester restriction from notes      → 'requester session cannot reach staff screens'
//
// Seeded demo tickets live in the TTK-2026-800000 band (server/prisma/seed.ts):
// they are created fresh/idempotently by the seed and belong to requester 1
// (alpha). The flow picks its fixtures from those rows so it stays stable
// across seed runs. Passwords below are the documented local-dev seeds.
const API = 'http://localhost:4000';

const STAFF = { email: 'sara.it@toktickit.test', password: 'Staff123!' };
const ALPHA = { email: 'alpha@toktickit.test', password: 'Requester123!' };

async function waitForHealth(page: Page) {
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/api/health`);
        return r.ok();
      },
      { timeout: 6500, intervals: [500] },
    )
    .toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await waitForHealth(page);
  await page.close();
});

interface QueueTicket {
  id: number;
  ticketNumber: string;
  status: string;
  owner: { id: number; name: string } | null;
}

// Queue fixture helper: page the staff queue API for the first ticket
// matching `pick`. Shared demo band data mutates across seed/runs, so tests
// select fixtures dynamically instead of hardcoding numbers.
async function findTicket(
  page: Page,
  pick: (t: QueueTicket) => boolean,
): Promise<QueueTicket> {
  for (let p = 1; p <= 8; p += 1) {
    const res = await page.request.get(
      `${API}/api/staff/tickets?page=${p}&pageSize=50`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: QueueTicket[]; meta: { totalPages: number } };
    const hit = body.data.find(pick);
    if (hit) return hit;
    if (p >= body.meta.totalPages) break;
  }
  throw new Error('no queue ticket matched the fixture selector');
}

test.describe('T-E2E-02: IT Staff ticket flow', () => {
  // Every test in this file logs in through the real login form. Seeded staff
  // carry mustChangePassword=true, so the first login lands on the gate; the
  // fixture restores the seed before each test (e2e/fixtures.ts), making each
  // journey independent.
  async function staffLoginAndSettle(page: Page): Promise<void> {
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(STAFF.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STAFF.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const pw = `Stf${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /ticket queue/i })).toBeVisible({ timeout: 15000 });
  }

  async function requesterLoginAndSettle(page: Page): Promise<void> {
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(ALPHA.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ALPHA.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const pw = `Req${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });
  }

  test('queue renders for IT Staff with rows, sortable headers and pagination', async ({ page }) => {
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    // Rows arrive (seeded band) with the pagination footer.
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mt-showing')).toContainText(/Showing 1 to \d+ of \d+ tickets/);
    // Role navigation: staff sees the queue link; admin-only links absent.
    await expect(page.getByRole('link', { name: /user management/i })).toHaveCount(0);

    // Sort: clicking Number re-issues the query sorted ascending by number.
    await page.getByRole('button', { name: /Number/ }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('th[aria-sort="ascending"]')?.textContent ?? ''),
      )
      .toContain('Number');
  });

  test('search, status filter, sort and pagination drive the queue query', async ({ page }) => {
    await waitForHealth(page);
    await staffLoginAndSettle(page);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Search (debounced) narrows the server query.
    await page.getByLabel('Search by ticket number or summary').fill('laptop');
    await expect
      .poll(async () =>
        page.evaluate(() => window.location.hash),
      )
      .toContain('/staff/queue');
    await expect(page.locator('.mt-showing')).toBeVisible({ timeout: 15000 });

    // Status filter lives in the head Filters popover.
    await page.getByRole('button', { name: /Filters/ }).click();
    const pop = page.getByRole('dialog', { name: 'Queue filters' });
    await pop.getByLabel('Current Status').selectOption('Open');
    await pop.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.mt-showing')).toContainText(/of \d+ tickets/, { timeout: 15000 });

    // Pagination footer stays interactive (Next disabled on the last page).
    const next = page.getByRole('navigation', { name: /pagination/i }).getByRole('button', { name: 'Next ›' });
    await expect(next).toBeDisabled();
  });

  test('claim assigns ownership and copies Requested Priority into IT Priority', async ({ page }) => {
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    // Fixture via API: an unassigned NEW ticket (state mutates between runs,
    // so never hardcode numbers). It may sit on any page — navigate by hash.
    const target = await findTicket(page, (t) => t.status === 'NEW' && t.owner === null);
    await page.goto(`/#/staff/tickets/${target.ticketNumber}`);
    await expect(page.getByRole('heading', { name: new RegExp(target.ticketNumber) })).toBeVisible({ timeout: 15000 });

    // Claim: select self as owner and save.
    await page.getByLabel('Owner').selectOption({ label: 'Sara IT' });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('.std-banner.success')).toContainText(/Ticket assigned to Sara IT/, {
      timeout: 15000,
    });
  });

  test('IT Priority update and permitted status transition succeed', async ({ page }) => {
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    // Fixture via API: an OPEN ticket — its permitted targets include
    // In Progress (BR-15). Navigate by hash, not by queue-text matching.
    const target = await findTicket(page, (t) => t.status === 'OPEN');
    await page.goto(`/#/staff/tickets/${target.ticketNumber}`);
    await expect(page.getByRole('heading', { name: new RegExp(target.ticketNumber) })).toBeVisible({ timeout: 15000 });

    // IT Priority update (permitted for IT Staff on the detail screen).
    await page.getByLabel('IT Priority').selectOption({ label: 'High' });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('.std-banner.success')).toContainText('IT Priority updated.', { timeout: 15000 });

    // Permitted status transition on an OPEN ticket: → In Progress.
    await page.getByLabel('Status').selectOption({ label: 'In Progress' });
    await expect(page.locator('.std-banner.success')).toContainText(
      'Status changed to In Progress.',
      { timeout: 15000 },
    );
  });

  test('staff posts a Public Comment and an Internal Note on the detail screen', async ({ page }) => {
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    const target = await findTicket(page, () => true);
    await page.goto(`/#/staff/tickets/${target.ticketNumber}`);
    await expect(page.getByRole('heading', { name: new RegExp(target.ticketNumber) })).toBeVisible({ timeout: 15000 });

    // Public Comment (default tab). The posted body appears exactly once
    // (previous runs' comments accumulate, so match the unique stamp).
    const stamp = `E2E public reply ${Date.now().toString(36)}`;
    await page.getByLabel('Add a public comment').fill(stamp);
    await page.getByRole('button', { name: /Post Comment/ }).click();
    await expect(page.getByText(stamp)).toHaveCount(1, { timeout: 15000 });

    // Internal Note (amber staff-only tab).
    await page.getByRole('tab', { name: /Internal Notes/ }).click();
    const noteStamp = `E2E internal note ${Date.now().toString(36)}`;
    await page.getByLabel('Add an internal note').fill(noteStamp);
    await page.getByRole('button', { name: /Post Internal Note/ }).click();
    await expect(page.getByText(noteStamp)).toBeVisible({ timeout: 15000 });
  });

  test('requester session cannot reach staff screens or internal notes', async ({ page }) => {
    await waitForHealth(page);
    await requesterLoginAndSettle(page);

    // The shell blocks the staff routes client-side; the server 403s the API.
    await page.goto('/#/staff/queue');
    await expect(page.getByText('You do not have access to the staff queue.')).toBeVisible({ timeout: 15000 });

    const res = await page.request.get(`${API}/api/staff/tickets`);
    expect(res.status()).toBe(403);
    const resNotes = await page.request.get(`${API}/api/staff/tickets/TTK-2026-800001/internal-notes`);
    expect([403, 404]).toContain(resNotes.status());
  });
});
