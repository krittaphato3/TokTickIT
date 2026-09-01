import { describe, expect, it } from 'vitest';
import { buildTicketNumber } from '../../../src/services/ticket.service.js';

// UT-01 — FR-02, BR-01, AC-01. The ticket-number formatter emits the
// labsheet format TTK-<current year>-<6 zero-padded digits> and consecutive
// sequence values produce strictly increasing, unique numbers.
describe('ticketNumber formatter (UT-01)', () => {
  const year = new Date().getFullYear();

  it('formats single-digit sequence values with 5 leading zeros', () => {
    expect(buildTicketNumber(1)).toBe(`TTK-${year}-000001`);
    expect(buildTicketNumber(9)).toBe(`TTK-${year}-000009`);
  });

  it('zero-pads to exactly 6 digits for mid-range values', () => {
    expect(buildTicketNumber(42)).toBe(`TTK-${year}-000042`);
    expect(buildTicketNumber(123456)).toBe(`TTK-${year}-123456`);
  });

  it('keeps the maximum 6-digit value unpadded', () => {
    expect(buildTicketNumber(999999)).toBe(`TTK-${year}-999999`);
  });

  it('produces strictly increasing numbers for consecutive sequence values', () => {
    const nums = [1, 2, 3, 100, 101, 999998].map((v) => buildTicketNumber(v));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i] > nums[i - 1]).toBe(true);
    }
  });

  it('always matches TTK-<4-digit year>-<6 digits>', () => {
    for (const v of [1, 7, 404, 99999, 999999]) {
      expect(buildTicketNumber(v)).toMatch(/^TTK-\d{4}-\d{6}$/);
    }
  });
});