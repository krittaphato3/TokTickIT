import { describe, expect, it } from 'vitest';
import {
  GATE_REASONS,
  TICKET_STATUSES,
  allowedTransitions,
  confirmPrompt,
  evaluateResolutionGate,
  isPermitted,
  requiresReason,
  transitionTargets,
  type TicketStatus,
} from '../../src/services/transition-matrix.js';

// L4-3 — UNIT-01..UNIT-03 (docs/lab-04/tests.md §2) for the ONE pure module
// that owns the ticket lifecycle. There is no Prisma, no HTTP and no database
// here on purpose: BR-09 says a single server module is the only source of
// transitions, so the module must be exhaustively checkable in isolation and
// the API/UI layers may only consume its answers.

// BR-09 — the frozen matrix, transcribed independently from specification.md
// §5 so the test cannot pass by re-using the implementation's own table.
const EXPECTED: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
};

describe('UNIT-01 — the BR-09 matrix, every from × to pair (AC-09)', () => {
  it('exposes exactly the eight documented statuses', () => {
    expect([...TICKET_STATUSES].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(TICKET_STATUSES).toHaveLength(8);
  });

  it.each(TICKET_STATUSES)('%s exposes exactly its permitted targets', (from) => {
    expect([...transitionTargets(from)].sort()).toEqual([...EXPECTED[from]].sort());
  });

  // All 64 pairs: permitted pairs accept, every other pair (including every
  // self-transition and every transition out of the terminal Cancelled row)
  // is rejected.
  const pairs: Array<{ from: TicketStatus; to: TicketStatus; permitted: boolean }> = [];
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      pairs.push({ from, to, permitted: EXPECTED[from].includes(to) });
    }
  }

  it('covers all 64 pairs', () => {
    expect(pairs).toHaveLength(64);
    expect(pairs.filter((p) => p.permitted)).toHaveLength(23);
  });

  it.each(pairs)('isPermitted($from, $to) === $permitted', ({ from, to, permitted }) => {
    expect(isPermitted(from, to)).toBe(permitted);
  });

  it('rejects every self-transition as a no-op, in the matrix and not only in the API', () => {
    for (const status of TICKET_STATUSES) {
      expect(isPermitted(status, status)).toBe(false);
    }
  });

  it('makes Cancelled terminal — no targets, no inbound path except the documented ones', () => {
    expect(transitionTargets('CANCELLED')).toEqual([]);
    const inbound = TICKET_STATUSES.filter((from) => isPermitted(from, 'CANCELLED'));
    expect([...inbound].sort()).toEqual(
      ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'].sort(),
    );
  });

  it('is pure — repeated calls return equal results and never mutate the table', () => {
    const first = transitionTargets('OPEN');
    const second = transitionTargets('OPEN');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect([...second]).toEqual(EXPECTED.OPEN);
  });
});

describe('UNIT-02 — allowedTransitions derivation (AC-09)', () => {
  it.each(TICKET_STATUSES)('IT Staff sees the matrix for %s', (status) => {
    expect([...allowedTransitions(status, 'IT_STAFF')].sort()).toEqual([...EXPECTED[status]].sort());
  });

  it.each(TICKET_STATUSES)('Admin performs staff operations for %s (D-01/BR-15)', (status) => {
    expect([...allowedTransitions(status, 'ADMINISTRATOR')]).toEqual([
      ...allowedTransitions(status, 'IT_STAFF'),
    ]);
  });

  it.each(TICKET_STATUSES)('Requester can transition nothing from %s (BR-08/BR-09)', (status) => {
    expect(allowedTransitions(status, 'REQUESTER')).toEqual([]);
  });

  it('unknown roles get nothing', () => {
    expect(allowedTransitions('OPEN', 'SOMETHING_ELSE')).toEqual([]);
  });

  it('a terminal ticket yields an empty list the UI can render as "no further status changes"', () => {
    expect(allowedTransitions('CANCELLED', 'IT_STAFF')).toEqual([]);
  });
});

