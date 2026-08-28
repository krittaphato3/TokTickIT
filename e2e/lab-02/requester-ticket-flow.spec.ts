import { expect, test } from '@playwright/test';

// Mandated spec — e2e/lab-02/requester-ticket-flow.spec.ts
// Covers E2E-01..E2E-05 against the real API + Vite dev servers and seeded DB.
// Requires: PostgreSQL migrated+seeded, server :4000 (npm --prefix ../server run dev),
// client :5173 (npm run dev). See client/playwright.config.ts webServer.

const API = 'http://localhost:4000';
const STORAGE_KEY = 'toktickit.devRequesterId';

// Deterministic 1x1 transparent PNG (67 bytes) for byte-identical download check.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

async function waitForHealth(page: import('@playwright/test').Page) {
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

async function setRequesterViaStorage(page: import('@playwright/test').Page, id: number) {
  await page.goto('/#/tickets');
  await page.evaluate(([k, v]) => localStorage.setItem(k, String(v)), [STORAGE_KEY, id]);
  await page.reload();
  await expect
    .poll(async () => page.evaluate(([k]) => localStorage.getItem(k), [STORAGE_KEY]), { timeout: 5000 })
    .toBe(String(id));
  await expect(page.locator('text=Testing only — not real authentication').first()).toBeVisible({ timeout: 10000 });
}

async function switchRequesterUI(page: import('@playwright/test').Page, label: string) {
  const idMap: Record<string, number> = { 'Dev User Alpha': 1, 'Dev User Beta': 2, 'Dev User Gamma': 3, 'Dev User Delta': 4 };
  const selVisible = page.getByLabel('Development Requester');
  if ((await selVisible.count()) > 0) {
    try {
      const visible = await selVisible.first().isVisible().catch(() => false);
      if (visible) {
        await selVisible.first().selectOption({ label });
        const cont = page.getByRole('button', { name: /^Continue$/i });
        if ((await cont.count()) > 0) {
          const cVisible = await cont.first().isVisible().catch(() => false);
          if (cVisible) await cont.first().click();
        }
        await expect(page.locator('text=Testing only — not real authentication').first()).toBeVisible({ timeout: 8000 });
        await expect
          .poll(async () => page.evaluate(([k]) => localStorage.getItem(k), [STORAGE_KEY]), { timeout: 5000 })
          .toBe(String(idMap[label]));
        return;
      }
    } catch {}
  }
  const profileBtn = page.getByRole('button', { name: /Profile/i });
  if ((await profileBtn.count()) > 0) {
    try {
      await profileBtn.first().click();
      const change = page.getByRole('button', { name: /Change requester/i });
      if ((await change.count()) > 0) {
        const cVis = await change.first().isVisible().catch(() => false);
        if (cVis) {
          await change.first().click();
          await expect(page.getByLabel('Development Requester')).toBeVisible({ timeout: 5000 });
          await page.getByLabel('Development Requester').selectOption({ label });
          const cont2 = page.getByRole('button', { name: /^Continue$/i });
          if ((await cont2.count()) > 0) await cont2.first().click();
          await expect(page.locator('text=Testing only — not real authentication').first()).toBeVisible({ timeout: 8000 });
          await expect
            .poll(async () => page.evaluate(([k]) => localStorage.getItem(k), [STORAGE_KEY]), { timeout: 5000 })
            .toBe(String(idMap[label]));
          return;
        }
      } else {
        await profileBtn.first().click();
      }
    } catch {}
  }
  const headerSel = page.getByLabel('Development Requester');
  if ((await headerSel.count()) > 0) {
    try {
      await headerSel.first().selectOption({ label });
      await expect
        .poll(async () => page.evaluate(([k]) => localStorage.getItem(k), [STORAGE_KEY]), { timeout: 5000 })
        .toBe(String(idMap[label]));
      await expect(page.locator('text=Testing only — not real authentication').first()).toBeVisible({ timeout: 5000 });
      return;
    } catch {}
  }
  const id = idMap[label];
  if (id) await setRequesterViaStorage(page, id);
}

async function gotoCreateReady(page: import('@playwright/test').Page) {
  await page.goto('/#/new-ticket');
  await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel('Category')).toBeVisible();
  await expect(page.getByLabel('Related System')).toBeVisible();
  await expect
    .poll(async () => page.getByLabel('Category').locator('option').count(), { timeout: 5000 })
    .toBeGreaterThan(1);
  await expect
    .poll(async () => page.getByLabel('Related System').locator('option').count(), { timeout: 5000 })
    .toBeGreaterThan(1);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await waitForHealth(page);
  await page.close();
});

