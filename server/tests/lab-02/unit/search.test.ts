import { describe, expect, it } from 'vitest';
import {
  buildIlikePattern,
  buildSearchFilter,
  normalizeSearchTerm,
} from '../../../src/services/ticket.service.js';

// UT-03 — FR-05, BR-07, AC-08. Search-term normalization: trim + lowercase
// case-insensitive substring semantics over title OR description; an empty
// term means "no search" and must match everything.
describe('search normalization (UT-03)', () => {
  it('trims surrounding whitespace and lowercases the term', () => {
    expect(normalizeSearchTerm('  NETWORK  ')).toBe('network');
    expect(normalizeSearchTerm('\tPrinter Jam\n')).toBe('printer jam');
    expect(normalizeSearchTerm('MiXeD CaSe')).toBe('mixed case');
  });

  it('collapses absent, empty, and whitespace-only terms to null (no search)', () => {
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm('')).toBeNull();
    expect(normalizeSearchTerm('   ')).toBeNull();
  });

  it('wraps the normalized term into a %term% ILIKE pattern', () => {
    expect(buildIlikePattern('Network')).toBe('%network%');
    expect(buildIlikePattern('  printer jam ')).toBe('%printer jam%');
  });

  it('escapes SQL LIKE wildcards so %, _, and backslash match literally', () => {
    // The pattern is a bound ILIKE parameter: % and _ must be backslash-
    // escaped to be literals, and a literal backslash in the term must be
    // escaped itself. (Terms are lowercased by normalizeSearchTerm.)
    expect(buildIlikePattern('100%')).toBe('%100\\%%');
    expect(buildIlikePattern('a_b')).toBe('%a\\_b%');
    expect(buildIlikePattern('C:\\temp')).toBe('%c:\\\\temp%');
    expect(buildIlikePattern('%_\\')).toBe('%\\%\\_\\\\%');
  });

  it('builds a title OR description ILIKE filter that matches either field', () => {
    const filter = buildSearchFilter('network')!;
    const sql = filter.sql ?? filter.toString();
    // The fragment must reference both columns with the same bound pattern.
    expect(sql).toContain('t."title" ILIKE');
    expect(sql).toContain("COALESCE(t.\"description\", '') ILIKE");
    expect(sql).toContain('OR');

    // Simulate the predicate as ILIKE would evaluate it on PostgreSQL using
    // the pattern the fragment binds.
    const pattern = buildIlikePattern('network')!;
    const literal = pattern.slice(1, -1); // strip the wrapping %
    const matches = (title: string, description: string | null) =>
      title.toLowerCase().includes(literal) ||
      (description !== null && description.toLowerCase().includes(literal));

    expect(matches('VPN drops', 'A stable network is needed')).toBe(true);
    expect(matches('Network printer offline', null)).toBe(true);
    expect(matches('Keyboard sticky', 'Keys stick')).toBe(false);
  });

  it('an empty/whitespace term yields no filter at all (match all rows)', () => {
    expect(buildSearchFilter('')).toBeNull();
    expect(buildSearchFilter('   ')).toBeNull();
  });
});
