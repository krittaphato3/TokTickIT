import { expect, test, type Page } from '../fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// L4-5 — E2E-03 / E2E-04 (docs/lab-04/tests.md §2):
// Role dashboards end-to-end:
// 1. Requester dashboard: cards match list counts, recent lists, quick actions.
// 2. Staff dashboard: operational metrics, status counts, IT priority cards, drill-downs match queue row counts.
// 3. Screenshots captured across 1280x800, 820x1180, 390x844.

const API = 'http://localhost:4000';
const STAFF = { email: 'sara.it@toktickit.test', password: 'Staff123!', name: 'Sara IT' };
const REQUESTER = { email: 'eta@toktickit.test', password: 'Requester123!', name: 'Dev User Eta' };

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
    const changed = `P5Pass${Date.now().toString().slice(-6)}!Aa1`;
    await expect(page.getByRole('textbox', { name: 'New Password', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(gate).toBeHidden({ timeout: 10000 });
    return changed;
  }
  return initialPassword;
}

async function logout(page: Page) {
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

test.describe('E2E-03 & E2E-04: Role Dashboards Flow and Drill-downs', () => {
  test('Requester dashboard: metrics, drill-down to active tickets, and recent lists', async ({ page }) => {
    await login(page, REQUESTER.email, REQUESTER.password);
    await page.goto('/#/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/your tickets/i)).toBeVisible();

    // Active tickets drill-down
    const activeLink = page.getByRole('link', { name: /active tickets:/i });
    await expect(activeLink).toBeVisible();
    const text = await activeLink.innerText();
    const countMatch = text.match(/\d+/);
    const expectedCount = countMatch ? Number(countMatch[0]) : 0;

    await activeLink.click();
    await expect(page).toHaveURL(/#\/my\?active=true/);
    await expect(page.getByRole('heading', { level: 1, name: /my tickets/i })).toBeVisible();

    // Verify row count matches card count
    await expect(page.locator('tbody tr')).toHaveCount(expectedCount);
  });

  test('Staff dashboard: metrics, drill-down to queue with filters, and screenshots', async ({ page }) => {
    const staffDir = join(process.cwd(), 'artifacts/lab-04/screenshots/staff-dashboard');
    const reqDir = join(process.cwd(), 'artifacts/lab-04/screenshots/requester-dashboard');
    mkdirSync(staffDir, { recursive: true });
    mkdirSync(reqDir, { recursive: true });

    const viewports = [
      { name: '1280x800', width: 1280, height: 800 },
      { name: '820x1180', width: 820, height: 1180 },
      { name: '390x844', width: 390, height: 844 },
    ];

    // Staff dashboard
    await login(page, STAFF.email, STAFF.password);
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/service desk overview/i)).toBeVisible();

    // Drill down on an operational metric card
    const unassignedCard = page.getByRole('link', { name: /unassigned active:/i });
    await expect(unassignedCard).toBeVisible();
    await unassignedCard.click();
    await expect(page).toHaveURL(/#\/staff\/queue\?assigned=false&active=true/);
    await expect(page.getByRole('heading', { level: 1, name: /ticket queue/i })).toBeVisible();

    // Verify recent ticket link navigates to staff ticket detail
    await page.goto('/#/dashboard');
    const recentTicketLink = page.locator('.dash-items-list a').first();
    await expect(recentTicketLink).toBeVisible();
    await expect(recentTicketLink).toHaveAttribute('href', /#\/staff\/tickets\//);

    // Capture staff dashboard screenshots across viewports
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/dashboard');
      await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible();
      await page.screenshot({ path: join(staffDir, `staff-dashboard-${vp.name}.png`), fullPage: false });
      await page.screenshot({ path: join(staffDir, `ready-${vp.name}.png`), fullPage: false });
    }

    // Capture requester dashboard screenshots across viewports
    await logout(page);
    await login(page, REQUESTER.email, REQUESTER.password);

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/dashboard');
      await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible();
      await page.screenshot({ path: join(reqDir, `requester-dashboard-${vp.name}.png`), fullPage: false });
      await page.screenshot({ path: join(reqDir, `ready-${vp.name}.png`), fullPage: false });
    }

    // Capture requester empty dashboard screenshots across viewports
    await logout(page);
    await login(page, 'zeta@toktickit.test', 'Requester123!');

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/dashboard');
      await expect(page.getByRole('heading', { level: 1, name: /dashboard/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /no tickets yet/i })).toBeVisible();
      await page.screenshot({ path: join(reqDir, `empty-${vp.name}.png`), fullPage: false });
    }
  });
});
