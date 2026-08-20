import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test' },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test' },
];

// UI-01 — required Lab 1 test: the TokTickIT heading renders.
describe('App heading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the TokTickIT heading', async () => {
    // The app shell loads the Development Requester list on mount (Issue 3);
    // stub it by URL so the whole app renders without a live API.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/requesters')) {
          return { ok: true, status: 200, json: async () => REQUESTERS };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    render(<App />);
    expect(await screen.findByRole('heading', { name: /toktickit/i })).toBeInTheDocument();
  });
});