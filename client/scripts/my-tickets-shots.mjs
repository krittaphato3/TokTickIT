// Screenshot evidence generator for Issue #16 (My Tickets UI).
// Requires the dev stack running: postgres (db:up), server (npm run dev),
// client (npx vite --port 5173). Run: node scripts/my-tickets-shots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:5173';
const OUT = resolve('../artifacts/lab-02/screenshots/my-tickets');
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'desktop-1280', width: 1280, height: 960, ready: 'a.tnum' },
  { name: 'tablet-800', width: 800, height: 900, ready: 'a.tnum' },
  { name: 'mobile-375', width: 375, height: 812, ready: 'a.mcard' },
];

const browser = await chromium.launch();
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.goto(`${BASE}/#/tickets`);
    await page.waitForSelector(s.ready, { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${s.name}.png`), fullPage: true });
    await page.close();
    console.log(`saved ${s.name}.png`);
  }

  // state-initial: skeleton visible before data arrives (throttle response)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.route('**/api/tickets**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto(`${BASE}/#/tickets`);
    await page.waitForSelector('.sk-row', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUT, 'state-initial.png') });
    await page.close();
    console.log('saved state-initial.png');
  }

  // state-api-failure: stop the API behind the page and reload
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.goto(`${BASE}/#/tickets`);
    await page.waitForSelector('a[href*="TTK-"]', { timeout: 10000 });
    await page.route('**/api/tickets**', (route) => route.abort());
    await page.reload();
    await page.waitForSelector('.errbar', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUT, 'state-api-failure.png') });
    await page.close();
    console.log('saved state-api-failure.png');
  }

  // state-no-results: filter that matches nothing (requester 1 has no CRITICAL Hardware tickets)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.goto(`${BASE}/#/tickets`);
    await page.waitForSelector('a[href*="TTK-"]', { timeout: 10000 });
    await page.getByLabel('Search').fill('zzz-no-match');
    await page.waitForSelector('.state-title', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUT, 'state-no-results.png') });
    await page.close();
    console.log('saved state-no-results.png');
  }

  // state-empty: Dev User Beta has zero tickets -> "No tickets yet" + CTA
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.goto(`${BASE}/#/tickets`);
    await page.waitForSelector('a[href*="TTK-"]', { timeout: 10000 });
    await page.getByLabel('Development Requester').selectOption({ label: 'Dev User Beta' });
    await page.waitForSelector('.state-title', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(OUT, 'state-empty.png') });
    await page.close();
    console.log('saved state-empty.png');
  }
} finally {
  await browser.close();
}
console.log('done');
