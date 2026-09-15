import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// Lab 3 §6 — Staff Ticket Queue screen (ui-spec §6 / tests.md T-QUEUE-05).
// Renders <App /> as an authenticated IT_STAFF session (the same way the
// browser does) and drives the queue through its real controls. All network
// traffic is stubbed at fetch level; requests are recorded per URL.

const STAFF = sessionUser({ role: 'IT_STAFF', name: 'Sara IT' });

const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
];

const OWNERS = [
  { id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' },
  { id: 12, name: 'Tom IT', email: 'tom.it@toktickit.test' },
];

interface Seed {
  id: number;
  ticketNumber: string;
  title: string;
  status:
    | 'NEW'
    | 'OPEN'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_REQUESTER'
    | 'RESOLVED'
    | 'CLOSED'
    | 'REOPENED'
    | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  ownerId: number | null;
  categoryId: number;
}

function makeTicket(seed: Seed) {
  return {
    id: seed.id,
    ticketNumber: seed.ticketNumber,
    title: seed.title,
    status: seed.status,
    priority: seed.priority,
    itPriority: seed.itPriority,
    owner: seed.ownerId ? OWNERS.find((o) => o.id === seed.ownerId) ?? null : null,
    requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
    category: CATEGORIES.find((c) => c.id === seed.categoryId) ?? CATEGORIES[0],
    createdAt: `2026-09-${String(10 + (seed.id % 15)).padStart(2, '0')}T09:30:00.000Z`,
    updatedAt: `2026-09-${String(10 + (seed.id % 15)).padStart(2, '0')}T10:00:00.000Z`,
  };
}

function makeMeta(totalItems: number, page = 1, pageSize = 20) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// 25 tickets → 2 pages at pageSize 20; all 8 statuses and both owner states
// appear at least once.
const TITLES = [
  'Laptop will not boot after update',
  'Campus Wi-Fi drops every hour',
  'Printer jams on double-sided prints',
  'Cannot access library account',
  'VPN gateway rejects certificates',
];
const STATUSES: Seed['status'][] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
];
const PRIORITIES: Seed['priority'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const TICKETS: Seed[] = Array.from({ length: 25 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    ticketNumber: `TTK-2026-${String(n).padStart(6, '0')}`,
    title: `${TITLES[i % 5]} (#${n})`,
    status: STATUSES[i % 8],
    priority: PRIORITIES[i % 4],
    itPriority: i === 0 ? 'CRITICAL' : i === 3 ? null : 'MEDIUM',
    ownerId: i % 3 === 0 ? null : (i % 2 === 1 ? 11 : 12),
    categoryId: CATEGORIES[i % 4].id,
  };
});

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () => jsonResponse({ data: [], meta: makeMeta(0) });

let queueCalls: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paged(items: Seed[], pageSize = 20) {
  return (url: string) => {
    const params = new URL(url).searchParams;
    const page = Number(params.get('page') ?? '1');
    const start = (page - 1) * pageSize;
    return jsonResponse({
      data: items.slice(start, start + pageSize).map(makeTicket),
      meta: makeMeta(items.length, page, pageSize),
    });
  };
}

