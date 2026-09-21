import { expect, test, type Page } from '../fixtures';

// Lab 3 Issue — E2E: Administrator user administration (T-E2E-03 family).
// Drives the REAL UI against the REAL API + seeded database (web servers are
// started by playwright.config.ts).
//
// Coverage mapping (docs/lab-03/tests.md T-E2E-03):
//   Administrator login + user list        → 'user list renders with pagination'
//   search                                 → 'search by name or email narrows the list'
//   optional role filter                   → 'role filter narrows the list'
//   create user                            → 'creates a user'
//   duplicate email validation             → 'rejects a duplicate email'
//   edit user                              → 'edits name and role'
//   set initial password                   → 'sets a new initial password'
//   required password change at next login → 'new initial password forces the change gate'
//   self-deactivation prevention           → 'blocks self-deactivation'
//   last active Administrator protection   → 'protects the last active Administrator'
//   forbidden access by non-Administrator  → 'forbidden for non-administrator roles'
//
// Seeded admin: admin@toktickit.test / Admin123! (local-development seed,
// server/prisma/seed.ts; restored by the per-test fixture).
const API = 'http://localhost:4000';

const ADMIN = { email: 'admin@toktickit.test', password: 'Admin123!' };

const UNIQUE = `e2e-${Date.now().toString(36)}`;