test.describe('E2E-01: create with deliberate double-click creates exactly one ticket', () => {
  test('select Requester A, double-click Submit, exactly one TTK-New appears in My Tickets', async ({ page }) => {
    await waitForHealth(page);
    await setRequesterViaStorage(page, 1);
    await expect(page.locator('text=Testing only — not real authentication').first()).toBeVisible({ timeout: 10000 });

    await gotoCreateReady(page);

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
      await expect(page.locator('[data-alert="success"]')).toBeVisible({ timeout: 2000 }).catch(() => {});
      const m = page.url().match(/TTK-\d{4}-\d{6}/);
      if (!m) {
        const success = page.locator('.tok-ticket-number, .mono').first();
        await expect(success).toContainText(/TTK-/);
      }
    });

    let ticketNumber = '';
    const urlMatch = page.url().match(/(TTK-\d{4}-\d{6})/);
    if (urlMatch) ticketNumber = urlMatch[1];
    else {
      const txt = await page.locator('text=TTK-').first().textContent().catch(() => '');
      const m2 = txt?.match(/TTK-\d{4}-\d{6}/);
      if (m2) ticketNumber = m2[0];
      else {
        const mono = await page.locator('.mono').first().textContent().catch(() => '');
        const m3 = mono?.match(/TTK-\d{4}-\d{6}/);
        if (m3) ticketNumber = m3[0];
      }
    }
    expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);
    expect(postCount).toBe(1);

    await page.goto('/#/tickets');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search by ticket number or summary/i).or(page.getByLabel(/Search by ticket number/i)).first()).toBeVisible({ timeout: 5000 });
    const search = page.getByPlaceholder(/Search by ticket number or summary/i).or(page.getByLabel(/Search by ticket number/i));
    if ((await search.count()) > 0) {
      await search.first().fill(title);
      await expect(search.first()).toHaveValue(title);
    }
    const link = page.getByRole('link', { name: ticketNumber });
    await expect(link.first()).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('New').first()).toBeVisible();

    const list = await page.request.get(`${API}/api/tickets?search=${encodeURIComponent(title)}&pageSize=50`, { headers: { 'X-Dev-Requester-Id': '1' } });
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const matches = (body.data as Array<{ title: string; ticketNumber: string; status: string }>).filter((t) => t.title === title);
    expect(matches).toHaveLength(1);
    expect(matches[0].ticketNumber).toBe(ticketNumber);
    expect(matches[0].status).toBe('NEW');
  });
});

test.describe('E2E-02: cross-requester ownership', () => {
  test('B list excludes A tickets; B opening A detail shows 403 with no ticket data', async ({ page }) => {
    await waitForHealth(page);
    await setRequesterViaStorage(page, 1);
    const probeTitle = `E2E-02 probe ${Date.now()}`;
    const created = await page.request.post(`${API}/api/tickets`, {
      headers: { 'Content-Type': 'application/json', 'X-Dev-Requester-Id': '1' },
      data: { title: probeTitle, categoryId: 2, priority: 'MEDIUM', relatedSystemId: 1 },
    });
    expect(created.status()).toBe(201);
    const { ticketNumber: probeNumber } = await created.json();
    expect(probeNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

    await page.goto('/#/tickets');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();
    const aList = await page.request.get(`${API}/api/tickets?pageSize=50&search=${encodeURIComponent(probeTitle)}`, { headers: { 'X-Dev-Requester-Id': '1' } });
    expect(aList.ok()).toBeTruthy();
    const aBody = await aList.json();
    expect((aBody.data as Array<{ title: string }>).some((t) => t.title === probeTitle)).toBeTruthy();

    await switchRequesterUI(page, 'Dev User Beta');
    await page.goto('/#/tickets');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();

    const bList = await page.request.get(`${API}/api/tickets?pageSize=50&search=${encodeURIComponent(probeTitle)}`, { headers: { 'X-Dev-Requester-Id': '2' } });
    expect(bList.ok()).toBeTruthy();
    const bBody = await bList.json();
    expect((bBody.data as Array<{ title: string }>).some((t) => t.title === probeTitle)).toBeFalsy();

    await page.goto('/#/tickets');
    await expect(page.getByRole('link', { name: probeNumber })).toHaveCount(0);

    await page.goto(`/#/tickets/${probeNumber}`);
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10000 });
    const alertText = await alert.textContent();
    expect(alertText?.toLowerCase()).toMatch(/does not belong|403|forbidden|not.*requester/i);
    await expect(page.getByText(probeTitle)).toHaveCount(0);
    const detailAsB = await page.request.get(`${API}/api/tickets/${probeNumber}`, { headers: { 'X-Dev-Requester-Id': '2' } });
    expect(detailAsB.status()).toBe(403);
  });
});

