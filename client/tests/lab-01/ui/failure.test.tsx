import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

// UI-03 — required Lab 1 test: API failure displays a useful error message.
describe('App failure flow', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows an offline error message when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /check system/i }));

    expect(await screen.findByText('System Status: Offline')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect to TokTickIT API');
  });
});
