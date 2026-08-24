import { describe, expect, it } from 'vitest';
import {
  PRIORITY_RANK,
  compareByPriority,
} from '../../../src/services/ticket.service.js';

// UT-02 — FR-07, BR-09, AC-10. The priority-rank map used by the sort
// comparator orders tickets Critical > High > Medium > Low regardless of the
// alphabetical order of the enum labels.
describe('priorityRank comparator (UT-02)', () => {
  it('maps each priority to its rank: LOW 1 → CRITICAL 4', () => {
    expect(PRIORITY_RANK.LOW).toBe(1);
    expect(PRIORITY_RANK.MEDIUM).toBe(2);
    expect(PRIORITY_RANK.HIGH).toBe(3);
    expect(PRIORITY_RANK.CRITICAL).toBe(4);
  });

  it('ranks are strictly increasing across LOW, MEDIUM, HIGH, CRITICAL', () => {
    expect(PRIORITY_RANK.LOW).toBeLessThan(PRIORITY_RANK.MEDIUM);
    expect(PRIORITY_RANK.MEDIUM).toBeLessThan(PRIORITY_RANK.HIGH);
    expect(PRIORITY_RANK.HIGH).toBeLessThan(PRIORITY_RANK.CRITICAL);
  });

  it('orders a single ticket of each priority Critical > High > Medium > Low', () => {
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
    // Descending by rank is the comparator's contract...
    const descending = [...priorities].sort(
      (a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a],
    );
    expect(descending).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
    // ...and reversing gives the ascending order.
    const ascending = [...priorities].sort(
      (a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b],
    );
    expect(ascending).toEqual(priorities);
  });

  it('sorts mixed tickets by rank descending via compareByPriority', () => {
    const tickets = [
      { id: 1, priority: 'MEDIUM' as const },
      { id: 2, priority: 'CRITICAL' as const },
      { id: 3, priority: 'LOW' as const },
      { id: 4, priority: 'HIGH' as const },
    ];
    const sorted = [...tickets].sort(compareByPriority);
    expect(sorted.map((t) => t.priority)).toEqual([
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]);
  });

  it('treats equal priorities as equal so a secondary sort can decide', () => {
    expect(compareByPriority({ priority: 'HIGH' }, { priority: 'HIGH' })).toBe(0);
    // Highest-first ordering: LOW compares after HIGH.
    expect(compareByPriority({ priority: 'LOW' }, { priority: 'HIGH' })).toBeGreaterThan(0);
  });
});
