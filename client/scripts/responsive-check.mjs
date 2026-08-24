// Dev-only helper: captures the Create Ticket page at the three canonical
// widths and reports horizontal overflow. Run with the dev servers up:
//   node scripts/responsive-check.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = join(process.cwd(), '..', 'artifacts', 'lab-02', 'screenshots', 'create-ticket');
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: 'mobile-375', width: 375 },
  { name: 'tablet-800', width: 800 },
  { name: 'desktop-1280', width: 1280 },
];

const browser = await chromium.launch();
for (const { name, width } of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${BASE}/#/new-ticket`);
  await page.waitForSelector('.tok-page-title', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (el.scrollWidth > doc.clientWidth + 1 && el.getBoundingClientRect().width > 10) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ` +
          `(scroll ${el.scrollWidth} > client ${doc.clientWidth})`,
        );
      }
    });
    return {
      innerWidth: window.innerWidth,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth,
      offenders: [...new Set(offenders)].slice(0, 10),
    };
  });

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(metrics, null, 2));
  await page.close();
}
await browser.close();
