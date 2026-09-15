// One-off queue evidence capture (npx tsx e2e/capture-queue-evidence.ts).
// Produces PNGs of the IT Staff Ticket Queue at desktop and mobile widths for
// the PR record. Not part of the automated suites.
//
// Prerequisite (run once before capturing, local dev DB only):
//   docker compose exec -T postgres psql -U toktickit -d toktickit_dev -c \
//     "UPDATE \"User\" SET \"mustChangePassword\" = false, \"isActive\" = true
//      WHERE email = 'sara.it@toktickit.test';"
// The seeded staff account normally carries mustChangePassword=true (BR-02);
// the login page would otherwise redirect the capture into the change-password
// gate. The one-off UPDATE clears the flag for screenshot purposes only.
import { chromium } from '@playwright/test';
import path from 'node:path';

const API = 'http://localhost:4000';
const BASE = 'http://localhost:5173';
const OUT = path.resolve('docs/lab-03/evidence');

const STAFF_EMAIL = 'sara.it@toktickit.test';
const STAFF_PASSWORD = 'Staff123!';

async function staffSessionCookie(): Promise<{ name: string; value: string }> {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });
  if (!login.ok) {
    throw new Error(`staff login failed with ${login.status}: ${await login.text()}`);
  }
  const setCookies = login.headers.getSetCookie();
  const sid = setCookies.find((c) => c.startsWith('toktickit.sid='));
  if (!sid) throw new Error('login response carried no session cookie');
  const [pair] = sid.split(';');
  const [name, value] = pair.split('=');
  return { name, value };
}

async function shoot(
  page: import('@playwright/test').Page,
  url: string,
  name: string,
  width: number,
  height: number,
  opts: { rows?: boolean } = { rows: true },
) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.waitForSelector('h1:has-text("Ticket Queue")', { timeout: 15_000 });
  if (opts.rows !== false) {
    await page.waitForSelector('tbody tr', { timeout: 15_000 });
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('saved', name);
}

(async () => {
  const cookie = await staffSessionCookie();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    { name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();
  const queueUrl = `${BASE}/#/staff/queue`;
  // Desktop (>=768px): wait for real table rows.
  await shoot(page, queueUrl, 'staff-queue-desktop.png', 1280, 900);
  // Mobile (<768px): the table hides and cards render instead, so waiting for
  // `tbody tr` would hang — wait for the queue heading, then settle.
  await shoot(page, queueUrl, 'staff-queue-mobile.png', 375, 812, { rows: false });
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
