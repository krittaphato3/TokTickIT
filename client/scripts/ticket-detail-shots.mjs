import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = resolve('../artifacts/lab-02/screenshots/ticket-detail');
mkdirSync(OUT, { recursive: true });

const mockPath = resolve('../docs/mockups/TicketDetail_Demo2.html');
const url = pathToFileURL(mockPath).href;

const shots = [
  { name: 'detail-1280', width: 1280, height: 900 },
  { name: 'detail-800', width: 800, height: 900 },
  { name: 'detail-375', width: 375, height: 812 },
];

const browser = await chromium.launch();
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.goto(url);
    await page.waitForTimeout(500);
    // Verify no horizontal scroll
    const hasScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${s.name} hasScroll=${hasScroll}`);
    if (hasScroll) throw new Error(`Horizontal scroll at ${s.width}`);
    await page.screenshot({ path: resolve(OUT, `${s.name}.png`), fullPage: true });
    console.log(`saved ${s.name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('done');
