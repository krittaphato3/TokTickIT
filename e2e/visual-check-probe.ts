// Lab 3 visual QA probe (npx tsx e2e/visual-check-probe.ts). Drives every
// major screen at desktop/tablet/mobile widths and MEASURES (not asserts):
//   - horizontal overflow (documentElement scrollWidth vs clientWidth)
//   - keyboard focus visibility (computed outline on the first tabbable)
// Writes JSON to artifacts/lab-03/screenshots/visual-probe.json for the
// visual checklist record. Not part of the automated suites.
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { resetSeededUsers } from './global-setup';

const BASE = 'http://localhost:5173';
const OUT = path.resolve('artifacts', 'lab-03', 'screenshots', 'visual-probe.json');
const NEWPASS = 'NewPass123!';

const INITIAL: Record<string, string> = {
  'alpha@toktickit.test': 'Requester123!',
  'tom.it@toktickit.test': 'Staff123!',
  'admin@toktickit.test': 'Admin123!',
};

type Result = {
  screen: string;
  width: number;
  hOverflow: boolean;
  focusVisible: boolean | null;
  cardOffCenterPx?: number | null;
};

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-email', { timeout: 15_000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('.tok-auth-submit');
  await page.waitForTimeout(1_000);
  if (await page.isVisible('#cp-new')) {
    await page.fill('#cp-new', NEWPASS);
    await page.fill('#cp-confirm', NEWPASS);
    await page.click('.tok-auth-submit');
    await page.waitForTimeout(1_400);
  }
}

async function probe(page: Page, screen: string, url: string, width: number, results: Result[]) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : width === 834 ? 1112 : 900 });
  await page.goto(`${BASE}/#${url}`);
  await page.waitForTimeout(1_400);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const focusable = de.querySelector<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    let focusVisible: boolean | null = null;
    if (focusable) {
      focusable.focus();
      const cs = getComputedStyle(focusable);
      focusVisible = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth || '0') > 0;
    }
    const card = document.querySelector('.tok-auth-card')?.getBoundingClientRect();
    const cardOffCenterPx = card
      ? Math.round(card.x + card.width / 2 - window.innerWidth / 2)
      : null;
    return { hOverflow: de.scrollWidth > de.clientWidth, focusVisible, cardOffCenterPx };
  });
  results.push({ screen, width, ...m });
}

(async () => {
  await resetSeededUsers();
  const browser = await chromium.launch();
  const results: Result[] = [];
  const widths = [1440, 834, 375];

  // Public login page.
  const pub = await browser.newPage();
  for (const w of widths) await probe(pub, 'login', '/login', w, results);
  await pub.close();

  // First-login gate (change-password): centering must hold at every width.
  const gated = await browser.newPage();
  await gated.setViewportSize({ width: 1440, height: 900 });
  await gated.goto(`${BASE}/#/login`);
  await gated.waitForSelector('#login-email', { timeout: 15_000 });
  await gated.fill('#login-email', 'gamma@toktickit.test');
  await gated.fill('#login-password', 'Requester123!');
  await gated.click('.tok-auth-submit');
  await gated.waitForURL('**/#/change-password?first=1', { timeout: 15_000 });
  await gated.waitForSelector('.tok-auth-card', { timeout: 10_000 });
  for (const w of widths) await probe(gated, 'change-password-gate', '/change-password?first=1', w, results);
  await gated.close();

  // Requester screens.
  const req = await browser.newPage();
  await login(req, 'alpha@toktickit.test', INITIAL['alpha@toktickit.test']);
  for (const w of widths) {
    await probe(req, 'my-tickets', '/my', w, results);
    await probe(req, 'create-ticket', '/new', w, results);
    await probe(req, 'requester-detail', '/my', w, results); // detail measured via queue row when present
  }
  // Open the first detail row if the table rendered.
  await req.setViewportSize({ width: 1440, height: 900 });
  await req.goto(`${BASE}/#/my`);
  await req.waitForTimeout(1_400);
  if (await req.isVisible('tbody tr >> nth=0')) {
    await req.click('tbody tr >> nth=0');
    await req.waitForTimeout(1_200);
    for (const w of widths) {
      await req.setViewportSize({ width: w, height: w === 375 ? 812 : w === 834 ? 1112 : 900 });
      await req.waitForTimeout(700);
      const m = await req.evaluate(() => {
        const de = document.documentElement;
        return { hOverflow: de.scrollWidth > de.clientWidth, focusVisible: null as boolean | null };
      });
      results.push({ screen: 'requester-detail', width: w, ...m });
    }
  }
  // Forbidden: requester at admin route (client guard) — overflow check only.
  await req.setViewportSize({ width: 1440, height: 900 });
  await req.goto(`${BASE}/#/admin/users`);
  await req.waitForTimeout(1_000);
  const fm = await req.evaluate(() => {
    const de = document.documentElement;
    return { hOverflow: de.scrollWidth > de.clientWidth, focusVisible: null as boolean | null };
  });
  results.push({ screen: 'requester-forbidden', width: 1440, ...fm });
  await req.close();

  // Staff screens.
  const staff = await browser.newPage();
  await login(staff, 'tom.it@toktickit.test', INITIAL['tom.it@toktickit.test']);
  for (const w of widths) await probe(staff, 'staff-queue', '/staff/queue', w, results);
  await staff.setViewportSize({ width: 1440, height: 900 });
  await staff.goto(`${BASE}/#/staff/queue`);
  await staff.waitForSelector('tbody tr', { timeout: 15_000 });
  await staff.click('tbody tr >> nth=0');
  await staff.waitForTimeout(1_400);
  for (const w of widths) {
    await staff.setViewportSize({ width: w, height: w === 375 ? 812 : w === 834 ? 1112 : 900 });
    await staff.waitForTimeout(800);
    const m = await staff.evaluate(() => {
      const de = document.documentElement;
      return { hOverflow: de.scrollWidth > de.clientWidth, focusVisible: null as boolean | null };
    });
    results.push({ screen: 'staff-ticket-detail', width: w, ...m });
  }
  await staff.close();

  // Admin screens.
  const admin = await browser.newPage();
  await login(admin, 'admin@toktickit.test', INITIAL['admin@toktickit.test']);
  for (const w of widths) await probe(admin, 'user-management', '/admin/users', w, results);
  await admin.close();

  await browser.close();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.hOverflow);
  console.log(JSON.stringify(results));
  console.log(`\nhorizontal-overflow findings: ${bad.length ? JSON.stringify(bad) : 'none'}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
