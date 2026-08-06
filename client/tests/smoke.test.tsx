import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('frontend foundation', () => {
  it('renders the TokTickIT brand with Bootstrap styling', () => {
    render(<App />);
    expect(screen.getByText('TokTickIT')).toBeInTheDocument();
  });
});
