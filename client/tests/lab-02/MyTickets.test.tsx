import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

// Issue #30 — My Tickets v2 (UI-04..06, UI-11..15). The screen is the
// nine-column fluid table from ui-spec §10 backed by the extended
// GET /api/tickets contract.

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
];

const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
];

interface SeedTicket {
  id: number;
  ticketNumber: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'OPEN' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  ownerName: string | null;
  category: { id: number; name: string };
}

function makeTicket(seed: SeedTicket) {
  return {
    id: seed.id,
    ticketNumber: seed.ticketNumber,
    title: seed.title,
    description: null,
    status: seed.status,
    priority: seed.priority,
    itPriority: seed.itPriority,
    ownerName: seed.ownerName,
    category: seed.category,
    relatedSystem: { id: 1, name: 'Email Server' },
    createdAt: `2026-08-${String(10 + (seed.id % 15)).padStart(2, '0')}T09:30:00.000Z`,
    updatedAt: `2026-08-${String(10 + (seed.id % 15)).padStart(2, '0')}T10:00:00.000Z`,
  };
}

function makeMeta(totalItems: number, page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// Every recorded list call: URL + headers, in order.
let listCalls: Array<{ url: string; headers: Record<string, string> }> = [];
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () => new Response('{}', { status: 500 });

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  listCalls = [];
  fetchHandler = () => jsonResponse({ data: [], meta: makeMeta(0) });
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let handlerResponse: Response | Promise<Response>;
      if (url.includes('/api/requesters')) {
        handlerResponse = jsonResponse(REQUESTERS);
      } else if (url.includes('/api/categories')) {
        handlerResponse = jsonResponse(CATEGORIES);
      } else if (url.includes('/api/tickets?') || /[/?]api\/tickets$/.test(url)) {
        listCalls.push({
          url,
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        handlerResponse = fetchHandler(url, init);
      } else {
        handlerResponse = jsonResponse([]);
      }
      return Promise.resolve(handlerResponse);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openTicketsList() {
  window.location.hash = '#/tickets';
  render(<App />);
  await screen.findByRole('heading', { name: 'My Tickets', level: 1 });
}

// Ticket numbers render in both the desktop row and the mobile card; wait
// for either and return it.
function findTicketLink() {
  return screen.findAllByText('TTK-2026-000001');
}

const TITLES = [
  'Laptop will not boot after update',
  'Campus Wi-Fi drops every hour',
  'Printer jams on double-sided prints',
  'Cannot access library account',
];

const PRIORITIES = ['HIGH', 'MEDIUM', 'CRITICAL', 'LOW'] as const;

// 14 tickets → 2 pages at pageSize 10; every badge variant appears at least
// once across the set.
const TICKETS: SeedTicket[] = Array.from({ length: 14 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    ticketNumber: `TTK-2026-${String(n).padStart(6, '0')}`,
    title: `${TITLES[i % 4]} (#${n})`,
    priority: PRIORITIES[i % 4],
    status:
      i % 5 === 0
        ? 'NEW'
        : i % 5 === 1
          ? 'OPEN'
          : i % 5 === 2
            ? 'IN_PROGRESS'
            : i % 5 === 3
              ? 'RESOLVED'
              : 'PENDING',
    itPriority: i === 0 ? 'CRITICAL' : i === 3 ? null : 'MEDIUM',
    ownerName: i === 1 ? null : i % 2 === 0 ? 'Michael Brown' : 'Sarah Johnson',
    category: CATEGORIES[i % 4],
  };
});

describe('UI-04 — initial load renders skeleton then data; failure shows retry', () => {
  it('shows shimmer skeleton rows while the request is in flight', async () => {
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    fetchHandler = async () => {
      await gate;
      return jsonResponse({ data: [], meta: makeMeta(0) });
    };

    window.location.hash = '#/tickets';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'My Tickets', level: 1 })).toBeInTheDocument();
    const skeletons = await screen.findAllByTestId('skeleton-row');
    expect(skeletons).toHaveLength(3);
    release(undefined);
    await screen.findByText('No tickets yet');
  });

  it('failure renders an alert banner with Try again and preserves filter state across retry', async () => {
    const user = userEvent.setup();
    fetchHandler = () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 });

    await openTicketsList();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your tickets. Your filters are preserved.",
    );

    // Set a filter while failed so we can prove it survives the retry.
    await user.type(screen.getByPlaceholderText('Search by ticket number or summary...'), 'vpn');
    // Wait for the debounce to commit and re-issue (still failing).
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url).toContain('search=vpn');
    });

    const callsAfterFailure = listCalls.length;
    fetchHandler = () =>
      jsonResponse({
        data: [makeTicket(TICKETS[0])],
        meta: makeMeta(1),
      });

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await findTicketLink()).length).toBeGreaterThan(0);

    // The retry re-issues the same query including the typed search term.
    const lastUrl = listCalls[listCalls.length - 1].url;
    expect(lastUrl).toContain('search=vpn');
    expect(listCalls.length).toBeGreaterThan(callsAfterFailure);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('UI-05 — distinct empty vs no-results states', () => {
  it('zero tickets with no filters shows "No tickets yet" with create CTA', async () => {
    fetchHandler = (url) => {
      if (new URL(url).searchParams.get('categoryId') === '999') {
        return jsonResponse({ data: [], meta: makeMeta(0) });
      }
      return jsonResponse({ data: [], meta: makeMeta(0) });
    };
    await openTicketsList();
    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create your first ticket' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No results match your filters')).not.toBeInTheDocument();
  });

  it('filters matching nothing show "No results match your filters" with Clear filters', async () => {
    const user = userEvent.setup();
    // Only respond with rows when no category filter is applied, so the
    // Category=Network choice genuinely matches nothing.
    fetchHandler = (url) => {
      if (new URL(url).searchParams.get('categoryId')) {
        return jsonResponse({ data: [], meta: makeMeta(0) });
      }
      return jsonResponse({
        data: TICKETS.map(makeTicket),
        meta: makeMeta(TICKETS.length),
      });
    };

    await openTicketsList();
    await findTicketLink();

    await user.selectOptions(screen.getByLabelText('Category'), '3');
    expect(await screen.findByText('No results match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByText('No tickets yet')).not.toBeInTheDocument();

    // The inline clear restores the unfiltered view.
    const cleared = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(cleared[cleared.length - 1]);
    expect((await findTicketLink()).length).toBeGreaterThan(0);
  });
});

