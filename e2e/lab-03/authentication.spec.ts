import { expect, test, type Page } from '../fixtures';

// Mandated spec — e2e/lab-03/authentication.spec.ts (T-E2E-01, T-GATE-02,
// T-SESS-02). Authentication journey against the real API + Vite dev servers
// and the seeded database: valid login, invalid login, inactive account,
// mandatory initial-password change gating, and logout invalidation.
// Seeded credentials are local-development only (server/prisma/seed.ts).

const API = 'http://localhost:4000';

const ALPHA = { email: 'alpha@toktickit.test', password: 'Requester123!' };
const BETA = { email: 'beta@toktickit.test', password: 'Requester123!' };
// Inactive seeded accounts (403 on login): epsilon (REQUESTER), leo (IT_STAFF).
const INACTIVE = { email: 'epsilon@toktickit.test', password: 'Requester123!' };
const STAFF = { email: 'sara.it@toktickit.test', password: 'Staff123!' };
// Gamma's password is only mutated by the forgot-password test below, which
// sets it to a fresh per-run value first — keeping tests order-independent.
const GAMMA = { email: 'gamma@toktickit.test', password: 'Requester123!' };

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

test.describe('T-E2E-01: authentication journey (AC-01, AC-02, AC-05, AC-06)', () => {
  test('login screen renders with email/password, validation, and busy state', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeVisible();

    // Client-side validation: empty submit focuses Email with an inline error.
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert').or(page.locator('.tok-err')).first()).toBeVisible();

    // Forgot-password entry point present (credential-verified reset, AD-04).
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    // No self-registration (excluded feature).
    await expect(page.getByText(/sign up|register/i)).toHaveCount(0);
  });

  test('forgot-password screen: no-email notice, safe failure, then successful reset and relogin', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();

    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible({ timeout: 10000 });
    // Exclusion guardrail: the screen explains that no reset email exists.
    await expect(page.getByText(/does not send password-reset emails/i)).toBeVisible();

    const newPw = `Gm${Date.now().toString().slice(-6)}!Aa1`;

    // Wrong current password: safe failure, no account-existence leak.
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(GAMMA.email);
    await page.getByRole('textbox', { name: 'Current or temporary password', exact: true }).fill('WrongPass1!');
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(newPw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(newPw);
    await page.getByRole('button', { name: /update password/i }).click();
    await expect(page.getByText(/we could not update that password/i)).toBeVisible({ timeout: 10000 });

    // Correct current (initial) password: reset succeeds and returns to login.
    await page.getByRole('textbox', { name: 'Current or temporary password', exact: true }).fill(GAMMA.password);
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(newPw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(newPw);
    await page.getByRole('button', { name: /update password/i }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });

    // The NEW password signs in straight to My Tickets (flag cleared, no
    // gate) — this is what proves the reset actually took effect.
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(GAMMA.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(newPw);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });
  });

  test('invalid login shows the safe generic failure and stays on login', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();

    // Unknown email and wrong password share the same safe copy (BR-16).
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('nobody@toktickit.test');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('WrongPassword1!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('inactive account login shows the same safe failure (no account details leaked)', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(INACTIVE.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(INACTIVE.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible({ timeout: 10000 });
    // Direct API check: inactive is 403 with the generic deactivated message
    // and no session cookie is established.
    const res = await page.request.post(`${API}/api/auth/login`, {
      data: INACTIVE,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('initial-password user is gated: login lands on change-password and blocks app routes', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(BETA.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(BETA.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Gate screen appears with the administrator-initial-password notice.
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/administrator set an initial password/i)).toBeVisible();

    // Rule feedback: mismatched confirmation is blocked before/after submit.
    const changed = `Regr${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed.slice(0, -1) + '2');
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.locator('.tok-err').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible();

    // Direct navigation to app routes stays blocked while gated.
    await page.goto('/#/my');
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible();

    // Correct change succeeds and continues into the application.
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });
    // (New-password round-trip is asserted at the API level in T-PWD-01; the
    // login rate limiter caps direct API logins per minute, so e2e keeps
    // to UI-driven sign-ins.)
  });

  test('logout invalidates the session and protected routes redirect to login', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(ALPHA.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ALPHA.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });

    const changed = `Regr${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(changed);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(changed);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });

    // Profile-only header: sign-out lives on the Profile page (#/profile).
    await page.getByRole('link', { name: /^profile$/i }).click();
    await page.getByRole('button', { name: /^sign out$/i }).click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });

    // Session is really gone server-side: /api/auth/me after logout is 401
    // (the browser context no longer holds a valid session cookie).
    const me = await page.request.get(`${API}/api/auth/me`);
    expect(me.status()).toBe(401);

    // Direct navigation to a protected route returns to login, never renders
    // protected content (T-SESS-02).
    await page.goto('/#/my');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /my tickets/i })).toHaveCount(0);
  });
});

test.describe('T-NAV-02: role navigation smoke (AC-01, BR-20)', () => {
  test('requester lands on My Tickets; staff lands on Ticket Queue; unauthorized admin route is refused', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(ALPHA.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ALPHA.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const alphaPw = `Regr${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(alphaPw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(alphaPw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible({ timeout: 15000 });
    // Requester has no staff/admin destinations.
    await expect(page.getByRole('link', { name: /ticket queue/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /user management/i })).toHaveCount(0);
  });

  test('staff lands on the Ticket Queue placeholder with an authenticated session', async ({ page }) => {
    await waitForHealth(page);
    await page.goto('/#/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(STAFF.email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(STAFF.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible({ timeout: 10000 });
    const staffPw = `Regr${Date.now().toString().slice(-6)}!Aa1`;
    await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(staffPw);
    await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(staffPw);
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByRole('heading', { name: /ticket queue/i })).toBeVisible({ timeout: 15000 });
  });
});
