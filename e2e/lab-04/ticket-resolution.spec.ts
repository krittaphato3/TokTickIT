import { expect, test, type Page } from '../fixtures';

// L4-3 — E2E-02 (docs/lab-04/tests.md §2): staff resolve a ticket end to end
// against the REAL UI + API + seeded database. The journey:
//   1. an outstanding follow-up blocks Resolved and the dialog names the
//      reason (BR-10),
//   2. a satisfied ticket resolves with the summary stored (AC-10),
//   3. a stale tab gets a conflict notice that keeps the typed summary (AC-12).
//
// Seeded fixtures (server/prisma/seed.ts, BR-17 band TTK-2026-8100xx) are
// located dynamically through the staff queue search so the spec never
// hardcodes a number, and the satisfiable ticket is returned to IN_PROGRESS at
// the end so re-runs start from the same place.

const API = 'http://localhost:4000';
const STAFF = { email: 'sara.it@toktickit.test', password: 'Staff123!' };

const CONFLICT_TEXT = 'This ticket changed while you were working. Review the latest values, then try again.';
const FOLLOW_UP_GATE_TEXT = 'An action still has follow-up required.';

interface QueueRow {
  ticketNumber: string;
  title: string;
  status: string;
  version: number;
  itPriority: string | null;
}

async function waitForHealth(page: Page): Promise<void> {
  await expect
    .poll(async () => (await page.request.get(`${API}/api/health`)).ok(), {
      timeout: 6500,
      intervals: [500],
    })
    .toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await waitForHealth(page);
  await page.close();
});