describe('UI-06 — debounced search, filters issue correct API params', () => {
  beforeEach(() => {
    fetchHandler = () =>
      jsonResponse({ data: TICKETS.map(makeTicket), meta: makeMeta(TICKETS.length) });
  });

  it('debounces search input by 300ms before issuing a request', async () => {
    const user = userEvent.setup();
    await openTicketsList();
    await findTicketLink();
    const callsBeforeTyping = listCalls.length;

    await user.type(
      screen.getByPlaceholderText('Search by ticket number or summary...'),
      'laptop',
    );
    // No request should fire while typing within the debounce window.
    expect(listCalls.length).toBe(callsBeforeTyping);

    await vi.waitFor(
      () => {
        expect(listCalls.length).toBe(callsBeforeTyping + 1);
      },
      { timeout: 1500 },
    );
    expect(listCalls[listCalls.length - 1].url).toContain('search=laptop');
  });

  it('the search × clear button empties the field and refetches without the param', async () => {
    const user = userEvent.setup();
    await openTicketsList();
    const input = screen.getByPlaceholderText('Search by ticket number or summary...');
    await user.type(input, 'printer');
    await vi.waitFor(() => {
      expect(listCalls.some((c) => c.url.includes('search=printer'))).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    await vi.waitFor(() => {
      const latest = listCalls[listCalls.length - 1].url;
      expect(latest).not.toContain('search=');
    });
  });

  it('Requested Priority / IT Priority / Status selects send their params and reset page to 1', async () => {
    const user = userEvent.setup();
    await openTicketsList();
    await findTicketLink();

    await user.selectOptions(screen.getByLabelText('IT Priority'), 'CRITICAL');
    await vi.waitFor(() => {
      const url = listCalls[listCalls.length - 1].url;
      expect(url).toContain('itPriority=CRITICAL');
      expect(new URL(url).searchParams.get('page')).toBe('1');
    });

    await user.selectOptions(screen.getByLabelText('Current Status'), 'Open');
    await vi.waitFor(() => {
      const url = listCalls[listCalls.length - 1].url;
      const params = new URL(url).searchParams;
      expect(params.get('status')).toBe('OPEN');
      expect(params.get('itPriority')).toBe('CRITICAL'); // AND-combined
      expect(params.get('page')).toBe('1');
    });

    await user.selectOptions(screen.getByLabelText('Requested Priority'), 'High');
    await vi.waitFor(() => {
      const params = new URL(listCalls[listCalls.length - 1].url).searchParams;
      expect(params.get('priority')).toBe('HIGH');
      expect(params.get('status')).toBe('OPEN');
      expect(params.get('page')).toBe('1');
    });
  });

  it('every list call carries the X-Dev-Requester-Id header of the active requester', async () => {
    await openTicketsList();
    await findTicketLink();
    for (const call of listCalls) {
      expect(call.headers['X-Dev-Requester-Id']).toBe('1');
    }
  });
});

describe('UI-13 — nine-column table with sortable headers cycling aria-sort', () => {
  beforeEach(() => {
    fetchHandler = () =>
      jsonResponse({ data: TICKETS.map(makeTicket), meta: makeMeta(TICKETS.length) });
  });

  it('renders exactly the nine documented columns in order', async () => {
    await openTicketsList();
    await findTicketLink();
    const headers = within(document.querySelector('thead')!).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent?.trim())).toEqual([
      'Ticket No.',
      'Created Date',
      'Summary',
      'Category',
      'Requested Priority',
      'IT Priority',
      'Current Status',
      'Ticket Owner',
      'Last Updated',
    ]);
  });

  it('displays IT Priority badges incl. "Unset" and Ticket Owner incl. "Unassigned"', async () => {
    await openTicketsList();
    await findTicketLink();
    expect((await screen.findAllByText((_, el) => el?.classList.contains('pri-critical') === true)).length).toBeGreaterThan(0); // row 1 IT badge (table + mobile card)
    expect(screen.getAllByText('Unset').length).toBeGreaterThan(0); // row 4 null IT priority
    expect(screen.getByText('Unassigned')).toBeInTheDocument(); // row 2 null owner
  });

  it('cycles ascending→descending on repeated clicks and resets direction when switching columns', async () => {
    const user = userEvent.setup();
    await openTicketsList();
    await findTicketLink();

    const ticketHeader = screen.getByRole('button', { name: /Ticket No\./ }).closest('th')!;
    const createdHeader = screen.getByRole('button', { name: /Created Date/ }).closest('th')!;
    expect(ticketHeader).toHaveAttribute('aria-sort', 'none');
    expect(createdHeader).toHaveAttribute('aria-sort', 'descending'); // dates default desc

    await user.click(screen.getByRole('button', { name: /Ticket No\./ }));
    expect(ticketHeader).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: /Ticket No\./ }));
    expect(ticketHeader).toHaveAttribute('aria-sort', 'descending');

    // Switching columns applies that column's natural default (dates → desc).
    await user.click(screen.getByRole('button', { name: /Last Updated/ }));
    const updatedHeader = screen.getByRole('button', { name: /Last Updated/ }).closest('th')!;
    expect(updatedHeader).toHaveAttribute('aria-sort', 'descending');
    expect(ticketHeader).toHaveAttribute('aria-sort', 'none');
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url).toContain('sortBy=updatedAt&sortDir=desc');
    });
  });
});