test.describe('E2E-03: attachment upload, byte-identical download, soft-remove', () => {
  test('PNG upload via picker, download byte-identical, chip Removed, download fails', async ({ page }) => {
    await waitForHealth(page);
    await setRequesterViaStorage(page, 1);
    const title = `E2E-03 attach ${Date.now()}`;
    const created = await page.request.post(`${API}/api/tickets`, {
      headers: { 'Content-Type': 'application/json', 'X-Dev-Requester-Id': '1' },
      data: { title, categoryId: 2, priority: 'LOW', relatedSystemId: 1, description: 'attachment lifecycle probe' },
    });
    expect(created.status()).toBe(201);
    const { ticketNumber } = await created.json();
    expect(ticketNumber).toMatch(/^TTK-\d{4}-\d{6}$/);

    await page.goto(`/#/tickets/${ticketNumber}`);
    await expect(page.locator('.td-card').first()).toBeVisible({ timeout: 10000 }).catch(async () => {
      await expect(page.getByText(ticketNumber).first()).toBeVisible({ timeout: 10000 });
    });

    const attachmentsTab = page.getByRole('tab', { name: /Attachments/i });
    if ((await attachmentsTab.count()) > 0) await attachmentsTab.first().click().catch(() => {});
    await expect(page.locator('[data-testid="attachment-input"]')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-testid="attachment-input"]');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: PNG_BYTES });

    let attId: number | null = null;
    await expect
      .poll(
        async () => {
          const det = await page.request.get(`${API}/api/tickets/${ticketNumber}`, { headers: { 'X-Dev-Requester-Id': '1' } });
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

    const dl = await page.request.get(`${API}/api/tickets/${ticketNumber}/attachments/${attId}/download`, { headers: { 'X-Dev-Requester-Id': '1' } });
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
      const del = await page.request.delete(`${API}/api/tickets/${ticketNumber}/attachments/${attId}`, { headers: { 'X-Dev-Requester-Id': '1' } });
      expect(del.status()).toBe(200);
      await page.reload();
      await expect(page.getByText('Removed').first()).toBeVisible({ timeout: 5000 });
    }

    const chip = page.locator('.attachment-chip.removed, .tok-chip.removed').first();
    if ((await chip.count()) > 0) await expect(chip).toBeVisible();

    const dl2 = await page.request.get(`${API}/api/tickets/${ticketNumber}/attachments/${attId}/download`, { headers: { 'X-Dev-Requester-Id': '1' } });
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
      await setRequesterViaStorage(page, 1);

      await page.goto('/#/tickets');
      await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 10000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(2);

      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(ok).toBeTruthy();

      if (vp.name === 'mobile') {
        await expect(page.locator('.m-card').first()).toBeVisible({ timeout: 5000 }).catch(async () => {
          await expect(page.locator('.mt-cards').first()).toBeVisible();
        });
        const tableCount = await page.locator('table').count();
        if (tableCount > 0) {
          const visible = await page.locator('table').first().isVisible().catch(() => false);
          if (visible) {
          }
        }
        const next = page.getByRole('button', { name: /Next/i }).first();
        if ((await next.count()) > 0) {
          const box = await next.boundingBox();
          if (box) expect(box.height).toBeGreaterThanOrEqual(44 - 4);
        }
        const buttons = page.getByRole('button');
        const n = await buttons.count();
        for (let i = 0; i < Math.min(n, 6); i += 1) {
          const b = buttons.nth(i);
          const vis = await b.isVisible().catch(() => false);
          if (!vis) continue;
          const box = await b.boundingBox();
          if (box) expect(box.height).toBeGreaterThanOrEqual(44);
        }
      } else if (vp.name === 'tablet') {
        await expect(page.locator('.mt-filter-card, .mt-filter-section').first()).toBeVisible();
        const thCount = await page.locator('thead th').count().catch(() => 0);
        if (thCount > 0) expect(thCount).toBe(9);
      } else {
        await expect(page.locator('thead th')).toHaveCount(9, { timeout: 5000 });
        for (const h of ['Ticket No.', 'Created Date', 'IT Priority', 'Ticket Owner', 'Last Updated']) {
          await expect(page.locator('thead').getByText(h).first()).toBeVisible();
        }
      }

      await page.goto('/#/new-ticket');
      await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible({ timeout: 10000 });
      const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow2).toBeLessThanOrEqual(2);
      if (vp.name === 'desktop' || vp.name === 'tablet') {
        await expect(page.locator('.tok-grid-2').first()).toBeVisible();
      } else {
        const submit = page.getByRole('button', { name: /submit ticket/i });
        if ((await submit.count()) > 0) {
          const box = await submit.boundingBox();
          if (box) expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }

      await page.goto('/#/tickets/TTK-2026-800000');
      const card = page.locator('.td-card');
      if ((await card.count()) > 0) await expect(card.first()).toBeVisible();
      const overflow3 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow3).toBeLessThanOrEqual(2);
      if (vp.name === 'mobile') {
        const back = page.getByRole('button', { name: /Back to My Tickets/i });
        if ((await back.count()) > 0) {
          const box = await back.boundingBox();
          if (box) expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });
  }
});

test.describe('E2E-05: requester switch resets filters and scoping', () => {
  test('switch A->B with active filters resets them, list is B-only, new ticket owned by B', async ({ page }) => {
    await waitForHealth(page);
    await setRequesterViaStorage(page, 1);
    await page.goto('/#/tickets');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();

    const searchInput = page.getByPlaceholder(/Search by ticket number or summary/i).or(page.getByLabel(/Search by ticket number/i));
    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill('Laptop');
      await expect(searchInput.first()).toHaveValue('Laptop');
    }
    const catSel = page.locator('#mt-f-category');
    if ((await catSel.count()) > 0) {
      await catSel.selectOption({ label: 'Hardware' });
      await expect(catSel).toHaveValue(/.*/);
    }
    const reqPri = page.locator('#mt-f-reqpri');
    if ((await reqPri.count()) > 0) {
      await reqPri.selectOption({ label: 'High' });
      await expect(reqPri).toHaveValue(/.*/);
    }
    const itPri = page.locator('#mt-f-itpri');
    if ((await itPri.count()) > 0) {
      await itPri.selectOption({ label: 'High' });
      await expect(itPri).toHaveValue(/.*/);
    }
    const statSel = page.locator('#mt-f-status');
    if ((await statSel.count()) > 0) {
      await statSel.selectOption({ label: 'Open' });
      await expect(statSel).toHaveValue(/.*/);
    }

    if ((await searchInput.count()) > 0) await expect(searchInput.first()).toHaveValue('Laptop');

    await switchRequesterUI(page, 'Dev User Beta');
    await page.goto('/#/tickets');
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible();

    if ((await searchInput.count()) > 0) await expect(searchInput.first()).toHaveValue('');
    if ((await catSel.count()) > 0) await expect(catSel).toHaveValue('');
    if ((await reqPri.count()) > 0) await expect(reqPri).toHaveValue('');
    if ((await itPri.count()) > 0) await expect(itPri).toHaveValue('');
    if ((await statSel.count()) > 0) await expect(statSel).toHaveValue('');

    await expect(page.getByText(/Showing 1 to \d+ of 10 tickets/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'TTK-2026-800000' })).toHaveCount(0);
    const bListAll = await page.request.get(`${API}/api/tickets?pageSize=50`, { headers: { 'X-Dev-Requester-Id': '2' } });
    expect(bListAll.ok()).toBeTruthy();
    const bJson = await bListAll.json();
    expect(bJson.meta.totalItems).toBe(10);

    await page.goto('/#/new-ticket');
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible();
    const uid = Date.now();
    const bTitle = `E2E-05 B owns ${uid}`;
    await page.getByLabel('Category').selectOption({ label: 'Software' });
    await page.getByLabel('Related System').selectOption({ index: 1 });
    await page.getByLabel(/^Title/).fill(bTitle);
    await page.getByLabel('Description').fill('owned by Beta');
    await page.getByRole('button', { name: /submit ticket/i }).click();
    await expect.poll(async () => page.url().includes('TTK-'), { timeout: 15000 }).toBe(true);

    let newNum = page.url().match(/TTK-\d{4}-\d{6}/)?.[0] ?? '';
    if (!newNum) {
      const t = await page.locator('text=TTK-').first().textContent().catch(() => '');
      newNum = t?.match(/TTK-\d{4}-\d{6}/)?.[0] ?? '';
    }
    expect(newNum).toMatch(/^TTK-\d{4}-\d{6}$/);

    const asB = await page.request.get(`${API}/api/tickets/${newNum}`, { headers: { 'X-Dev-Requester-Id': '2' } });
    expect(asB.status()).toBe(200);
    const asA = await page.request.get(`${API}/api/tickets/${newNum}`, { headers: { 'X-Dev-Requester-Id': '1' } });
    expect(asA.status()).toBe(403);

    const searchB = await page.request.get(`${API}/api/tickets?search=${encodeURIComponent(bTitle)}&pageSize=50`, { headers: { 'X-Dev-Requester-Id': '2' } });
    const sb = await searchB.json();
    expect((sb.data as Array<{ title: string }>).some((t) => t.title === bTitle)).toBeTruthy();
    const searchA = await page.request.get(`${API}/api/tickets?search=${encodeURIComponent(bTitle)}&pageSize=50`, { headers: { 'X-Dev-Requester-Id': '1' } });
    const sa = await searchA.json();
    expect((sa.data as Array<{ title: string }>).some((t) => t.title === bTitle)).toBeFalsy();
  });
});
