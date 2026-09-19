// Lab 3 evidence capture (npx tsx e2e/capture-lab03-evidence.ts — run with the
// Compose stack up: client :5173, API :4000). Drives the REAL UI at desktop,
// tablet and mobile widths and writes PNGs into
// artifacts/lab-03/screenshots/<category>/ for the PR record. Not part of the
// automated suites; every image is a live capture of the seeded database.
//
// Seed logins all carry mustChangePassword=true (BR-02), so each role journey
// performs the mandatory first-login change once; that flow is itself part of
// the captured evidence (authentication category).
import { chromium, type Page } from '@playwright/test';
import path from 'node:path';
import { resetSeededUsers } from './global-setup';

const BASE = 'http://localhost:5173';
const ROOT = path.resolve('artifacts', 'lab-03', 'screenshots');

const INITIAL: Record<string, string> = {
  'alpha@toktickit.test': 'Requester123!',
  'epsilon@toktickit.test': 'Requester123!',
  'sara.it@toktickit.test': 'Staff123!',
  'tom.it@toktickit.test': 'Staff123!',
  'admin@toktickit.test': 'Admin123!',
};
const NEWPASS = 'NewPass123!';

async function shoot(page: Page, dir: string, name: string) {
  await page.waitForTimeout(500);
  const out = path.join(ROOT, dir);
  await page.screenshot({ path: path.join(out, name), fullPage: false });
  console.log('saved', `${dir}/${name}`);
}

async function gotoLogin(page: Page) {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-email', { timeout: 15_000 });
}

/** Login through the UI; completes the mandatory first-login change when the
 * gate appears. Returns 'changed' when the gate flow ran, 'direct' otherwise. */
async function login(page: Page, email: string, password: string): Promise<'changed' | 'direct'> {
  await gotoLogin(page);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('.tok-auth-submit');
  await page.waitForTimeout(1_000);
  if (await page.isVisible('#cp-new')) {
    // Mandatory first-login gate renders New + Confirm only (no current).
    await page.fill('#cp-new', NEWPASS);
    await page.fill('#cp-confirm', NEWPASS);
    await page.click('.tok-auth-submit');
    await page.waitForTimeout(1_400);
    return 'changed';
  }
  return 'direct';
}

