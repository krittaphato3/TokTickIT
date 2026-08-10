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

function mockFetchFailure(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the TokTickIT heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /toktickit/i })).toBeInTheDocument();
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
    expect(screen.queryByText('Unable to connect to TokTickIT API')).not.toBeInTheDocument();
  });

  it('shows an offline error message when the API is unavailable', async () => {
    mockFetchFailure();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /check system/i }));

    expect(await screen.findByText('System Status: Offline')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect to TokTickIT API');
  });
});
