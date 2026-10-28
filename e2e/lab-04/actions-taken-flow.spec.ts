import { expect, test, type Page } from '../fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// L4-4 — E2E-01 (docs/lab-04/tests.md §2):
// Staff A creates an action, Staff B creates and edits another on the same ticket,
// ticket owner remains unchanged, and the owning Requester opens the ticket and
// sees both actions read-only with zero create/edit affordances.
// Also covers validation error paths and responsive screenshots (1280x800, 820x1180, 390x844).

const API = 'http://localhost:4000';
const STAFF_A = { email: 'sara.it@toktickit.test', password: 'Staff123!', name: 'Sara IT' };
const STAFF_B = { email: 'tom.it@toktickit.test', password: 'Staff123!', name: 'Tom IT' };
const REQUESTER = { email: 'eta@toktickit.test', password: 'Requester123!', name: 'Dev User Eta' };

const TICKET_NUMBER = 'TTK-2026-810001'; // Untouched seeded ticket

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

async function loginAs(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto('/#/login');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(creds.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 10_000 });
}

test.describe('E2E-01: Actions Taken flow across staff and requester', () => {
  test('staff A records action, staff B records & edits action, owner unchanged, requester is read-only', async ({ page }) => {
    // 1. Staff A logs in and records an action
    await loginAs(page, STAFF_A);
    await page.goto(`/#/staff/tickets/${TICKET_NUMBER}`);

    const section = page.getByRole('region', { name: /actions taken/i });
    await expect(section).toBeVisible({ timeout: 10_000 });

    // Validation test: open record action, submit empty
    const recordBtn = section.getByRole('button', { name: /record action/i });
    await recordBtn.click();

    const saveBtn = section.getByRole('button', { name: /^save action$|^save$/i });
    await saveBtn.click();

    // Verify validation errors appear beneath fields
    await expect(section.getByText(/description is required/i)).toBeVisible();
    await expect(section.getByText(/result is required/i)).toBeVisible();

    // Fill valid action from Staff A
    const descInput = section.getByLabelText(/description/i);
    const resultInput = section.getByLabelText(/result/i);
    await descInput.fill('Staff A replaced the primary power adapter.');
    await resultInput.fill('Device powers on successfully.');

    await saveBtn.click();
    await expect(section.getByText(/action recorded/i)).toBeVisible();
    await expect(section.getByText('Staff A replaced the primary power adapter.')).toBeVisible();

    // 2. Staff B logs in, records another action on same ticket, and edits it
    await page.goto('/#/profile');
    const logoutBtn = page.getByRole('button', { name: /log out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      await page.goto('/#/login');
    }

    await loginAs(page, STAFF_B);
    await page.goto(`/#/staff/tickets/${TICKET_NUMBER}`);

    const sectionB = page.getByRole('region', { name: /actions taken/i });
    await expect(sectionB).toBeVisible();

    // Staff B records second action
    await sectionB.getByRole('button', { name: /record action/i }).click();
    await sectionB.getByLabelText(/description/i).fill('Staff B applied firmware update v2.4.');
    await sectionB.getByLabelText(/result/i).fill('Firmware updated. Need to monitor thermals.');
    await sectionB.getByLabelText(/follow-up required/i).click();
    await sectionB.getByLabelText(/follow-up note/i).fill('Check thermals after 24 hours of operation.');

    await sectionB.getByRole('button', { name: /^save action$|^save$/i }).click();
    await expect(sectionB.getByText('Staff B applied firmware update v2.4.')).toBeVisible();
    await expect(sectionB.getByText(/check thermals after 24 hours/i)).toBeVisible();

    // Staff B edits their action to clear follow-up
    const editBtns = sectionB.getByRole('button', { name: /edit/i });
    await editBtns.first().click();

    await expect(sectionB.getByText(/editing action/i)).toBeVisible();
    // Toggle follow-up off
    await sectionB.getByLabelText(/follow-up required/i).click();
    await sectionB.getByRole('button', { name: /^save changes$|^save$/i }).click();

    await expect(sectionB.getByText(/action updated|saved/i)).toBeVisible();
    // Follow up chip is now gone from that action
    await expect(sectionB.getByText(/check thermals after 24 hours/i)).not.toBeVisible();

    // Check ticket owner is unchanged
    const ownerField = page.locator('.std-field', { hasText: 'Assigned Staff' });
    await expect(ownerField).toContainText('Sara IT');

    // 3. Requester logs in and views ticket detail
    await page.goto('/#/profile');
    if (await page.getByRole('button', { name: /log out/i }).isVisible()) {
      await page.getByRole('button', { name: /log out/i }).click();
    }

    await loginAs(page, REQUESTER);
    await page.goto(`/#/tickets/${TICKET_NUMBER}`);

    const reqSection = page.getByRole('region', { name: /actions taken/i });
    await expect(reqSection).toBeVisible({ timeout: 10_000 });

    // Verify both actions are visible
    await expect(reqSection.getByText('Staff A replaced the primary power adapter.')).toBeVisible();
    await expect(reqSection.getByText('Staff B applied firmware update v2.4.')).toBeVisible();

    // Verify read-only: no record action or edit buttons
    await expect(reqSection.getByRole('button', { name: /record action/i })).not.toBeVisible();
    await expect(reqSection.getByRole('button', { name: /edit/i })).not.toBeVisible();
  });

  test('captures screenshots across 3 viewports for actions list, create error, and requester read-only', async ({ browser }) => {
    const shotDir = join(process.cwd(), 'artifacts/lab-04/screenshots/actions-taken');
    mkdirSync(shotDir, { recursive: true });

    const viewports = [
      { name: '1280x800', width: 1280, height: 800 },
      { name: '820x1180', width: 820, height: 1180 },
      { name: '390x844', width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      // 1. Staff actions list
      const staffPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await loginAs(staffPage, STAFF_A);
      await staffPage.goto(`/#/staff/tickets/${TICKET_NUMBER}`);
      await expect(staffPage.getByRole('region', { name: /actions taken/i })).toBeVisible();
      await staffPage.screenshot({ path: join(shotDir, `actions-list-${vp.name}.png`), fullPage: false });
      // Also write alias list-<viewport>.png per prompt format
      await staffPage.screenshot({ path: join(shotDir, `list-${vp.name}.png`), fullPage: false });

      // 2. Staff create form with validation error
      const section = staffPage.getByRole('region', { name: /actions taken/i });
      await section.getByRole('button', { name: /record action/i }).click();
      await section.getByRole('button', { name: /^save action$|^save$/i }).click();
      await expect(section.getByText(/description is required/i)).toBeVisible();
      await staffPage.screenshot({ path: join(shotDir, `create-validation-error-${vp.name}.png`), fullPage: false });
      await staffPage.screenshot({ path: join(shotDir, `create-error-${vp.name}.png`), fullPage: false });
      await staffPage.close();

      // 3. Requester read-only view
      const reqPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await loginAs(reqPage, REQUESTER);
      await reqPage.goto(`/#/tickets/${TICKET_NUMBER}`);
      await expect(reqPage.getByRole('region', { name: /actions taken/i })).toBeVisible();
      await reqPage.screenshot({ path: join(shotDir, `requester-readonly-${vp.name}.png`), fullPage: false });
      await reqPage.close();
    }
  });
});