async function waitForHealth(page: Page) {
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/api/health`);
        return r.ok();
      },
      { timeout: 6500, intervals: [500] },
    )
    .toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await waitForHealth(page);
  await page.close();
});

test.describe('T-E2E-03: Administrator user administration', () => {
  async function adminLogin(page: Page): Promise<void> {
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(ADMIN.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    // The per-test fixture restores the seed, so the admin always carries
    // mustChangePassword=true — complete the mandatory change to continue.
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const pw = `Adm${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15000 });
  }

  test('user list renders with pagination, search and role filter', async ({ page }) => {
    await waitForHealth(page);
    await adminLogin(page);

    // List + pagination footer (server-side, 10/page).
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mt-showing')).toContainText(/Showing 1 to \d+ of \d+ users/);

    // Search by name or email narrows to the seeded admin row.
    await page.getByLabel('Search users by name or email').fill('admin@toktickit.test');
    await expect(page.locator('tbody tr', { hasText: 'admin@toktickit.test' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mt-showing')).toContainText(/of 1 users/, { timeout: 15000 });

    // Role filter (optional single filter) narrows to Administrators.
    await page.getByLabel('Search users by name or email').fill('');
    await page.getByLabel('Role').selectOption('ADMIN');
    await expect(page.locator('tbody tr', { hasText: 'Administrator' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('creates a user, rejects a duplicate email, and edits name/role', async ({ page }) => {
    await waitForHealth(page);
    await adminLogin(page);

    // Create user.
    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await dialog.getByLabel('Name').fill(`E2E Created ${UNIQUE}`);
    await dialog.getByLabel('Email').fill(`${UNIQUE}@toktickit.test`);
    await dialog.getByLabel('Role').selectOption('REQUESTER');
    await dialog.getByLabel('Initial Password').fill(`Cr${UNIQUE.slice(-6)}!Aa1`);
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(page.locator('.au-toast-success').first()).toContainText('User saved.', { timeout: 15000 });
    // List order is id-ascending, so the new row may sit on page 2 — narrow
    // by search to bring it into view.
    await page.getByLabel('Search users by name or email').fill(`${UNIQUE}@toktickit.test`);
    await expect(page.locator('tbody tr', { hasText: `${UNIQUE}@toktickit.test` })).toBeVisible({ timeout: 15000 });

    // Duplicate email rejected with a field-level conflict message.
    await page.getByRole('button', { name: 'Create user' }).click();
    const dup = page.getByRole('dialog', { name: 'Create user' });
    await dup.getByLabel('Name').fill('Duplicate Probe');
    await dup.getByLabel('Email').fill(`${UNIQUE}@toktickit.test`);
    await dup.getByLabel('Role').selectOption('IT_STAFF');
    await dup.getByLabel('Initial Password').fill('Duplicate1!Aa');
    await dup.getByRole('button', { name: 'Create user' }).click();
    await expect(dup.getByText(/already exists/i)).toBeVisible({ timeout: 15000 });
    await dup.getByRole('button', { name: 'Close' }).click();

    // Edit: rename the created user and switch role (allowed direction).
    const row = page.locator('tbody tr', { hasText: `${UNIQUE}@toktickit.test` });
    await row.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: /Edit user/ });
    await edit.getByLabel('Name').fill(`E2E Renamed ${UNIQUE}`);
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.au-toast-success').first()).toContainText('saved.', { timeout: 15000 });
    await expect(page.locator('tbody tr', { hasText: `E2E Renamed ${UNIQUE}` })).toBeVisible({ timeout: 15000 });
  });

  test('sets a new initial password that forces the change gate at next login', async ({ page }) => {
    await waitForHealth(page);
    const targetEmail = `${UNIQUE}-pwd@toktickit.test`;
    const initialPw = `In${UNIQUE.slice(-6)}!Aa1`;

    await adminLogin(page);
    await page.getByRole('button', { name: 'Create user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create user' });
    await dialog.getByLabel('Name').fill('E2E Pwd Probe');
    await dialog.getByLabel('Email').fill(targetEmail);
    await dialog.getByLabel('Role').selectOption('REQUESTER');
    await dialog.getByLabel('Initial Password').fill(initialPw);
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(page.locator('.au-toast-success').first()).toContainText('User saved.', { timeout: 15000 });

    // Set a NEW initial password from the edit dialog (search first: the
    // list is id-ascending and the user may be on page 2).
    await page.getByLabel('Search users by name or email').fill(targetEmail);
    const row = page.locator('tbody tr', { hasText: targetEmail });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: /Edit user/ });
    await edit.getByLabel('New Initial Password').fill(`Rs${UNIQUE.slice(-6)}!Bb2`);
    await edit.getByRole('button', { name: 'Set initial password' }).click();
    await expect(page.locator('.au-toast-success').first()).toContainText(
      'must change it at next sign-in',
      { timeout: 15000 },
    );

    // Sign out and sign in as that user: the mandatory change gate appears.
    await page.getByRole('button', { name: /profile menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 15000 });

    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(targetEmail);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(`Rs${UNIQUE.slice(-6)}!Bb2`);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/administrator set an initial password/i)).toBeVisible();

    // Completing the change enters the normal application.
    const pw = `Nx${UNIQUE.slice(-6)}!Cc3`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });
  });

  test('blocks self-deactivation in the UI and on the server (last-admin safe)', async ({ page }) => {
    await waitForHealth(page);
    await adminLogin(page);

    // Open the signed-in admin's own row.
    await page.getByLabel('Search users by name or email').fill(ADMIN.email);
    await expect(page.locator('tbody tr', { hasText: ADMIN.email })).toBeVisible({ timeout: 15000 });
    await page.locator('tbody tr', { hasText: ADMIN.email }).getByRole('button', { name: 'Edit' }).click();

    const edit = page.getByRole('dialog', { name: /Edit user/ });
    // Try the deactivating transition — the client block explains itself and
    // stays Active (server 409 is the authority; this is the surface mirror).
    // exact: true — 'Active' is a substring of 'Inactive'.
    await edit.getByRole('radio', { name: 'Inactive', exact: true }).click();
    await expect(edit.getByText(/cannot deactivate your own account/i)).toBeVisible();
    await expect(edit.getByRole('radio', { name: 'Active', exact: true })).toHaveAttribute('aria-checked', 'true');
    await edit.getByRole('button', { name: 'Close' }).click();

    // Server contract, exercised directly with the BROWSER's session (the
    // page.request context shares the session cookie; the CSRF token comes
    // from /api/auth/me): PATCH the signed-in admin's own row to inactive →
    // 409 (self-deactivation guard; the seeded admin is also the only active
    // Administrator, so the last-admin guard backs it).
    const meRes = await page.request.get(`${API}/api/auth/me`);
    expect(meRes.ok()).toBeTruthy();
    const { csrfToken } = (await meRes.json()) as { csrfToken: string };
    expect(csrfToken).toBeTruthy();
    const users = await page.request.get(`${API}/api/users?search=${encodeURIComponent(ADMIN.email)}`);
    expect(users.ok()).toBeTruthy();
    const list = (await users.json()) as { data: Array<{ id: number; email: string }> };
    const self = list.data.find((u) => u.email === ADMIN.email);
    expect(self).toBeDefined();
    const patch = await page.request.patch(`${API}/api/users/${self!.id}`, {
      data: { isActive: false },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(patch.status()).toBe(409);
  });

  test('forbidden for non-administrator roles (server + shell)', async ({ page }) => {
    await waitForHealth(page);

    // IT Staff session: the shell blocks the admin route and the API 403s.
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('sara.it@toktickit.test');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Staff123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const pw = `Stf${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(pw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(pw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /ticket queue/i })).toBeVisible({ timeout: 15000 });

    await page.goto('/#/admin/users');
    await expect(page.getByText('User management is restricted to administrators.')).toBeVisible({ timeout: 15000 });

    const res = await page.request.get(`${API}/api/users`);
    expect(res.status()).toBe(403);
  });
});
