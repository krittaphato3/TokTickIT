import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const HEALTH_BODY = { status: 'ok', service: 'TokTickIT API' };
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
    // Deferred promises keep the request pending so the loading state is
    // observable before the success state renders.
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
      vi.fn().mockReturnValueOnce(healthPromise).mockReturnValueOnce(categoriesPromise),
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
