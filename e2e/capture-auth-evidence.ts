// One-off evidence capture (run: node scripts/capture-auth-evidence.js after
// tsc, or npx tsx). Produces PNGs of the auth screens at desktop and mobile
// widths for the PR record. Not part of the automated suites.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { resetSeededUsers } from '../e2e/global-setup';

const BASE = 'http://localhost:5173';
const OUT = path.resolve('docs/lab-03/evidence');

async function shoot(page: import('@playwright/test').Page, hash: string, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/#${hash}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('saved', name);
}

(async () => {
  await resetSeededUsers();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await shoot(page, '/login', 'auth-login-desktop.png', 1440, 900);
  await shoot(page, '/login', 'auth-login-mobile.png', 375, 812);
  await shoot(page, '/forgot-password', 'auth-reset-desktop.png', 1440, 900);
  await shoot(page, '/forgot-password', 'auth-reset-mobile.png', 375, 812);
  await browser.close();
})();
