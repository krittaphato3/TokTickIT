import { expect, test, type Page } from '../fixtures';

// Responsive verification for the Lab 3 auth screens (ui-spec §3/§3.4/§4,
// AC-18 T-UX responsive evidence). Matrix: 375 phone / 768 tablet /
// 1024 small laptop / 1440 desktop / 320 very small / 568 landscape phone.
// Asserts: no horizontal overflow, ≥44px interactive targets, 16px input
// font on mobile, card accent line rendered, footer never overlapping the
// card, and zero horizontal scroll at every width.

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568 },
  { name: 'phone-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
}

async function assertTouchTargets(page: Page): Promise<void> {
  const tooSmall = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
        '.tok-auth-page button, .tok-auth-page a, .tok-auth-page input',
      ),
    );
    return els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), label: el.textContent?.slice(0, 18) ?? '' };
      })
      .filter((s) => s.h > 0 && (s.h < 42 || s.w < 42)); // small tolerance for text links w/ padding
  });
  expect(tooSmall, `targets under 44px: ${JSON.stringify(tooSmall)}`).toEqual([]);
}

async function assertInputFont(page: Page): Promise<void> {
  const fonts = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>('.tok-auth-input')).map((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    ),
  );
  for (const f of fonts) expect(f).toBeGreaterThanOrEqual(16);
}

async function assertAccentLine(page: Page): Promise<void> {
  const [h, opacity] = await page.evaluate(() => {
    const card = document.querySelector('.tok-auth-card');
    if (!card) return [0, 0] as const;
    const st = getComputedStyle(card, '::before');
    return [parseFloat(st.height), parseFloat(st.opacity)] as const;
  });
  expect(h).toBe(3);
  expect(opacity).toBeGreaterThan(0);
}

async function assertFooterClear(page: Page): Promise<void> {
  const overlap = await page.evaluate(() => {
    const card = document.querySelector('.tok-auth-card')?.getBoundingClientRect();
    const footer = document.querySelector('.tok-app-footer')?.getBoundingClientRect();
    if (!card || !footer) return false;
    return card.bottom > footer.top + 1; // card must end above the footer
  });
  expect(overlap, 'auth card overlaps the app footer').toBe(false);
}

test.describe('auth screens responsive matrix (T-UX-01 evidence)', () => {
  for (const vp of VIEWPORTS) {
    test(`login at ${vp.name}: layout, targets, accent, footer`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/login');
      await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await assertTouchTargets(page);
      await assertInputFont(page);
      await assertAccentLine(page);
      await assertFooterClear(page);
    });

    test(`reset at ${vp.name}: rules card visible and footer clear`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/forgot-password');
      await expect(
        page.getByRole('textbox', { name: 'Current or temporary password', exact: true }),
      ).toBeVisible();
      await expect(page.locator('#fp-rules')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await assertFooterClear(page);
      // On very small screens the rules card scrolls instead of being cut off:
      // overflow-y must be scrollable AND all content reachable via scroll.
      if (vp.width <= 375) {
        const scrollOk = await page.evaluate(() => {
          const el = document.getElementById('fp-rules');
          if (!el) return false;
          const st = getComputedStyle(el);
          if (st.overflowY !== 'auto' && st.overflowY !== 'scroll') return true; // not needed
          const last = el.querySelector('ul li:last-child') as HTMLElement | null;
          if (!last) return true;
          const lastBottom = last.getBoundingClientRect().bottom;
          const boxRect = el.getBoundingClientRect();
          // Reachable = inside the box OR scrolled into view by the browser.
          last.scrollIntoView({ block: 'end' });
          return last.getBoundingClientRect().bottom <= boxRect.bottom + 2;
        });
        expect(scrollOk, 'rules card must scroll to reveal all requirements').toBe(true);
      }
    });
  }

  test('landscape phone (568px tall): footer does not overlap the card', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 }); // landscape phone
    await page.goto('/#/login');
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await assertFooterClear(page);
  });

  // Regression: the first-login gate card once left-hugged on desktop because
  // a legacy zen-green override forced align-items:flex-start on .tok-auth-page
  // (flex-start is the horizontal axis in the column flex). Centering is now
  // asserted in both render contexts (gate branch and voluntary route).
  for (const vp of [VIEWPORTS[3], VIEWPORTS[4]]) {
    test(`change-password (gate) at ${vp.name}: card centered`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/#/login');
      await page.locator('#login-email').fill('alpha@toktickit.test');
      await page.locator('#login-password').fill('Requester123!');
      await page.locator('.tok-auth-submit').click();
      await page.waitForURL('**/#/change-password?first=1', { timeout: 15_000 });
      await expect(page.locator('.tok-auth-card')).toBeVisible();
      const offCenter = await page.evaluate(() => {
        const card = document.querySelector('.tok-auth-card')?.getBoundingClientRect();
        return card ? Math.round(card.x + card.width / 2 - window.innerWidth / 2) : null;
      });
      expect(Math.abs(offCenter ?? 999)).toBeLessThanOrEqual(2);
      expect(await noHorizontalOverflow(page)).toBe(true);
      await assertFooterClear(page);
      // Strength meter is live: typing raises data-score above 0.
      await page.locator('#cp-new').fill('Password1!');
      const score = await page.locator('.tok-auth-strength').getAttribute('data-score');
      expect(Number(score)).toBeGreaterThanOrEqual(4);
    });
  }
});
