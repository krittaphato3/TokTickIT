import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../../src/App';

// UI-01 — required Lab 1 test: the TokTickIT heading renders.
describe('App heading', () => {
  it('renders the TokTickIT heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /toktickit/i })).toBeInTheDocument();
  });
});
