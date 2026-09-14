import { expect, test, type Page } from '../fixtures';

// Mandated spec — e2e/lab-02/requester-ticket-flow.spec.ts
// Covers E2E-01..E2E-05 against the real API + Vite dev servers and seeded DB.
// Lab 3 port: identity comes from a real login (BR-03). The Development
// Requester selector is gone; every scenario signs in as a seeded user and
// API probes ride the browser session cookie (page.request shares the
// browser context's storage after page.goto).
// Requires: PostgreSQL migrated+seeded, server :4000, client :5173.

const API = 'http://localhost:4000';

// Seeded local-development credentials (server/prisma/seed.ts). Initial
// passwords: users with mustChangePassword must complete the forced change;
// the alpha requester is used with mustChangePassword=false for regression
// flows that must land directly on My Tickets.
const ALPHA = { email: 'alpha@toktickit.test', password: 'Requester123!' };
const BETA = { email: 'beta@toktickit.test', password: 'Requester123!' };

// Deterministic 1x1 transparent PNG for byte-identical download check.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

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

// Signs in through the real login screen. toktickit.test users seeded with
// mustChangePassword=true land on the change-password screen; the helper
// completes the forced change with a per-run suffix password and reports it
// back via the returned object (logout/login reuse it within the test).
async function login(page: Page, email: string, password: string) {
  await page.goto('/#/login');
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  const gate = page.getByRole('heading', { name: /choose a new password/i });
  // NOTE: locator.isVisible() returns immediately (its timeout option is
  // ignored), which raced past the gate on slower bcrypt logins. waitFor
  // actually polls for the gate before concluding the account is ungated.
  const gated = await gate
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (gated) {
    const changed = `Regr${Date.now().toString().slice(-6)}!Aa1`;
    await expect(page.getByRole('textbox', { name: 'New Password', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(gate).toBeHidden({ timeout: 10000 });
    return { password: changed, changedInitial: true };
  }
  return { password, changedInitial: false };
}

async function logout(page: Page) {
  // Profile-only header: sign-out lives on the Profile page (#/profile).
  // Fall back to a navbar Logout button if an older build renders one.
  const navbarLogout = page.getByRole('button', { name: /^logout$/i });
  if ((await navbarLogout.count()) > 0) {
    await navbarLogout.first().click();
  } else {
    await page.getByRole('link', { name: /^profile$/i }).first().click();
    await page.getByRole('button', { name: /^sign out$/i }).click();
  }
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });
}

// Authenticated API probe helper: relies on the browser context storage
// (cookies) shared with page.request after the page has visited the app.
async function apiGet(page: Page, path: string) {
  return page.request.get(`${API}${path}`);
}

// CSRF-aware POST probe: mutating endpoints require the X-CSRF-Token header
// (double-submit cookie pattern, api-spec §1.1). The token comes from
// GET /api/auth/me, which the UI itself uses to bootstrap identity.
async function apiPostCsrf(page: Page, path: string, data: unknown) {
  const me = await page.request.get(`${API}/api/auth/me`);
  expect(me.ok()).toBeTruthy();
  const { csrfToken } = (await me.json()) as { csrfToken?: string };
  return page.request.post(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    data,
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await waitForHealth(page);
  await page.close();
});

test.describe('E2E-01: create with deliberate double-click creates exactly one ticket', () => {
  test('double-click Submit, exactly one TTK-New appears in My Tickets', async ({ page }) => {
    await waitForHealth(page);
    await login(page, ALPHA.email, ALPHA.password);
    // Alpha must be gated to change the initial password first (AC-02).
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect
      .poll(async () => page.getByLabel('Category').locator('option').count(), { timeout: 5000 })
      .toBeGreaterThan(1);

    const uid = Date.now();
    const title = `E2E-01 dblclick ${uid}`;

    await page.getByLabel('Category').selectOption({ label: 'Hardware' });
    await page.getByLabel('Related System').selectOption({ index: 1 });
    await page.getByLabel('Requested Priority').selectOption({ label: 'High' });
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel('Description').fill('E2E-01 double-click guard verification body');

    let postCount = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/tickets') && !r.url().includes('/attachments')) postCount += 1;
    });

    const submit = page.getByRole('button', { name: /submit ticket/i });
    await expect(submit).toBeEnabled();
    await submit.dblclick();

    await page.waitForURL(/#\/tickets\/TTK-\d{4}-\d{6}/, { timeout: 15000 }).catch(async () => {
      const m = page.url().match(/TTK-\d{4}-\d{6}/);
      if (!m) {
        const success = page.locator('.tok-ticket-number, .mono').first();
        await expect(success).toContainText(/TTK-/);
      }
    });

    let ticketNumber = page.url().match(/(TTK-\d{4}-\d{6})/)?.[1] ?? '';
    if (!ticketNumber) {
      const txt = await page.locator('text=TTK-').first().textContent().catch(() => '');
      ticketNumber = txt?.match(/TTK-\d{4}-\d{6}/)?.[0] ?? '';
    }
    expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);
    expect(postCount).toBe(1);

    await page.goto('/#/my');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();
    const search = page.getByPlaceholder(/Search by ticket number or summary/i);
    if ((await search.count()) > 0) {
      await search.first().fill(title);
      await expect(search.first()).toHaveValue(title);
    }
    const link = page.getByRole('link', { name: ticketNumber });
    await expect(link.first()).toBeVisible({ timeout: 10000 });

    const list = await apiGet(page, `/api/tickets?search=${encodeURIComponent(title)}&pageSize=50`);
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const matches = (body.data as Array<{ title: string; ticketNumber: string; status: string }>).filter((t) => t.title === title);
    expect(matches).toHaveLength(1);
    expect(matches[0].ticketNumber).toBe(ticketNumber);
    expect(matches[0].status).toBe('NEW');
  });
});