beforeEach(() => {
  queueCalls = [];
  fetchHandler = paged(TICKETS);
  vi.stubGlobal(
    'fetch',
    stubAuthenticatedFetch(STAFF, (url, init) => {
      if (url.includes('/api/categories')) return jsonResponse(CATEGORIES);
      if (url.includes('/api/staff/owners')) return jsonResponse(OWNERS);
      if (url.includes('/api/staff/tickets')) {
        queueCalls.push(url);
        return fetchHandler(url, init);
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openQueue(waitForRows = true) {
  window.location.hash = '#/staff/queue';
  render(<App />);
  await screen.findByRole('heading', { name: 'Ticket Queue', level: 1 });
  if (waitForRows) {
    await screen.findAllByText('TTK-2026-000001'); // first row rendered (table + card)
  }
}

describe('T-QUEUE-05a — shell gate and page frame', () => {
  it('renders the queue for an IT Staff session with result count', async () => {
    await openQueue();
    expect(screen.getByRole('heading', { name: 'Ticket Queue', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('25 tickets')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 20 of 25 tickets/)).toBeInTheDocument();
  });

  it('forbidden state replaces the queue when the session role is REQUESTER', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(sessionUser({ role: 'REQUESTER' }), () => jsonResponse({})),
    );
    window.location.hash = '#/staff/queue';
    render(<App />);
    expect(
      await screen.findByText('You do not have access to the staff queue.'),
    ).toBeInTheDocument();
    // No queue controls render for a forbidden role.
    expect(screen.queryByLabelText('Search by ticket number or summary')).not.toBeInTheDocument();
  });
});

describe('T-QUEUE-05b — nine-column table with sortable headers', () => {
  it('renders the documented columns in order plus the Open action column', async () => {
    await openQueue();
    const headers = within(document.querySelector('thead')!).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent?.trim())).toEqual([
      'Number',
      'Created',
      'Summary',
      'Category',
      'Req. Priority',
      'IT Priority',
      'Status',
      'Owner',
      'Updated',
      'Action',
    ]);
  });

  it('shows status, priority, Unset and Unassigned badge states', async () => {
    await openQueue();
    // 8-status set renders (at least the ones on page 1).
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reopened').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unset').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('sort clicks issue the documented query params and cycle aria-sort', async () => {
    const user = userEvent.setup();
    await openQueue();

    const numberHeader = screen.getByRole('button', { name: /Number/ }).closest('th')!;
    const createdHeader = screen.getByRole('button', { name: /Created/ }).closest('th')!;
    expect(numberHeader).toHaveAttribute('aria-sort', 'none');
    expect(createdHeader).toHaveAttribute('aria-sort', 'descending'); // BR-19 default

    await user.click(screen.getByRole('button', { name: /Number/ }));
    await vi.waitFor(() => {
      const url = queueCalls[queueCalls.length - 1];
      expect(url).toContain('sort=number&order=asc');
    });
    expect(numberHeader).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: /Updated/ }));
    await vi.waitFor(() => {
      expect(queueCalls[queueCalls.length - 1]).toContain('sort=updatedAt&order=desc');
    });
    expect(numberHeader).toHaveAttribute('aria-sort', 'none');
  });
});

describe('T-QUEUE-05c — search and filters issue documented params', () => {
  it('debounces search into q and resets page to 1', async () => {
    const user = userEvent.setup();
    await openQueue();
    const callsBefore = queueCalls.length;

    await user.type(screen.getByLabelText('Search by ticket number or summary'), 'vpn');
    expect(queueCalls.length).toBe(callsBefore); // no request inside debounce window

    await vi.waitFor(
      () => {
        expect(queueCalls[queueCalls.length - 1]).toContain('q=vpn');
      },
      { timeout: 1500 },
    );
    expect(new URL(queueCalls[queueCalls.length - 1]).searchParams.get('page')).toBe('1');
  });

  it('status, IT priority, requested priority, category and owner filters AND-combine', async () => {
    const user = userEvent.setup();
    await openQueue();

    await user.selectOptions(screen.getByLabelText('Current Status'), 'In Progress');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('status')).toBe('IN_PROGRESS');
    });

    await user.selectOptions(screen.getByLabelText('IT Priority'), 'Critical');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('itPriority')).toBe('CRITICAL');
      expect(params.get('status')).toBe('IN_PROGRESS');
    });

    await user.selectOptions(screen.getByLabelText('Requested Priority'), 'High');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('reqPriority')).toBe('HIGH');
    });

    await user.selectOptions(screen.getByLabelText('Category'), '2');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('categoryId')).toBe('2');
    });

    await user.selectOptions(screen.getByLabelText('Owner'), 'Tom IT');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('ownerId')).toBe('12');
    });

    // Owner=Unassigned maps to the assigned=false contract.
    await user.selectOptions(screen.getByLabelText('Owner'), 'Unassigned');
    await vi.waitFor(() => {
      const params = new URL(queueCalls[queueCalls.length - 1]).searchParams;
      expect(params.get('assigned')).toBe('false');
      expect(params.get('ownerId')).toBeNull();
    });
  });

  it('Clear Filters resets every control and returns to the unfiltered query', async () => {
    const user = userEvent.setup();
    await openQueue();
    await user.selectOptions(screen.getByLabelText('Owner'), 'Unassigned');
    await vi.waitFor(() => {
      expect(queueCalls[queueCalls.length - 1]).toContain('assigned=false');
    });

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await vi.waitFor(() => {
      const url = queueCalls[queueCalls.length - 1];
      expect(url).not.toContain('assigned=');
      expect(url).not.toContain('ownerId=');
    });
    expect(screen.getByLabelText('Owner')).toHaveValue('');
  });
});

