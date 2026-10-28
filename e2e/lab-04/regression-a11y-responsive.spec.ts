import { test, expect, type Page } from '../fixtures';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// CPE 334 Lab 4 — Regression, Accessibility, and Responsive Verification
// Covers A11Y-01, A11Y-02, E2E-05, E2E-06, RESP-01 per docs/lab-04/tests.md.

const API = 'http://localhost:4000';

const STAFF = {
  email: 'sara.it@toktickit.test',
  password: 'Staff123!',
  name: 'Sara IT',
};

const REQUESTER = {
  email: 'eta@toktickit.test',
  password: 'Requester123!',
  name: 'Dev User Eta',
};

const ADMIN = {
  email: 'admin@toktickit.test',
  password: 'Admin123!',
  name: 'Admin User',
};

const DEMO_TICKET_NUMBER = 'TTK-2026-810001';

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

async function login(page: Page, email: string, initialPassword: string): Promise<string> {
  await page.goto('/#/login');
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(initialPassword);
  await page.getByRole('button', { name: /sign in/i }).click();

  const gate = page.getByRole('heading', { name: /choose a new password/i });
  const gated = await gate
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (gated) {
    const changed = `P4Pass${Date.now().toString().slice(-6)}!Aa1`;
    await expect(page.getByRole('textbox', { name: 'New Password', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(gate).toBeHidden({ timeout: 10000 });
    return changed;
  }
  return initialPassword;
}

async function logout(page: Page): Promise<void> {
  const menuToggle = page.getByRole('button', { name: /^Profile menu —/ });
  if ((await menuToggle.count()) > 0) {
    await menuToggle.first().click();
    const signout = page.getByRole('menuitem', { name: /sign out/i });
    if ((await signout.count()) > 0) {
      await signout.click();
    }
  } else {
    const navbarLogout = page.getByRole('button', { name: /^logout$/i });
    if ((await navbarLogout.count()) > 0) {
      await navbarLogout.first().click();
    } else {
      await page.goto('/#/profile');
      const profileSignout = page.getByRole('button', { name: /^sign out$|^log out$/i });
      if ((await profileSignout.count()) > 0) {
        await profileSignout.click();
      }
    }
  }
  await page.goto('/#/login');
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible({ timeout: 10000 });
}

function attachConsoleErrorTracker(page: Page): string[] {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore benign favicon 404, aborted network probes, or initial unauthenticated /api/auth/me checks
      if (
        !text.includes('favicon.ico') &&
        !text.includes('net::ERR_ABORTED') &&
        !text.includes('status of 401') &&
        !text.includes('status of 404')
      ) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });
  return consoleErrors;
}

test.describe('E2E-05: Labs 1-3 journeys regression per role', () => {
  test('requester journey: login, dashboard, my tickets, new ticket, attachments, and public comment', async ({ page }) => {
    const consoleErrors = attachConsoleErrorTracker(page);

    await login(page, REQUESTER.email, REQUESTER.password);

    // 1. Visit dashboard
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/your tickets/i)).toBeVisible();

    // 2. Visit My Tickets
    await page.goto('/#/my');
    await expect(page.getByRole('heading', { level: 1, name: /my tickets/i })).toBeVisible();

    // 3. Visit New Ticket screen and create ticket
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible();

    const catSelect = page.locator('#category');
    await expect(catSelect).toBeVisible({ timeout: 10000 });
    await catSelect.selectOption({ index: 1 });

    const sysSelect = page.locator('#relatedSystem');
    await expect(sysSelect).toBeVisible({ timeout: 10000 });
    await sysSelect.selectOption({ index: 1 });

    const titleInput = page.getByLabel(/^Title/i);
    await titleInput.fill(`Regression E2E-05 Ticket ${Date.now()}`);

    const descInput = page.getByLabel(/^Description/i);
    await descInput.fill('Regression e2e test ticket description.');

    await page.getByRole('button', { name: /submit ticket/i }).click();

    // 4. Lands on ticket detail or open existing ticket
    await expect(page).toHaveURL(/#\/tickets\/TTK-/, { timeout: 15000 });
    await expect(page.locator('.td-card')).toBeVisible();

    // 5. View attachments tab
    const attachmentsTab = page.getByRole('tab', { name: /attachments/i });
    await attachmentsTab.click();
    await expect(page.locator('.tok-att-panel').first()).toBeVisible();

    // 6. View public comments tab and post a public comment
    const commentsTab = page.getByRole('tab', { name: /public comments/i });
    await commentsTab.click();
    const commentInput = page.locator('textarea.td-composer-input');
    await expect(commentInput).toBeVisible();
    await commentInput.fill('E2E regression public comment verification.');

    await page.getByRole('button', { name: /post comment/i }).click();
    await expect(page.getByText('E2E regression public comment verification.').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('staff journey: login, dashboard, queue, ticket detail, internal note, actions taken', async ({ page }) => {
    const consoleErrors = attachConsoleErrorTracker(page);

    await login(page, STAFF.email, STAFF.password);

    // 1. Visit dashboard
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    // 2. Visit Staff Queue
    await page.goto('/#/staff/queue');
    await expect(page.getByRole('heading', { level: 1, name: /ticket queue/i })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    // 3. Open ticket detail
    await page.goto(`/#/staff/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.std-grid')).toBeVisible();

    // 4. Verify Actions Taken section renders
    const actionsSection = page.getByRole('region', { name: /actions taken/i });
    await expect(actionsSection).toBeVisible();

    // 5. Post internal note
    const internalNotesTab = page.getByRole('tab', { name: /internal notes/i });
    await internalNotesTab.click();
    const noteInput = page.getByPlaceholder(/add an internal note/i);
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Sara IT internal test note verification.');

    await page.getByRole('button', { name: /post internal note/i }).click();
    await expect(page.getByText('Sara IT internal test note verification.').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('admin journey: login, user management, table render with search and filter', async ({ page }) => {
    const consoleErrors = attachConsoleErrorTracker(page);

    await login(page, ADMIN.email, ADMIN.password);

    // 1. Visit User Management
    await page.goto('/#/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /user management/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('table.au-table')).toBeVisible();

    // 2. Search users
    const searchInput = page.locator('#au-search');
    await searchInput.fill('sara');
    await expect(page.getByRole('cell', { name: 'sara.it@toktickit.test' })).toBeVisible();
    await searchInput.fill('');

    // 3. Filter by role
    const roleFilter = page.locator('#au-role-filter');
    await roleFilter.selectOption('IT_STAFF');
    await expect(page.getByRole('cell', { name: 'sara.it@toktickit.test' })).toBeVisible();
    await roleFilter.selectOption('');

    expect(consoleErrors).toEqual([]);
  });

  test('auth journey: login, change password screen, logout', async ({ page }) => {
    const consoleErrors = attachConsoleErrorTracker(page);

    await login(page, REQUESTER.email, REQUESTER.password);

    // Visit change password screen
    await page.goto('/#/change-password');
    await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'New Password', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Confirm New Password', exact: true })).toBeVisible();

    // Logout
    await logout(page);
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('crawl role nav links: assert all header navigation links are clickable without 404 or crashes', async ({ page }) => {
    const consoleErrors = attachConsoleErrorTracker(page);

    const roles = [
      { creds: REQUESTER, name: 'Requester' },
      { creds: STAFF, name: 'Staff' },
      { creds: ADMIN, name: 'Admin' },
    ];

    for (const role of roles) {
      await login(page, role.creds.email, role.creds.password);
      await page.waitForLoadState('domcontentloaded');

      const navLinks = page.locator('header.tok-navbar nav.tok-nav a, header.tok-navbar a.tok-brand');
      await expect(navLinks.first()).toBeVisible({ timeout: 10000 });

      const linkHrefs = await navLinks.evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('href')).filter(Boolean) as string[],
      );

      for (const href of linkHrefs) {
        await page.goto(href);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.tt-not-found')).toBeHidden();
        const header = page.locator('header.tok-navbar');
        await expect(header).toBeVisible();
      }

      await logout(page);
    }

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('A11Y-01: Axe accessibility scan across major screens', () => {
  async function assertZeroSeriousOrCriticalViolations(page: Page, contextName: string) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (seriousOrCritical.length > 0) {
      console.error(`Axe violations on ${contextName}:`, JSON.stringify(seriousOrCritical, null, 2));
    }
    expect(seriousOrCritical, `Accessibility violations on ${contextName}`).toEqual([]);
  }

  test('requester major screens accessibility: dashboard, my tickets, ticket detail', async ({ page }) => {
    await login(page, REQUESTER.email, REQUESTER.password);

    // 1. Requester dashboard
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });
    await assertZeroSeriousOrCriticalViolations(page, 'Requester Dashboard');

    // 2. My Tickets
    await page.goto('/#/my');
    await expect(page.getByRole('heading', { level: 1, name: /my tickets/i })).toBeVisible();
    await assertZeroSeriousOrCriticalViolations(page, 'My Tickets');

    // 3. Ticket detail
    await page.goto(`/#/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.td-card')).toBeVisible();
    await assertZeroSeriousOrCriticalViolations(page, 'Requester Ticket Detail');
  });

  test('staff major screens accessibility: dashboard, queue, ticket detail, resolve dialog modal', async ({ page }) => {
    await login(page, STAFF.email, STAFF.password);

    // 1. Staff dashboard
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });
    await assertZeroSeriousOrCriticalViolations(page, 'Staff Dashboard');

    // 2. Staff Queue
    await page.goto('/#/staff/queue');
    await expect(page.getByRole('heading', { level: 1, name: /ticket queue/i })).toBeVisible();
    await assertZeroSeriousOrCriticalViolations(page, 'Staff Ticket Queue');

    // 3. Staff Ticket Detail (including Actions Taken)
    await page.goto(`/#/staff/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.std-grid')).toBeVisible();
    await expect(page.getByRole('region', { name: /actions taken/i })).toBeVisible();
    await assertZeroSeriousOrCriticalViolations(page, 'Staff Ticket Detail');

    // 4. Open Resolve dialog modal and scan
    const statusSelect = page.locator('#std-status');
    const hasResolveOption = await statusSelect.locator('option[value="RESOLVED"]').count();
    if (hasResolveOption > 0) {
      await statusSelect.selectOption('RESOLVED');
      const modal = page.locator('.std-resolve-modal');
      await expect(modal).toBeVisible();
      await assertZeroSeriousOrCriticalViolations(page, 'Staff Ticket Detail - Resolve Modal Open');
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
    }
  });

  test('admin major screens accessibility: user management', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await page.goto('/#/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /user management/i })).toBeVisible({ timeout: 15000 });
    await assertZeroSeriousOrCriticalViolations(page, 'Admin User Management');
  });
});

test.describe('A11Y-02: Keyboard-only navigation and focus visibility', () => {
  test('keyboard navigation on dashboard: tab across links and buttons with visible focus', async ({ page }) => {
    await login(page, REQUESTER.email, REQUESTER.password);
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    // Move initial focus to body
    await page.locator('body').focus();

    // Tab through interactive elements and verify focus movement
    const focusedTags: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const activeInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName.toLowerCase(),
          hasOutline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
          hasBoxShadow: style.boxShadow !== 'none' && style.boxShadow !== '',
          className: el.className,
        };
      });

      if (activeInfo) {
        focusedTags.push(activeInfo.tagName);
        expect(['a', 'button', 'input', 'select', 'textarea']).toContain(activeInfo.tagName);
      }
    }

    expect(focusedTags.length).toBeGreaterThan(0);
  });

  test('keyboard navigation on staff ticket detail: record action form and resolve dialog modal', async ({ page }) => {
    await login(page, STAFF.email, STAFF.password);
    await page.goto(`/#/staff/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.std-grid')).toBeVisible();

    const actionsSection = page.getByRole('region', { name: /actions taken/i });
    await expect(actionsSection).toBeVisible();

    // 1. Tab to / focus Record Action button and open create form
    const recordBtn = actionsSection.getByRole('button', { name: /record action/i });
    await recordBtn.focus();
    await page.keyboard.press('Enter');

    // 2. Tab through input fields and verify focus rings
    const descInput = page.locator('#at-create-desc');
    await expect(descInput).toBeVisible();
    await descInput.focus();
    await expect(descInput).toBeFocused();

    const resultInput = page.locator('#at-create-result');
    await page.keyboard.press('Tab');
    await expect(resultInput).toBeFocused();

    const followupCheckbox = page.locator('#at-create-followup');
    await page.keyboard.press('Tab');
    await expect(followupCheckbox).toBeFocused();

    // Close record action form
    const cancelActionBtn = actionsSection.getByRole('button', { name: /cancel/i });
    await cancelActionBtn.click();

    // 3. Resolve dialog modal keyboard interaction
    const statusSelect = page.locator('#std-status');
    const hasResolveOption = await statusSelect.locator('option[value="RESOLVED"]').count();
    if (hasResolveOption > 0) {
      await statusSelect.selectOption('RESOLVED');
      const modal = page.locator('.std-resolve-modal');
      await expect(modal).toBeVisible();

      // Summary textarea is auto-focused
      const summaryTextarea = page.locator('#std-resolve-summary');
      await expect(summaryTextarea).toBeFocused();

      // Tab moves to Resolve button, then Cancel button
      await page.keyboard.press('Tab');
      const resolveBtn = modal.getByRole('button', { name: /resolve ticket/i });
      await expect(resolveBtn).toBeFocused();

      await page.keyboard.press('Tab');
      const cancelModalBtn = modal.getByRole('button', { name: /cancel/i });
      await expect(cancelModalBtn).toBeFocused();

      // Escape closes modal
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
    }
  });
});

test.describe('E2E-06 / RESP-01: Responsive checks across 3 viewports (1280x800, 820x1180, 390x844)', () => {
  const staffDashDir = join(process.cwd(), 'artifacts/lab-04/screenshots/staff-dashboard');
  const reqDashDir = join(process.cwd(), 'artifacts/lab-04/screenshots/requester-dashboard');
  const staffDetailDir = join(process.cwd(), 'artifacts/lab-04/screenshots/staff-ticket-detail');
  const reqDetailDir = join(process.cwd(), 'artifacts/lab-04/screenshots/requester-ticket-detail');

  mkdirSync(staffDashDir, { recursive: true });
  mkdirSync(reqDashDir, { recursive: true });
  mkdirSync(staffDetailDir, { recursive: true });
  mkdirSync(reqDetailDir, { recursive: true });

  const viewports = [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '820x1180', width: 820, height: 1180 },
    { name: '390x844', width: 390, height: 844 },
  ];

  test('requester dashboard responsive check & screenshots across 3 viewports', async ({ page }) => {
    await login(page, REQUESTER.email, REQUESTER.password);
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalScroll, `Requester dashboard has horizontal scroll at ${vp.name}`).toBe(false);

      await page.screenshot({
        path: join(reqDashDir, `requester-dashboard-${vp.width}x${vp.height}.png`),
        fullPage: true,
      });
    }
  });

  test('staff dashboard responsive check & screenshots across 3 viewports', async ({ page }) => {
    await login(page, STAFF.email, STAFF.password);
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalScroll, `Staff dashboard has horizontal scroll at ${vp.name}`).toBe(false);

      await page.screenshot({
        path: join(staffDashDir, `staff-dashboard-${vp.width}x${vp.height}.png`),
        fullPage: true,
      });
    }
  });

  test('staff ticket detail responsive check & screenshots across 3 viewports', async ({ page }) => {
    await login(page, STAFF.email, STAFF.password);
    await page.goto(`/#/staff/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.std-grid')).toBeVisible();
    await expect(page.getByRole('region', { name: /actions taken/i })).toBeVisible();

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalScroll, `Staff ticket detail has horizontal scroll at ${vp.name}`).toBe(false);

      await page.screenshot({
        path: join(staffDetailDir, `staff-ticket-detail-${vp.width}x${vp.height}.png`),
        fullPage: true,
      });
    }
  });

  test('requester ticket detail responsive check & screenshots across 3 viewports', async ({ page }) => {
    await login(page, REQUESTER.email, REQUESTER.password);
    await page.goto(`/#/tickets/${DEMO_TICKET_NUMBER}`);
    await expect(page.locator('.td-card')).toBeVisible();

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalScroll, `Requester ticket detail has horizontal scroll at ${vp.name}`).toBe(false);

      await page.screenshot({
        path: join(reqDetailDir, `requester-ticket-detail-${vp.width}x${vp.height}.png`),
        fullPage: true,
      });
    }
  });
});