async function openStaffDetail(page: Page) {
  await page.goto(`${BASE}/#/staff/queue`);
  await page.waitForSelector('h1:has-text("Ticket Queue")', { timeout: 15_000 });
  await page.waitForSelector('tbody tr', { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.click('tbody tr >> nth=0');
  await page.waitForTimeout(1_200);
}

(async () => {
  await resetSeededUsers();
  const browser = await chromium.launch();

  // ---------- authentication ----------
  {
    const page = await browser.newPage();
    // Login at all three widths.
    for (const [w, h, tag] of [[1440, 900, 'desktop'], [834, 1112, 'tablet'], [375, 812, 'mobile']] as const) {
      await page.setViewportSize({ width: w, height: h });
      await gotoLogin(page);
      await shoot(page, 'authentication', `login-${tag}.png`);
    }
    // Safe failure: wrong password.
    await page.fill('#login-email', 'alpha@toktickit.test');
    await page.fill('#login-password', 'WrongPass1!');
    await page.click('.tok-auth-submit');
    await page.waitForSelector('.tok-auth-alert.error', { timeout: 8_000 });
    await shoot(page, 'authentication', 'login-error-mobile.png');
    // Inactive account rejection (epsilon is seeded inactive).
    await page.fill('#login-email', 'epsilon@toktickit.test');
    await page.fill('#login-password', INITIAL['epsilon@toktickit.test']);
    await page.click('.tok-auth-submit');
    await page.waitForSelector('.tok-auth-alert.error', { timeout: 8_000 });
    await shoot(page, 'authentication', 'login-inactive-mobile.png');
    await page.close();

    // Mandatory first-login password change (staff account, gated).
    const sara = await browser.newPage();
    await sara.setViewportSize({ width: 1440, height: 900 });
    await gotoLogin(sara);
    await sara.fill('#login-email', 'sara.it@toktickit.test');
    await sara.fill('#login-password', INITIAL['sara.it@toktickit.test']);
    await sara.click('.tok-auth-submit');
    await sara.waitForSelector('#cp-new', { timeout: 15_000 });
    await shoot(sara, 'authentication', 'password-change-desktop.png');
    await sara.fill('#cp-new', NEWPASS);
    await sara.fill('#cp-confirm', NEWPASS);
    await sara.click('.tok-auth-submit');
    await sara.waitForTimeout(1_600);
    // Authenticated shell (staff role nav + account menu identity).
    await shoot(sara, 'authentication', 'shell-staff-desktop.png');
    // Logout + sign-out toast; protected access afterwards redirects to login.
    await sara.click('[aria-label^="Profile menu —"]');
    await sara.waitForTimeout(300);
    await sara.getByRole('menuitem', { name: 'Sign out' }).click();
    await sara.waitForTimeout(1_200);
    await sara.setViewportSize({ width: 375, height: 812 });
    await shoot(sara, 'authentication', 'logout-toast-mobile.png');
    await sara.close();
  }

  // ---------- staff queue + detail ----------
  {
    const page = await browser.newPage();
    await login(page, 'tom.it@toktickit.test', INITIAL['tom.it@toktickit.test']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/#/staff/queue`);
    await page.waitForSelector('tbody tr', { timeout: 15_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'staff-queue', 'staff-queue-desktop.png');

    // Filters popover (Owner search + Priority + Status in one menu).
    await page.getByRole('button', { name: /Filters/i }).click();
    await page.waitForTimeout(500);
    await shoot(page, 'staff-queue', 'staff-queue-filters-desktop.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // No-results state.
    await page.fill('#sq-search', 'zzz-no-such-ticket');
    await page.waitForTimeout(1_000);
    await shoot(page, 'staff-queue', 'staff-queue-no-results-desktop.png');
    await page.fill('#sq-search', '');
    await page.waitForTimeout(800);

    // Tablet + mobile queue.
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.waitForTimeout(500);
    await shoot(page, 'staff-queue', 'staff-queue-tablet.png');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await shoot(page, 'staff-queue', 'staff-queue-mobile.png');

    // Ticket detail at all three widths (first seeded queue row).
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStaffDetail(page);
    await shoot(page, 'staff-ticket-detail', 'staff-ticket-detail-desktop.png');
    await page.setViewportSize({ width: 834, height: 1112 });
    await shoot(page, 'staff-ticket-detail', 'staff-ticket-detail-tablet.png');
    await page.setViewportSize({ width: 375, height: 812 });
    await shoot(page, 'staff-ticket-detail', 'staff-ticket-detail-mobile.png');
    await page.close();
  }

  // ---------- user management + forbidden state ----------
  {
    const page = await browser.newPage();
    await login(page, 'admin@toktickit.test', INITIAL['admin@toktickit.test']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/#/admin/users`);
    await page.waitForSelector('tbody tr', { timeout: 15_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'user-management', 'user-management-desktop.png');

    // Create user modal (X close button visible top-right).
    await page.getByRole('button', { name: /Create user/i }).first().click();
    await page.waitForTimeout(500);
    await shoot(page, 'user-management', 'user-management-create-desktop.png');
    await page.click('[aria-label="Close"]');
    await page.waitForTimeout(300);

    // No-results state for the user search.
    await page.fill('#au-search', 'zzz-no-such-user');
    await page.waitForTimeout(1_000);
    await shoot(page, 'user-management', 'user-management-no-results-desktop.png');
    await page.fill('#au-search', '');
    await page.waitForTimeout(800);

    // Tablet + mobile.
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.waitForTimeout(500);
    await shoot(page, 'user-management', 'user-management-tablet.png');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await shoot(page, 'user-management', 'user-management-mobile.png');
    await page.close();

    // Forbidden: a requester visiting #/admin/users gets the safe block card.
    const alpha = await browser.newPage();
    await login(alpha, 'alpha@toktickit.test', INITIAL['alpha@toktickit.test']);
    await alpha.setViewportSize({ width: 1440, height: 900 });
    await alpha.goto(`${BASE}/#/admin/users`);
    await alpha.waitForTimeout(1_200);
    await shoot(alpha, 'user-management', 'forbidden-requester-desktop.png');
    await alpha.close();
  }

  await browser.close();
  console.log('Lab 3 evidence capture complete.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