async function staffLoginAndSettle(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(STAFF.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STAFF.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Seeded staff carry mustChangePassword=true; the fixture restores the seed
  // before every test, so each journey completes the gate itself.
  await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
  const pw = `Stf${Date.now().toString().slice(-6)}!Aa1`;
  await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
  await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
  await page.getByRole('button', { name: /save and continue/i }).click();
  await expect(page.getByRole('heading', { name: /ticket queue/i })).toBeVisible({ timeout: 15000 });
}

// page.request shares the browser context cookies, so these calls act as the
// signed-in staff member (the same trick the Lab 3 suite uses for fixtures).
async function findDemoTicket(page: Page, titleFragment: string): Promise<QueueRow> {
  // Paged scan rather than a server-side search: the fixture stays independent
  // of the queue's filter vocabulary and of the seeded numbers.
  for (let p = 1; p <= 8; p += 1) {
    const res = await page.request.get(`${API}/api/staff/tickets?page=${p}&pageSize=50`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: QueueRow[]; meta: { totalPages: number } };
    const hit = body.data.find((t) => t.title.includes(titleFragment));
    if (hit) return hit;
    if (p >= body.meta.totalPages) break;
  }
  throw new Error(`seeded demo ticket "${titleFragment}" is missing — re-run the seed`);
}

async function csrfToken(page: Page): Promise<string> {
  const res = await page.request.get(`${API}/api/auth/me`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}

async function apiGetDetail(page: Page, ticketNumber: string): Promise<QueueRow> {
  const res = await page.request.get(`${API}/api/staff/tickets/${ticketNumber}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as QueueRow;
}

async function apiPatch(page: Page, path: string, body: Record<string, unknown>): Promise<void> {
  const res = await page.request.patch(`${API}${path}`, {
    data: body,
    headers: { 'X-CSRF-Token': await csrfToken(page), 'Content-Type': 'application/json' },
  });
  if (!res.ok()) {
    throw new Error(`PATCH ${path} failed with ${res.status()}: ${await res.text()}`);
  }
}

// Drive the seeded ticket back to IN_PROGRESS through permitted transitions so
// a re-run of this spec starts from the same state it left.
async function ensureInProgress(page: Page, ticketNumber: string): Promise<QueueRow> {
  let detail = await apiGetDetail(page, ticketNumber);
  if (['RESOLVED', 'CLOSED'].includes(detail.status)) {
    await apiPatch(page, `/api/staff/tickets/${ticketNumber}/status`, {
      status: 'REOPENED',
      expectedVersion: detail.version,
      confirm: true,
      reason: 'E2E setup: returning the demo ticket to its working state.',
    });
    detail = await apiGetDetail(page, ticketNumber);
  }
  if (detail.status !== 'IN_PROGRESS') {
    await apiPatch(page, `/api/staff/tickets/${ticketNumber}/status`, {
      status: 'IN_PROGRESS',
      expectedVersion: detail.version,
      confirm: true,
    });
    detail = await apiGetDetail(page, ticketNumber);
  }
  return detail;
}

test.describe('E2E-02: resolving a ticket and the stale-tab conflict', () => {
  // Both journeys must run clean (Lab 4 §10 / AC-21): an uncaught exception is
  // always a defect, and the only console errors tolerated are the browser's own
  // resource-status lines for the writes this spec deliberately has refused
  // (Chrome logs every non-2xx fetch).
  const EXPECTED_STATUS_LINE =
    /Failed to load resource: the server responded with a status of (401|409|422)/;

  function collectPageErrors(page: Page): { uncaught: string[]; consoleErrors: string[] } {
    const uncaught: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => uncaught.push(String(err)));
    return { uncaught, consoleErrors };
  }

  test('the resolution gate blocks a ticket with outstanding follow-up', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    const ticket = await findDemoTicket(page, 'follow-up outstanding');
    expect(ticket.status).toBe('IN_PROGRESS');

    await page.goto(`/#/staff/tickets/${ticket.ticketNumber}`);
    await expect(page.getByTestId('ticket-status-badge')).toHaveText('In Progress', { timeout: 15000 });

    const statusSelect = page.getByLabel('Status', { exact: true });
    await expect(statusSelect).toBeEnabled();
    await statusSelect.selectOption('RESOLVED');

    const dialog = page.getByRole('dialog', { name: /resolve ticket/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/resolution summary/i).fill('Parts arrived and were installed.');

    await dialog.getByRole('button', { name: /^resolve ticket$/i }).click();

    // The gate reason is named inside the dialog, nothing changed on the ticket.
    await expect(dialog.getByText(FOLLOW_UP_GATE_TEXT)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/resolution summary/i)).toHaveValue('Parts arrived and were installed.');
    await expect(page.getByTestId('ticket-status-badge')).toHaveText('In Progress');

    const after = await apiGetDetail(page, ticket.ticketNumber);
    expect(after.status).toBe('IN_PROGRESS');
    expect(pageErrors.uncaught).toEqual([]);
    expect(pageErrors.consoleErrors.filter((m) => !EXPECTED_STATUS_LINE.test(m))).toEqual([]);
  });

  test('a stale version shows the conflict notice, keeps the summary, then resolves after Reload', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await waitForHealth(page);
    await staffLoginAndSettle(page);

    const seeded = await findDemoTicket(page, 'single action ticket');
    const started = await ensureInProgress(page, seeded.ticketNumber);

    // 1. The UI loads version N.
    await page.goto(`/#/staff/tickets/${seeded.ticketNumber}`);
    await expect(page.getByTestId('ticket-version')).toHaveText(`Version ${started.version}`, { timeout: 15000 });

    // 2. Another actor writes through the API, so the loaded copy is stale.
    const otherPriority = started.itPriority === 'HIGH' ? 'CRITICAL' : 'HIGH';
    await apiPatch(page, `/api/staff/tickets/${seeded.ticketNumber}/it-priority`, {
      itPriority: otherPriority,
      expectedVersion: started.version,
    });
    const bumped = await apiGetDetail(page, seeded.ticketNumber);
    expect(bumped.version).toBe(started.version + 1);

    // 3. The stale attempt is refused and the typed summary survives.
    const statusSelect = page.getByLabel('Status', { exact: true });
    await expect(statusSelect).toBeEnabled();
    await statusSelect.selectOption('RESOLVED');
    const dialog = page.getByRole('dialog', { name: /resolve ticket/i });
    await dialog.getByLabel(/resolution summary/i).fill('Switch replaced and monitored for 24 hours.');
    await dialog.getByRole('button', { name: /^resolve ticket$/i }).click();

    await expect(page.getByText(CONFLICT_TEXT)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/resolution summary/i)).toHaveValue(
      'Switch replaced and monitored for 24 hours.',
    );
    expect((await apiGetDetail(page, seeded.ticketNumber)).status).toBe('IN_PROGRESS');

    // 4. Reload realigns the header with the server's version, then the
    //    satisfied resolution goes through and the summary is stored.
    await page.getByRole('button', { name: /reload/i }).click();
    await expect(page.getByTestId('ticket-version')).toHaveText(`Version ${bumped.version}`, { timeout: 10000 });

    await statusSelect.selectOption('RESOLVED');
    const resolveDialog = page.getByRole('dialog', { name: /resolve ticket/i });
    const summaryField = resolveDialog.getByLabel(/resolution summary/i);
    if ((await summaryField.inputValue()) === '') {
      await summaryField.fill('Switch replaced and monitored for 24 hours.');
    }
    await resolveDialog.getByRole('button', { name: /^resolve ticket$/i }).click();

    await expect(page.getByTestId('ticket-status-badge')).toHaveText('Resolved', { timeout: 10000 });
    await expect(page.getByTestId('resolution-summary')).toContainText(
      'Switch replaced and monitored for 24 hours.',
    );

    const resolved = await apiGetDetail(page, seeded.ticketNumber);
    expect(resolved.status).toBe('RESOLVED');

    // 5. Restore the seeded demo state for the next run.
    await apiPatch(page, `/api/staff/tickets/${seeded.ticketNumber}/status`, {
      status: 'REOPENED',
      expectedVersion: resolved.version,
      confirm: true,
      reason: 'E2E teardown: restoring the demo ticket to IN_PROGRESS.',
    });
    const restored = await apiGetDetail(page, seeded.ticketNumber);
    await apiPatch(page, `/api/staff/tickets/${seeded.ticketNumber}/status`, {
      status: 'IN_PROGRESS',
      expectedVersion: restored.version,
      confirm: true,
    });
    expect((await apiGetDetail(page, seeded.ticketNumber)).status).toBe('IN_PROGRESS');
    expect(pageErrors.uncaught).toEqual([]);
    expect(pageErrors.consoleErrors.filter((m) => !EXPECTED_STATUS_LINE.test(m))).toEqual([]);
  });
});
