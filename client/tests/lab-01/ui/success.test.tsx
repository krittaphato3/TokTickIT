import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const HEALTH_BODY = { status: 'ok', service: 'TokTickIT API' };
const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test' },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test' },
];
const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
];

// UI-02 — required Lab 1 test: loading state changes to the category list
// after a successful API response.
describe('App success flow', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a loading state, then the category list on success', async () => {
    // Deferred promises keep the health request pending so the loading state
    // is observable. The app shell's requesters request resolves immediately.
    let resolveHealth!: (value: unknown) => void;
    let resolveCategories!: (value: unknown) => void;
    const healthPromise = new Promise((resolve) => {
      resolveHealth = resolve;
    });
    const categoriesPromise = new Promise((resolve) => {
      resolveCategories = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/requesters')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => REQUESTERS,
          });
        }
        if (url.includes('/api/health')) {
          return healthPromise;
        }
        return categoriesPromise;
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /check system/i }));
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();

    resolveHealth({ ok: true, status: 200, json: async () => HEALTH_BODY });
    resolveCategories({ ok: true, status: 200, json: async () => CATEGORIES });

    expect(await screen.findByText('System Status: Online')).toBeInTheDocument();
    expect(screen.getByText('Supported Request Categories:')).toBeInTheDocument();
    for (const category of CATEGORIES) {
      expect(screen.getByText(category.name)).toBeInTheDocument();
    }
  });
});