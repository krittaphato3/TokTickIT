import { expect, test, type Page } from '../fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// L4-4 — E2E-01 (docs/lab-04/tests.md §2):
// Staff A records an action, Staff B records and edits another on the same ticket,
// ticket owner remains unchanged, and the owning Requester opens the ticket and
// sees both actions read-only with zero create/edit affordances.
// Also covers validation error paths and responsive screenshots (1280x800, 820x1180, 390x844).

const API = 'http://localhost:4000';
const STAFF_A = { email: 'sara.it@toktickit.test', password: 'Staff123!', name: 'Sara IT' };
const STAFF_B = { email: 'tom.it@toktickit.test', password: 'Staff123!', name: 'Tom IT' };
const REQUESTER = { email: 'eta@toktickit.test', password: 'Requester123!', name: 'Dev User Eta' };

interface QueueTicket {
  ticketNumber: string;
  title: string;
  status: string;
}

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
    const changed = `P4Pass${Date.now().toString().slice(-6)}!Aa1`;
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

async function findDemoTicketNumber(page: Page, titleFragment: string): Promise<string> {
  for (let p = 1; p <= 8; p += 1) {
    const res = await page.request.get(`${API}/api/staff/tickets?page=${p}&pageSize=50`);
    if (res.ok()) {
      const body = (await res.json()) as { data: QueueTicket[]; meta: { totalPages: number } };
      const hit = body.data.find((t) => t.title.includes(titleFragment));
      if (hit) return hit.ticketNumber;
      if (p >= body.meta.totalPages) break;
    }
  }
  return 'TTK-2026-810001';
}

