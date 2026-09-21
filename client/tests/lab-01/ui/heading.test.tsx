import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomeScreen from '../../../src/components/HomeScreen';

// UI-01 — required Lab 1 test: the TokTickIT heading renders.
// Lab 3 port: the foundation screen moved to its own component (the app shell
// is authentication-first now), so this test renders it directly — same
// component, same heading, no auth coupling.
describe('App heading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the TokTickIT heading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ categories: [] }) })),
    );
    render(<HomeScreen />);
    expect(await screen.findByRole('heading', { name: /toktickit/i })).toBeInTheDocument();
  });
});
