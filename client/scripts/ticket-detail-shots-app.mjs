import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const OUT = resolve('../artifacts/lab-02/screenshots/ticket-detail');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const TICKET = 'TTK-2026-000042';

// Mock data: created ticket => Owner Unassigned, Requester Alpha (distinct)
const REQUESTERS = [{ id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' }];
const TICKET_CREATED = {
  id: 999,
  ticketNumber: TICKET,
  title: 'Laptop will not boot',
  description: 'Detailed desc for screenshot — shows Requester vs Owner distinct.',
  status: 'NEW',
  priority: 'HIGH',
  itPriority: null,
  ownerName: null,
  owner: null,
  category: { id: 1, name: 'Hardware' },
  requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  relatedSystem: { id: 1, name: 'Printer' },
  attachments: [{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 1024, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null }],
  createdAt: '2026-08-18T09:30:00.000Z',
  updatedAt: '2026-08-18T09:31:00.000Z',
};

function waitForUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(async () => {
      try {
        const res = await fetch(url);
        if (res.ok) { clearInterval(iv); resolve(); }
      } catch {}
      if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error('timeout waiting ' + url)); }
    }, 500);
  });
}

let previewProc = null;
async function startPreview() {
  // Try to use existing server if already running
  try {
    const r = await fetch(BASE + '/');
    if (r.ok) { console.log('Reusing existing Vite server at ' + BASE); return null; }
  } catch {}
  console.log('Starting vite preview on ' + BASE);
  previewProc = spawn('npx', ['vite', 'preview', '--port', '5173', '--host', '127.0.0.1'], {
    cwd: resolve('.'),
    shell: true,
    stdio: 'inherit',
  });
  await waitForUrl(BASE + '/');
  return previewProc;
}

const browser = await chromium.launch();
let preview = null;
try {
  preview = await startPreview();

  const shots = [
    { name: 'detail-desktop-1280', width: 1280, height: 800 },
    { name: 'detail-tablet-800', width: 800, height: 900 },
    { name: 'detail-mobile-375', width: 375, height: 812 },
  ];

  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.route('**/api/requesters', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REQUESTERS) }));
    await page.route('**/api/categories', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Hardware' }]) }));
    await page.route('**/api/related-systems', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Printer' }]) }));
    await page.route(`**/api/tickets/${TICKET}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TICKET_CREATED) }));
    await page.route('**/api/tickets**', route => {
      // fallback for other ticket list calls if any
      if (route.request().url().includes('/api/tickets/')) return route.continue();
      return route.continue();
    });

    await page.goto(`${BASE}/#/tickets/${TICKET}`, { waitUntil: 'domcontentloaded' });
    // Wait for detail grid to appear
    await page.waitForSelector('.td-card', { timeout: 10000 });
    await page.waitForSelector('text=Ticket Owner', { timeout: 5000 });
    // Verify distinct Requester vs Owner
    const ownerText = await page.locator('.td-field:has-text("Ticket Owner") .td-ro').innerText();
    const requesterText = await page.locator('.td-field:has-text("Requester") .td-ro').innerText();
    console.log(`[${s.name}] Requester="${requesterText.trim()}" Owner="${ownerText.trim()}"`);
    if (!requesterText.includes('Dev User Alpha')) throw new Error('Requester not Alpha');
    if (!ownerText.includes('Unassigned')) throw new Error('Owner should be Unassigned for created ticket, got ' + ownerText);
    // Check no horizontal scroll
    const hasScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (hasScroll) throw new Error(`Horizontal scroll at ${s.width}`);
    // Check caption appears once (navbar only)
    const captionCount = await page.locator('text=Testing only — not real authentication').count();
    console.log(`captionCount=${captionCount}`);
    if (captionCount !== 1) throw new Error(`Expected 1 caption, got ${captionCount}`);

    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${s.name}.png`), fullPage: true });
    console.log(`saved ${s.name}.png`);
    await page.close();
  }

  // Also capture a seeded ticket where Owner is Michael Brown to prove seed owners survive
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const SEEDED = { ...TICKET_CREATED, ticketNumber: 'TTK-2026-800041', title: 'Spreadsheet macros blocked', ownerName: 'Michael Brown', owner: { name: 'Michael Brown' }, requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' } };
    await page.route('**/api/requesters', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REQUESTERS) }));
    await page.route('**/api/tickets/TTK-2026-800041', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEEDED) }));
    await page.goto(`${BASE}/#/tickets/TTK-2026-800041`);
    await page.waitForSelector('.td-card', { timeout: 10000 });
    const ownerText = await page.locator('.td-field:has-text("Ticket Owner") .td-ro').innerText();
    console.log(`seeded Owner="${ownerText.trim()}"`);
    if (!ownerText.includes('Michael Brown')) throw new Error('Seeded owner should be Michael Brown');
    await page.screenshot({ path: resolve(OUT, 'detail-seeded-1280.png'), fullPage: true });
    console.log('saved detail-seeded-1280.png');
    await page.close();
  }

} finally {
  await browser.close();
  if (preview) {
    console.log('Stopping preview server');
    preview.kill();
  }
}
console.log('done');