test.describe('E2E-01: Actions Taken flow across staff and requester', () => {
  test('staff A records action, staff B records & edits action, owner unchanged, requester is read-only', async ({ page }) => {
    // 1. Staff A logs in
    await login(page, STAFF_A.email, STAFF_A.password);
    const ticketNumber = await findDemoTicketNumber(page, 'untouched ticket');

    await page.goto(`/#/staff/tickets/${ticketNumber}`);
    const sectionA = page.getByRole('region', { name: /actions taken/i });
    await expect(sectionA).toBeVisible({ timeout: 15_000 });

    // Record initial owner to prove BR-02 (action by non-owner does not reassign)
    const initialOwner = await page.locator('#std-owner option:checked').textContent();

    // Validation test: open record action, submit empty
    const recordBtn = sectionA.getByRole('button', { name: /record action/i });
    await recordBtn.click();

    const saveBtn = sectionA.getByRole('button', { name: /^save action$|^save$/i });
    await saveBtn.click();

    // Verify validation errors appear beneath fields
    await expect(sectionA.getByText(/description is required/i)).toBeVisible();
    await expect(sectionA.getByText(/result is required/i)).toBeVisible();

    // Fill valid action from Staff A
    const descInput = sectionA.getByLabel(/description/i);
    const resultInput = sectionA.getByLabel(/result/i);
    await descInput.fill('Staff A replaced the primary power adapter.');
    await resultInput.fill('Device powers on successfully.');

    await saveBtn.click();
    await expect(sectionA.getByText(/action recorded/i)).toBeVisible();
    await expect(sectionA.getByText('Staff A replaced the primary power adapter.').first()).toBeVisible();

    // 2. Staff B logs in, records another action on same ticket, and edits it
    await logout(page);
    await login(page, STAFF_B.email, STAFF_B.password);
    await page.goto(`/#/staff/tickets/${ticketNumber}`);

    const sectionB = page.getByRole('region', { name: /actions taken/i });
    await expect(sectionB).toBeVisible();

    // Staff B records second action
    const descB = `Staff B applied firmware update ${Date.now()}`;
    await sectionB.getByRole('button', { name: /record action/i }).click();
    await sectionB.getByLabel(/description/i).fill(descB);
    await sectionB.getByLabel(/result/i).fill('Firmware updated. Need to monitor thermals.');
    await sectionB.getByRole('checkbox', { name: /follow-up required/i }).check();
    await sectionB.getByLabel(/follow-up note/i).fill('Check thermals after 24 hours of operation.');

    await sectionB.getByRole('button', { name: /^save action$|^save$/i }).click();
    await expect(sectionB.getByText(descB).first()).toBeVisible();
    await expect(sectionB.getByText(/check thermals after 24 hours/i).first()).toBeVisible();

    // Locate Staff B's specific row in the table to edit
    const tomRow = sectionB.locator('tbody tr', { hasText: descB }).first();
    await expect(tomRow).toBeVisible();
    await tomRow.getByRole('button', { name: /edit/i }).click();

    const editRow = sectionB.locator('tbody tr.at-edit-row');
    await expect(editRow.getByText(/editing action/i)).toBeVisible();
    // Toggle follow-up off in that row
    const followupCheckbox = editRow.getByRole('checkbox', { name: /follow-up required/i });
    await followupCheckbox.uncheck();
    await editRow.getByRole('button', { name: /^save changes$|^save$/i }).click();

    await expect(sectionB.getByText(/action updated/i)).toBeVisible();
    // Follow-up note is now gone from that row
    await expect(sectionB.locator('tbody tr', { hasText: descB }).getByText(/check thermals after 24 hours/i)).not.toBeVisible();

    // Check ticket owner is unchanged (BR-02: creating/editing actions leaves owner intact)
    const ownerSelect = page.locator('#std-owner option:checked');
    await expect(ownerSelect).toHaveText(initialOwner?.trim() ?? '');

    // 3. Requester logs in and views ticket detail
    await logout(page);
    await login(page, REQUESTER.email, REQUESTER.password);
    await page.goto(`/#/tickets/${ticketNumber}`);

    const reqSection = page.getByRole('region', { name: /actions taken/i });
    await expect(reqSection).toBeVisible({ timeout: 15_000 });

    // Verify both actions are visible
    await expect(reqSection.getByText('Staff A replaced the primary power adapter.').first()).toBeVisible();
    await expect(reqSection.getByText('Staff B applied firmware update v2.4.').first()).toBeVisible();

    // Verify read-only: no record action or edit buttons
    await expect(reqSection.getByRole('button', { name: /record action/i })).not.toBeVisible();
    await expect(reqSection.getByRole('button', { name: /edit/i })).not.toBeVisible();
  });

  test('captures screenshots across 3 viewports for actions list, create error, and requester read-only', async ({ page }) => {
    const shotDir = join(process.cwd(), 'artifacts/lab-04/screenshots/actions-taken');
    mkdirSync(shotDir, { recursive: true });

    const viewports = [
      { name: '1280x800', width: 1280, height: 800 },
      { name: '820x1180', width: 820, height: 1180 },
      { name: '390x844', width: 390, height: 844 },
    ];

    // Login as Staff A first
    await login(page, STAFF_A.email, STAFF_A.password);
    const ticketNumber = await findDemoTicketNumber(page, 'untouched ticket');

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/#/staff/tickets/${ticketNumber}`);
      const section = page.getByRole('region', { name: /actions taken/i });
      await expect(section).toBeVisible({ timeout: 15_000 });

      // 1. Staff actions list screenshot
      await page.screenshot({ path: join(shotDir, `actions-list-${vp.name}.png`), fullPage: false });

      // 2. Staff create form with validation error screenshot
      await section.getByRole('button', { name: /record action/i }).click();
      await section.getByRole('button', { name: /^save action$|^save$/i }).click();
      await expect(section.getByText(/description is required/i)).toBeVisible();
      await page.screenshot({ path: join(shotDir, `create-validation-${vp.name}.png`), fullPage: false });

      // Cancel create form
      await section.getByRole('button', { name: /cancel/i }).click();
    }

    // 3. Requester read-only view
    await logout(page);
    await login(page, REQUESTER.email, REQUESTER.password);

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/#/tickets/${ticketNumber}`);
      const reqSection = page.getByRole('region', { name: /actions taken/i });
      await expect(reqSection).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: join(shotDir, `requester-readonly-${vp.name}.png`), fullPage: false });
    }
  });
});
