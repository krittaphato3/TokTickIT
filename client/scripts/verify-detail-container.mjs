import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const width of [1280, 2560, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const html = `
  <html><head><style>
  :root{--tok-surface:#fff;--tok-border-soft:#DFE7E2;--tok-text-muted:#5C6B64}
  .mt-page{width:100%;max-width:1280px;margin:0 auto;padding:1.5rem 1rem 24px;box-sizing:border-box;background:#f0f0f0}
  .mt-page.td-page{padding-top:24px;padding-bottom:48px}
  .td-card{background:#fff;border:1px solid #E3E8E5;border-radius:12px;padding:24px;width:100%;box-sizing:border-box}
  .td-crumbrow{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px;width:100%}
  @media(max-width:767px){.mt-page{padding-top:16px}.td-crumbrow{flex-direction:column;align-items:flex-start}}
  </style></head><body>
  <div class="mt-page" id="my"><div class="td-card">My Tickets card</div></div>
  <div class="mt-page td-page" id="detail"><div class="td-crumbrow"><span>crumb</span><button>Back</button></div><div class="td-card">Detail card</div></div>
  </body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(200);
  const my = await page.$eval('#my', el => el.getBoundingClientRect().left);
  const detail = await page.$eval('#detail', el => el.getBoundingClientRect().left);
  const myRight = await page.$eval('#my', el => el.getBoundingClientRect().right);
  const detailRight = await page.$eval('#detail', el => el.getBoundingClientRect().right);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`width ${width}: my left ${my.toFixed(1)} detail left ${detail.toFixed(1)} diff ${(my-detail).toFixed(1)}; right diff ${(myRight-detailRight).toFixed(1)} scroll=${scroll}`);
  if (Math.abs(my - detail) > 1 || Math.abs(myRight - detailRight) > 1) throw new Error(`Misaligned at ${width}`);
  if (scroll) throw new Error(`Horizontal scroll at ${width}`);
  await page.close();
}
await browser.close();
console.log('container alignment and no-scroll verified');
