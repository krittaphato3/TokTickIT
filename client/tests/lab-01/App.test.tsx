import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('App', () => {
  // UI-01 — required Lab 1 test: the TokTickIT heading renders.
  it('renders the TokTickIT heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /toktickit/i })).toBeInTheDocument();
  });

  // UI-02 / UI-03 — implemented in Issue 4: mock the api module with
  // vi.spyOn(api, 'checkSystem') and assert the Online list / Offline message.
  it.todo('shows Online and the seeded categories on success');
  it.todo('shows an Offline error message when the API is unavailable');
});