describe('UNIT-03 — resolution gate evaluator (BR-10, AC-10)', () => {
  const satisfied = { actionCount: 1, openFollowUpCount: 0, summary: 'Replaced the port.' };

  it('returns no reasons only when all three conditions hold', () => {
    expect(evaluateResolutionGate(satisfied)).toEqual([]);
    expect(evaluateResolutionGate({ ...satisfied, summary: '  Padded but present.  ' })).toEqual([]);
  });

  it('reports NO_ACTIONS when the ticket has no recorded action', () => {
    expect(evaluateResolutionGate({ ...satisfied, actionCount: 0 })).toEqual(['NO_ACTIONS']);
  });

  it('reports OPEN_FOLLOW_UP when any action still requires follow-up', () => {
    expect(evaluateResolutionGate({ ...satisfied, openFollowUpCount: 1 })).toEqual(['OPEN_FOLLOW_UP']);
    expect(evaluateResolutionGate({ ...satisfied, openFollowUpCount: 3 })).toEqual(['OPEN_FOLLOW_UP']);
  });

  it.each([undefined, null, '', '   ', '\n\t '])(
    'reports MISSING_SUMMARY for the empty summary %j',
    (summary) => {
      expect(evaluateResolutionGate({ ...satisfied, summary })).toEqual(['MISSING_SUMMARY']);
    },
  );

  it('reports every applicable reason together, in the documented order', () => {
    expect(
      evaluateResolutionGate({ actionCount: 0, openFollowUpCount: 2, summary: '   ' }),
    ).toEqual(['NO_ACTIONS', 'OPEN_FOLLOW_UP', 'MISSING_SUMMARY']);
  });

  it('uses exactly the documented reason vocabulary', () => {
    expect([...GATE_REASONS]).toEqual(['NO_ACTIONS', 'OPEN_FOLLOW_UP', 'MISSING_SUMMARY']);
  });
});

describe('transition metadata — confirmation and reopen reason', () => {
  it('asks for confirmation before cancelling, from every cancel-capable source', () => {
    for (const from of ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const) {
      expect(confirmPrompt(from, 'CANCELLED')).toBe('Cancel this ticket?');
    }
  });

  it('asks for confirmation before resolving and before closing or reopening', () => {
    expect(confirmPrompt('OPEN', 'RESOLVED')).toBe('Mark this ticket resolved?');
    expect(confirmPrompt('REOPENED', 'RESOLVED')).toBe('Mark this ticket resolved?');
    expect(confirmPrompt('RESOLVED', 'CLOSED')).toBe('Close this ticket?');
    expect(confirmPrompt('RESOLVED', 'REOPENED')).toMatch(/reopen/i);
    expect(confirmPrompt('CLOSED', 'REOPENED')).toMatch(/reopen/i);
  });

  it('needs no confirmation for the plain progression transitions', () => {
    expect(confirmPrompt('NEW', 'OPEN')).toBeNull();
    expect(confirmPrompt('NEW', 'IN_PROGRESS')).toBeNull();
    expect(confirmPrompt('IN_PROGRESS', 'OPEN')).toBeNull();
    expect(confirmPrompt('WAITING_FOR_REQUESTER', 'IN_PROGRESS')).toBeNull();
  });

  it('never invents confirmation metadata for a rejected pair', () => {
    expect(confirmPrompt('CANCELLED', 'REOPENED')).toBeNull();
    expect(confirmPrompt('OPEN', 'OPEN')).toBeNull();
  });

  it('requires a recorded reason only when reopening a resolved or closed ticket', () => {
    expect(requiresReason('RESOLVED', 'REOPENED')).toBe(true);
    expect(requiresReason('CLOSED', 'REOPENED')).toBe(true);
    expect(requiresReason('NEW', 'OPEN')).toBe(false);
    expect(requiresReason('OPEN', 'CANCELLED')).toBe(false);
    expect(requiresReason('CANCELLED', 'REOPENED')).toBe(false);
  });
});