describe('T-QUEUE-05d — pagination', () => {
  it('25 tickets span 2 pages; page 2 shows the remainder and disables Next', async () => {
    const user = userEvent.setup();
    await openQueue();

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(within(nav).getByRole('button', { name: '‹ Previous' })).toBeDisabled();

    await user.click(within(nav).getByRole('button', { name: '2' }));
    expect(await screen.findByText(/Showing 21 to 25 of 25 tickets/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: /pagination/i })).getByRole('button', {
        name: 'Next ›',
      }),
    ).toBeDisabled();
    await vi.waitFor(() => {
      expect(queueCalls[queueCalls.length - 1]).toContain('page=2');
    });
  });
});

describe('T-QUEUE-05e — open-detail action', () => {
  it('Open navigates to the staff ticket detail route', async () => {
    const user = userEvent.setup();
    await openQueue();
    await user.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    await vi.waitFor(() => {
      expect(window.location.hash).toContain('#/staff/tickets/TTK-2026-');
    });
  });
});

describe('T-QUEUE-05f — feedback states', () => {
  it('loading state shows skeleton rows before data arrives', async () => {
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    fetchHandler = async () => {
      await gate;
      return jsonResponse({ data: [], meta: makeMeta(0) });
    };

    window.location.hash = '#/staff/queue';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ticket Queue', level: 1 })).toBeInTheDocument();
    const skeletons = await screen.findAllByTestId('skeleton-row');
    expect(skeletons).toHaveLength(3);
    release(undefined);
    await screen.findByText('No tickets in the queue yet.');
  });

  it('empty queue (no tickets in system) shows the empty state', async () => {
    fetchHandler = () => jsonResponse({ data: [], meta: makeMeta(0) });
    await openQueue(false);
    expect(await screen.findByText('No tickets in the queue yet.')).toBeInTheDocument();
    expect(screen.queryByText('No tickets match these filters.')).not.toBeInTheDocument();
  });

  it('filters matching nothing show the no-results state with Clear filters', async () => {
    const user = userEvent.setup();
    fetchHandler = (url) => {
      if (new URL(url).searchParams.get('status')) {
        return jsonResponse({ data: [], meta: makeMeta(0) });
      }
      return paged(TICKETS)(url);
    };
    await openQueue();
    await user.selectOptions(screen.getByLabelText('Current Status'), 'In Progress');
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument();
    expect(screen.queryByText('No tickets in the queue yet.')).not.toBeInTheDocument();
  });

  it('failure shows the alert banner and preserves filters on Try again', async () => {
    const user = userEvent.setup();
    fetchHandler = () => jsonResponse({ error: 'boom' }, 500);
    window.location.hash = '#/staff/queue';
    render(<App />);
    await screen.findByRole('heading', { name: 'Ticket Queue', level: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the queue. Your filters are preserved.',
    );

    await user.type(screen.getByLabelText('Search by ticket number or summary'), 'vpn');
    await vi.waitFor(() => {
      expect(queueCalls[queueCalls.length - 1]).toContain('q=vpn');
    });

    const callsAtFailure = queueCalls.length;
    fetchHandler = paged(TICKETS);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    // The retry re-issues the same query (including the typed q=vpn) and
    // recovers into the ready state with rows rendered.
    await screen.findAllByText('TTK-2026-000001');
    const lastUrl = queueCalls[queueCalls.length - 1];
    expect(lastUrl).toContain('q=vpn');
    expect(queueCalls.length).toBeGreaterThan(callsAtFailure);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
