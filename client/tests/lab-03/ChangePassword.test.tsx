import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { sessionUser, stubAuthenticatedFetch } from '../helpers/auth';

// Forced-first-login flicker regression (ChangePasswordPage): after Save on
// #/change-password?first=1, the mustChangePassword=false update must never
// morph the page into the voluntary variant (Current Password + Back) during
// the 800ms banner window — a minimal interstitial shows instead.

function changePasswordHandler(url: string, init?: RequestInit) {
  if (!url.includes('/api/auth/change-password')) return undefined;
  const body = JSON.parse(String(init?.body ?? '{}'));
  expect(body.currentPassword).toBeUndefined();
  return {
    ok: true,
    status: 200,
    json: async () => ({
      user: { ...sessionUser(), mustChangePassword: false },
    }),
  } as unknown as Response;
}

function voluntaryChangePasswordHandler(url: string, init?: RequestInit) {
  if (!url.includes('/api/auth/change-password')) return undefined;
  const body = JSON.parse(String(init?.body ?? '{}'));
  expect(body.currentPassword).toBe('OldPass1!x');
  return {
    ok: true,
    status: 200,
    json: async () => ({
      user: { ...sessionUser(), mustChangePassword: false },
    }),
  } as unknown as Response;
}

function withWorkspace(handler: (url: string, init?: RequestInit) => Response | undefined) {
  return (url: string, init?: RequestInit) => {
    if (url.includes('/api/tickets')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
          meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/categories')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: 'Account and Access' }],
      } as unknown as Response;
    }
    return handler(url, init);
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.location.hash = '';
});

describe('ChangePassword forced-first flicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('never flashes Current Password or Back between Save and role-home navigation', async () => {
    window.location.hash = '#/change-password?first=1';
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(sessionUser({ mustChangePassword: true }), withWorkspace(changePasswordHandler)),
    );
    render(<App />);
    await screen.findByRole('heading', { name: /choose a new password/i });
    expect(document.getElementById('cp-current')).toBeNull();

    const flashes: string[] = [];
    const obs = new MutationObserver(() => {
      if (
        document.getElementById('cp-current') !== null ||
        screen.queryByPlaceholderText('Enter your current password') !== null ||
        screen.queryByRole('link', { name: /back/i }) !== null
      ) {
        flashes.push('voluntary-flash');
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

    try {
      await userEvent.type(screen.getByPlaceholderText('Create a new password'), 'NewPass1!x');
      await userEvent.type(screen.getByPlaceholderText('Re-enter new password'), 'NewPass1!x');
      await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));

      expect(await screen.findByText(/password saved\. continuing/i)).toBeInTheDocument();

      for (let i = 0; i < 20; i += 1) {
        await vi.advanceTimersByTimeAsync(50);
        expect(document.getElementById('cp-current')).toBeNull();
        expect(screen.queryByPlaceholderText('Enter your current password')).toBeNull();
        expect(screen.queryByRole('link', { name: /back/i })).toBeNull();
      }

      await waitFor(() => expect(window.location.hash).toBe('#/my'));
      expect(flashes).toEqual([]);
    } finally {
      obs.disconnect();
    }
  });

  it('shows a form-free interstitial (no inputs, no Back) after forced Save', async () => {
    window.location.hash = '#/change-password?first=1';
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(sessionUser({ mustChangePassword: true }), withWorkspace(changePasswordHandler)),
    );
    render(<App />);
    await screen.findByRole('heading', { name: /choose a new password/i });

    await userEvent.type(screen.getByPlaceholderText('Create a new password'), 'NewPass1!x');
    await userEvent.type(screen.getByPlaceholderText('Re-enter new password'), 'NewPass1!x');
    await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    expect(await screen.findByText(/password saved\. continuing/i)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById('cp-current')).toBeNull();
    expect(document.getElementById('cp-new')).toBeNull();
    expect(document.getElementById('cp-confirm')).toBeNull();
    expect(screen.queryByRole('link', { name: /back/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});

describe('ChangePassword voluntary mode', () => {
  it('keeps Back + Current Password and never shows the forced interstitial', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.location.hash = '#/change-password';
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(sessionUser({ mustChangePassword: false }), withWorkspace(voluntaryChangePasswordHandler)),
    );
    render(<App />);
    await screen.findByRole('heading', { name: /change password/i });

    expect(screen.getByPlaceholderText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Enter your current password'), 'OldPass1!x');
    await userEvent.type(screen.getByPlaceholderText('Create a new password'), 'NewPass1!x');
    await userEvent.type(screen.getByPlaceholderText('Re-enter new password'), 'NewPass1!x');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/password saved\. continuing/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
  });
});