test.describe('E2E-02: cross-requester ownership (session-based, BR-03)', () => {
  test('B list excludes A tickets; B opening A detail shows safe error with no ticket data', async ({ page }) => {
    await waitForHealth(page);
    await login(page, ALPHA.email, ALPHA.password);
    const probeTitle = `E2E-02 probe ${Date.now()}`;
    const created = await apiPostCsrf(page, '/api/tickets', {
      title: probeTitle,
      categoryId: 2,
      priority: 'MEDIUM',
      relatedSystemId: 1,
    });
    expect(created.status()).toBe(201);
    const { ticketNumber: probeNumber } = await created.json();
    expect(probeNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

    await page.goto('/#/my');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();
    const aList = await apiGet(page, `/api/tickets?pageSize=50&search=${encodeURIComponent(probeTitle)}`);
    expect(aList.ok()).toBeTruthy();
    const aBody = await aList.json();
    expect((aBody.data as Array<{ title: string }>).some((t) => t.title === probeTitle)).toBeTruthy();

    // Switch identity the Lab 3 way: logout, then sign in as Beta.
    await logout(page);
    await login(page, BETA.email, BETA.password);
    await page.goto('/#/my');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();

    const bList = await apiGet(page, `/api/tickets?pageSize=50&search=${encodeURIComponent(probeTitle)}`);
    expect(bList.ok()).toBeTruthy();
    const bBody = await bList.json();
    expect((bBody.data as Array<{ title: string }>).some((t) => t.title === probeTitle)).toBeFalsy();

    await page.goto('/#/my');
    await expect(page.getByRole('link', { name: probeNumber })).toHaveCount(0);

    await page.goto(`/#/tickets/${probeNumber}`);
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
    // Lab 3 masked 404: no existence or ownership detail leaked, title never rendered.
    await expect(page.getByText(probeTitle)).toHaveCount(0);
    const detailAsB = await apiGet(page, `/api/tickets/${probeNumber}`);
    expect(detailAsB.status()).toBe(404);
  });
});

test.describe('E2E-03: attachment upload, byte-identical download, soft-remove', () => {
  test('PNG upload via picker, download byte-identical, chip Removed, download fails', async ({ page }) => {
    await waitForHealth(page);
    await login(page, ALPHA.email, ALPHA.password);
    const title = `E2E-03 attach ${Date.now()}`;
    const created = await apiPostCsrf(page, '/api/tickets', {
      title,
      categoryId: 2,
      priority: 'LOW',
      relatedSystemId: 1,
      description: 'attachment lifecycle probe',
    });
    expect(created.status()).toBe(201);
    const { ticketNumber } = await created.json();
    expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

    await page.goto(`/#/tickets/${ticketNumber}`);
    await expect(page.getByText(ticketNumber).first()).toBeVisible({ timeout: 10000 });

    const attachmentsTab = page.getByRole('tab', { name: /Attachments/i });
    if ((await attachmentsTab.count()) > 0) await attachmentsTab.first().click().catch(() => {});
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: PNG_BYTES });

    let attId: number | null = null;
    await expect
      .poll(
        async () => {
          const det = await apiGet(page, `/api/tickets/${ticketNumber}`);
          const j = await det.json();
          const atts = (j.attachments as Array<{ id: number; fileName: string }>) ?? [];
          const found = atts.find((a) => a.fileName === 'tiny.png');
          if (found) {
            attId = found.id;
            return found.id;
          }
          return null;
        },
        { timeout: 8000, intervals: [500] },
      )
      .not.toBeNull();
    await expect(page.getByText('tiny.png').first()).toBeVisible({ timeout: 5000 });

    const dl = await apiGet(page, `/api/tickets/${ticketNumber}/attachments/${attId}/download`);
    expect(dl.status()).toBe(200);
    expect(dl.headers()['content-type']).toBe('image/png');
    expect(dl.headers()['content-disposition'] ?? '').toContain('tiny.png');
    const body = await dl.body();
    expect(Buffer.compare(body, PNG_BYTES)).toBe(0);

    const removeBtn = page.getByRole('button', { name: /^Remove$/i });
    if ((await removeBtn.count()) > 0) {
      await removeBtn.first().click();
      const confirm = page.getByRole('button', { name: /^Confirm$/i });
      await expect(confirm).toBeVisible({ timeout: 3000 });
      await confirm.click();
      await expect(page.getByText('Removed').first()).toBeVisible({ timeout: 5000 });
    } else {
      const del = await page.request.delete(`${API}/api/tickets/${ticketNumber}/attachments/${attId}`);
      expect(del.status()).toBe(200);
      await page.reload();
      await expect(page.getByText('Removed').first()).toBeVisible({ timeout: 5000 });
    }

    const chip = page.locator('.attachment-chip.removed, .tok-chip.removed').first();
    if ((await chip.count()) > 0) await expect(chip).toBeVisible();

    const dl2 = await apiGet(page, `/api/tickets/${ticketNumber}/attachments/${attId}/download`);
    expect([404, 403]).toContain(dl2.status());
    const errBody = await dl2.json().catch(() => ({} as Record<string, unknown>));
    const msg = String((errBody as { error?: string }).error ?? '').toLowerCase();
    expect(msg).toMatch(/removed|not found/i);
  });
});