describe('UI-14 — pagination window, showing text, bounds, scroll reset', () => {
  // 55 tickets → 6 pages; exercises both ellipsis shapes.
  const MANY = SeedMany(57);

  function SeedMany(count: number): SeedTicket[] {
    return Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      return {
        id: n,
        ticketNumber: `TTK-2026-${String(n).padStart(6, '0')}`,
        title: `Bulk ticket ${n}`,
        priority: PRIORITIES[n % 4],
        status: 'OPEN',
        itPriority: null,
        ownerName: null,
        category: CATEGORIES[0],
      };
    });
  }

  function manyPage(url: string) {
    const params = new URL(url).searchParams;
    const page = Number(params.get('page') ?? '1');
    const start = (page - 1) * 8;
    const slice = MANY.slice(start, start + 8);
    return jsonResponse({
      data: slice.map(makeTicket),
      meta: makeMeta(MANY.length, page, 8),
    });
  }

  it('shows "Showing 1 to 8 of 57 tickets" with window 1..5 … 8', async () => {
    fetchHandler = manyPage;
    await openTicketsList();
    expect(await screen.findByText(/Showing 1 to 8 of 57 tickets/)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    const buttons = within(nav).getAllByRole('button');
    // The ellipsis is a non-interactive <span>, so it is not a button.
    expect(buttons.map((b) => b.textContent)).toEqual([
      '‹ Previous',
      '1',
      '2',
      '3',
      '4',
      '5',
      '8',
      'Next ›',
    ]);
    expect(within(nav).getByText('…')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: '‹ Previous' })).toBeDisabled();
  });

  it('mid-window shows exactly five numbered buttons around the current page', async () => {
    const user = userEvent.setup();
    fetchHandler = manyPage;
    await openTicketsList();
    await screen.findByText(/Showing 1 to 8/);

    await user.click(screen.getByRole('button', { name: 'Next ›' }));
    expect(await screen.findByText(/Showing 9 to 16 of 57 tickets/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /pagination/i });
    const numbers = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /^\d+$/.test(t));
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '8']);
    expect(within(nav).getByText('…')).toBeInTheDocument();

    expect(within(nav).getByRole('button', { name: 'Next ›' })).toBeEnabled();
    // Last page holds only the remainder: item 57 alone.
    await user.click(within(nav).getByRole('button', { name: '8' }));
    expect(await screen.findByText(/Showing 57 to 57 of 57 tickets/)).toBeInTheDocument();
    const lastNav = screen.getByRole('navigation', { name: /pagination/i });
    expect(
      within(lastNav).getAllByRole('button').map((b) => b.textContent),
    ).toEqual(['‹ Previous', '1', '4', '5', '6', '7', '8', 'Next ›']);
    expect(within(lastNav).getByRole('button', { name: 'Next ›' })).toBeDisabled();
  });

  it('changing page requests the right slice from the API', async () => {
    const user = userEvent.setup();
    fetchHandler = manyPage;
    await openTicketsList();
    await screen.findByText(/Showing 1 to 8/);

    await user.click(screen.getByRole('button', { name: '3' }));
    // Page 3 starts at item 17 (table row + mobile card both render it).
    expect(
      await screen.findAllByText('TTK-2026-000017'),
    ).not.toHaveLength(0);
    expect(listCalls[listCalls.length - 1].url).toContain('page=3');
  });
});

