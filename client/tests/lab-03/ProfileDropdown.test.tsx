import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { sessionUser, stubAuthenticatedFetch } from '../helpers/auth';

// Header Profile dropdown QOL: the Profile toggle opens an accessible menu
// with "Profile" (#/profile) and "Sign out" (Shell.handleLogout). In the
// mustChangePassword gate the header stays minimal but still exposes
// Sign out (Profile item hidden since other routes are blocked).

const USER = sessionUser();

beforeEach(() => {
  window.location.hash = '#/profile';
  vi.stubGlobal('fetch', stubAuthenticatedFetch(USER));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

async function openMenu() {
  render(<App />);
  const toggle = await screen.findByRole('button', { name: /profile/i });
  expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('menu', { name: /account/i })).toBeNull();
  await userEvent.click(toggle);
  const menu = await screen.findByRole('menu', { name: /account/i });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return { toggle, menu };
}

describe('Header Profile dropdown', () => {
  it('opens a menu with Profile and Sign out items', async () => {
    const { menu } = await openMenu();
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('navigates to #/profile from the Profile menu item and closes the menu', async () => {
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /^profile$/i }));
    expect(window.location.hash).toBe('#/profile');
    expect(screen.getByRole('heading', { name: USER.name })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: /account/i })).toBeNull();
  });

  it('signs out via the Sign out menu item and shows a bottom-right toast', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) =>
          String(input).includes('/api/auth/logout') && (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true);
    });
    const msg = await screen.findByText('You have been signed out.');
    const toast = msg.closest('.tok-toast');
    expect(toast).not.toBeNull();
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('You have been signed out.');
    expect(document.querySelector('.tok-toast-stack')).not.toBeNull();
    // Signed-out must NOT render as an inline login banner.
    expect(document.querySelector('.tok-auth-card .tok-auth-alert')).toBeNull();
    expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    const user = userEvent.setup();
    const { toggle } = await openMenu();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: /account/i })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('closes on click-outside', async () => {
    await openMenu();
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu', { name: /account/i })).toBeNull();
  });

  it('exposes Sign out (without Profile) in the mustChangePassword gate', async () => {
    cleanup();
    window.location.hash = '#/change-password?first=1';
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(sessionUser({ mustChangePassword: true })),
    );
    render(<App />);
    await screen.findByRole('heading', { name: /choose a new password/i });
    const toggle = await screen.findByRole('button', { name: /profile/i });
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const menu = await screen.findByRole('menu', { name: /account/i });
    expect(menu).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^profile$/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('signs out from the mustChangePassword gate and shows a bottom-right toast', async () => {
    cleanup();
    window.location.hash = '#/change-password?first=1';
    vi.unstubAllGlobals();
    const fetchMock = stubAuthenticatedFetch(sessionUser({ mustChangePassword: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: /choose a new password/i });
    await userEvent.click(await screen.findByRole('button', { name: /profile/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }));
    await waitFor(() => {
      expect(
        (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([input, init]) =>
          String(input).includes('/api/auth/logout') && (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true);
    });
    const msg = await screen.findByText('You have been signed out.');
    const toast = msg.closest('.tok-toast');
    expect(toast).not.toBeNull();
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('You have been signed out.');
    expect(document.querySelector('.tok-toast-stack')).not.toBeNull();
    // Signed-out must NOT render as an inline login banner.
    expect(document.querySelector('.tok-auth-card .tok-auth-alert')).toBeNull();
  });
});