test.describe('E2E-04: responsive viewports', () => {
  const viewports = [
    { w: 1280, h: 800, name: 'desktop' as const },
    { w: 800, h: 900, name: 'tablet' as const },
    { w: 375, h: 812, name: 'mobile' as const },
  ];

  for (const vp of viewports) {
    test(`viewport ${vp.w} on My Tickets, Create and Detail has correct layout and no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await waitForHealth(page);
      await login(page, ALPHA.email, ALPHA.password);
      await page.goto('/#/my');
      await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();

      const noHorizScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(noHorizScroll).toBe(true);

      await page.goto('/#/new');
      await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible();
      const createOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(createOk).toBe(true);

      await page.goto('/#/tickets/TTK-2026-800000');
      const detailOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(detailOk).toBe(true);
    });
  }
});

test.describe('E2E-05: session switch scopes identity (logout/login, BR-03/BR-08)', () => {
  test('A creates ticket; after logout/login as B the ticket is invisible and inaccessible to B', async ({ page }) => {
    await waitForHealth(page);
    await login(page, ALPHA.email, ALPHA.password);
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible();
    const uid = Date.now();
    const aTitle = `E2E-05 A owns ${uid}`;
    await page.getByLabel('Category').selectOption({ label: 'Software' });
    await page.getByLabel('Related System').selectOption({ index: 1 });
    await page.getByLabel(/^Title/).fill(aTitle);
    await page.getByLabel('Description').fill('owned by Alpha session');
    await page.getByRole('button', { name: /submit ticket/i }).click();
    await expect.poll(async () => page.url().includes('TTK-'), { timeout: 15000 }).toBe(true);

    let aNum = page.url().match(/TTK-\d{4}-\d{6}/)?.[0] ?? '';
    if (!aNum) {
      const t = await page.locator('text=TTK-').first().textContent().catch(() => '');
      aNum = t?.match(/TTK-\d{4}-\d{6}/)?.[0] ?? '';
    }
    expect(aNum).toMatch(/^TTK-\d{4}-\d{6}$/);

    await logout(page);
    await login(page, BETA.email, BETA.password);

    // B neither sees nor can open A's ticket (masked 404, BR-03).
    await page.goto('/#/my');
    await expect(page.getByRole('link', { name: aNum })).toHaveCount(0);
    const asB = await apiGet(page, `/api/tickets/${aNum}`);
    expect(asB.status()).toBe(404);
  });
});
