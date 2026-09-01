import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test' },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test' },
];

// UI-03 — required Lab 1 test: API failure displays a useful error message.
describe('App failure flow', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows an offline error message when the API is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        // The app shell's requester list resolves so the only failure under
        // test is the Check System health call.
        if (url.includes('/api/requesters')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => REQUESTERS,
          });
        }
        return Promise.reject(new Error('Network error'));
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /check system/i }));

    expect(await screen.findByText('System Status: Offline')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect to TokTickIT API');
  });
});