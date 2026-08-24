import { describe, expect, it } from 'vitest';
import {
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

  it('builds a title OR description contains filter that matches either field', () => {
    const filter = buildSearchFilter('network')!;
    const vpnTicket = { title: 'VPN drops', description: 'A stable network is needed' };
    const printerTicket = { title: 'Network printer offline', description: null };
    const unrelated = { title: 'Keyboard sticky', description: 'Keys stick' };

    // Prisma `contains` is evaluated per field with OR — simulate the
    // predicate case-insensitively as ILIKE would on PostgreSQL.
    const matches = (ticket: typeof vpnTicket) =>
      ((filter.OR[0].title as { contains: string }).contains &&
        ticket.title
          .toLowerCase()
          .includes(
            (filter.OR[0].title as { contains: string }).contains.toLowerCase(),
          )) ||
      (ticket.description !== null &&
        ticket.description
          .toLowerCase()
          .includes(
            (filter.OR[1].description as { contains: string }).contains.toLowerCase(),
          ));

    expect(matches(vpnTicket)).toBe(true);
    expect(matches(printerTicket)).toBe(true);
    expect(matches(unrelated)).toBe(false);
  });

  it('an empty/whitespace term yields no filter at all (match all rows)', () => {
    expect(buildSearchFilter('')).toBeNull();
    expect(buildSearchFilter('   ')).toBeNull();
  });
});