describe('UI-12 — Clear Filters head action and Create Ticket action', () => {
  beforeEach(() => {
    fetchHandler = () =>
      jsonResponse({ data: TICKETS.map(makeTicket), meta: makeMeta(TICKETS.length) });
  });

  it('Clear Filters resets search and all selects to defaults and returns to page 1', async () => {
    const user = userEvent.setup();
    // Every fixture is category 1-4 except none are 'Account and Access' with
    // PENDING status; Category=1 + Status=Pending matches nothing.
    fetchHandler = (url) => {
      const params = new URL(url).searchParams;
      if (params.get('categoryId') === '1' && params.get('status') === 'PENDING') {
        return jsonResponse({ data: [], meta: makeMeta(0) });
      }
      return jsonResponse({ data: TICKETS.map(makeTicket), meta: makeMeta(TICKETS.length) });
    };

    await openTicketsList();
    await findTicketLink();

    // First set Status alone (still has matches), then add the category that
    // empties the result set.
    await user.selectOptions(screen.getByLabelText('Current Status'), 'Pending');
    await vi.waitFor(() => {
      expect(new URL(listCalls[listCalls.length - 1].url).searchParams.get('status')).toBe('PENDING');
    });
    await user.selectOptions(screen.getByLabelText('Category'), '1');
    await screen.findByText('No results match your filters');
    await vi.waitFor(() => {
      expect(new URL(listCalls[listCalls.length - 1].url).searchParams.get('status')).toBe('PENDING');
    });

    // Head action button lives in .mt-actions; the no-results panel also has
    // a Clear filters button, so scope to the page header.
    const headActions = screen.getByText('Clear Filters', { selector: '.mt-actions button' });
    await user.click(headActions);
    expect((await findTicketLink()).length).toBeGreaterThan(0);
    const params = new URL(listCalls[listCalls.length - 1].url).searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('categoryId')).toBeNull();
    expect(params.get('priority')).toBeNull();
    expect(params.get('itPriority')).toBeNull();
    expect(params.get('status')).toBeNull();
    expect(screen.getByLabelText('Category')).toHaveValue('');
  });

  it('Create Ticket navigates to the create form', async () => {
    await openTicketsList();
    await findTicketLink();
    await userEvent.setup().click(screen.getByRole('link', { name: /Create Ticket/i }));
    await screen.findByRole('heading', { name: /create/i, level: 1 });
    expect(window.location.hash).toContain('#/new-ticket');
  });
});

describe('BR-05 — switching requester resets filters/sort/page and re-scopes ownership', () => {
  beforeEach(() => {
    fetchHandler = () =>
      jsonResponse({ data: TICKETS.map(makeTicket), meta: makeMeta(TICKETS.length) });
  });

  it('starts a fresh default list scoped to the new requester header', async () => {
    const user = userEvent.setup();
    await openTicketsList();
    await findTicketLink();

    // Apply a filter first.
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'CRITICAL');
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url).toContain('itPriority=CRITICAL');
    });

    // Switch requester via the header select.
    await user.selectOptions(screen.getByLabelText(/Development Requester/i), '2');

    await vi.waitFor(() => {
      const latest = listCalls.filter(
        (c) => c.headers['X-Dev-Requester-Id'] === '2',
      )[0];
      expect(latest).toBeDefined();
      const params = new URL(latest.url).searchParams;
      expect(params.get('page')).toBe('1');
      expect(params.get('itPriority')).toBeNull();
      expect(params.get('status')).toBeNull();
    });
  });
});
