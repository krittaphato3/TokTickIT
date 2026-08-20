import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test' },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test' },
];

function stubFetch(requesters: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/requesters')) {
        return { ok: true, status: 200, json: async () => requesters };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
}

// UI-07 — FR-13, BR-03, BR-05: the Development Requester selector renders the
// active requesters, defaults to one, and switching persists the selection.
describe('Development Requester selector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows a loading state, then the four active requesters with the caption', async () => {
    let resolveRequesters!: (value: unknown) => void;
    const deferred = new Promise((resolve) => {
      resolveRequesters = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/requesters')) {
          return deferred;
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }),
    );

    render(<App />);

    // Loading state is observable before the requesters resolve.
    expect(screen.getByText('Loading requesters…')).toBeInTheDocument();

    resolveRequesters({ ok: true, status: 200, json: async () => REQUESTERS });
    const select = await screen.findByRole('combobox', { name: 'Development Requester' });

    expect(select).toBeInTheDocument();
    expect(screen.getByText('Testing only — not real authentication')).toBeInTheDocument();
    const optionNames = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(optionNames).toEqual(REQUESTERS.map((r) => r.name));
    // Defaults to the first active requester.
    expect(select).toHaveValue('1');
  });

  it('switching requester persists the selection to localStorage', async () => {
    stubFetch(REQUESTERS);

    const user = userEvent.setup();
    render(<App />);
    const select = await screen.findByRole('combobox', { name: 'Development Requester' });

    await user.selectOptions(select, '3');

    expect(select).toHaveValue('3');
    expect(localStorage.getItem('toktickit.devRequesterId')).toBe('3');
  });

  it('restores a previously persisted active requester on load', async () => {
    localStorage.setItem('toktickit.devRequesterId', '2');
    stubFetch(REQUESTERS);

    render(<App />);
    const select = await screen.findByRole('combobox', { name: 'Development Requester' });

    expect(select).toHaveValue('2');
  });

  it('shows an error state with retry when the requesters request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const user = userEvent.setup();
    render(<App />);

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not load requesters');

    stubFetch(REQUESTERS);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('combobox', { name: 'Development Requester' })).toHaveValue(
      '1',
    );
  });
});