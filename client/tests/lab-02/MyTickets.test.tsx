import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

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
  category: { id: number; name: string };
}

function makeTicket(seed: SeedTicket) {
  return {
    id: seed.id,
    ticketNumber: seed.ticketNumber,
    title: seed.title,
    description: null,
    status: 'NEW' as const,
    priority: seed.priority,
    category: seed.category,
    relatedSystem: { id: 1, name: 'Email Server' },
    createdAt: `2026-08-${String(10 + (seed.id % 15)).padStart(2, '0')}T09:30:00.000Z`,
    updatedAt: `2026-08-${String(10 + (seed.id % 15)).padStart(2, '0')}T10:00:00.000Z`,
  };
}

// 14 tickets → 2 pages at the default pageSize of 10; priorities varied so
// every badge class and text label is exercisable.
const TITLES = [
  'Laptop will not boot after update',
  'Campus Wi-Fi drops every hour',
  'Printer jams on double-sided prints',
  'Cannot access library account',
];

const TICKETS = Array.from({ length: 14 }, (_, i): SeedTicket => {
  const n = i + 1;
  const priorities = ['HIGH', 'MEDIUM', 'CRITICAL', 'LOW'] as const;
  return {
    id: n,
    ticketNumber: `TTK-2026-${String(n).padStart(6, '0')}`,
    title: `${TITLES[i % 4]} (#${n})`,
    priority: priorities[i % 4],
    category: CATEGORIES[i % 4],
  };
});

function ticketsPage(page: number, pageSize = 10, items = TICKETS) {
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    data: slice.map(makeTicket),
    meta: {
      page,
      pageSize,
      totalItems: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
      hasNextPage: page < Math.ceil(items.length / pageSize),
      hasPrevPage: page > 1,
    },
  };
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

// Every GET /api/tickets call observed by the stub, in order (URL + headers).
let listCalls: Array<{ url: URL; headers: Record<string, string> }>;

/**
 * Installs a fetch stub that answers /api/requesters and routes every
 * /api/tickets GET through `handler`, recording each list call in `listCalls`.
 */
function stubListFetch(
  handler: (url: URL) => Promise<unknown> | unknown,
): void {
  listCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(raw);
      if (url.pathname.includes('/api/requesters')) {
        if (!init?.method || init.method === 'GET') return ok(REQUESTERS);
      }
      if (url.pathname.includes('/api/categories')) return ok(CATEGORIES);
      if (url.pathname.includes('/api/related-systems')) {
        return ok([{ id: 1, name: 'Email Server' }]);
      }
      if (url.pathname.includes('/api/tickets')) {
        listCalls.push({
          url,
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return await handler(url);
      }
      return ok({});
    }),
  );
}

async function gotoMyTickets(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('link', { name: 'My Tickets' }));
  // The toolbar renders regardless of how many rows come back.
  expect(await screen.findByLabelText('Search')).toBeInTheDocument();
}

beforeEach(() => {
  localStorage.clear();
  // Hash persists across tests in one jsdom file (e.g. after navigating to a
  // detail route); reset so every test starts from a clean shell.
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('My Tickets screen', () => {
  it('UI-04: skeleton while loading then rows render with Showing range', async () => {
    let resolveList!: (value: unknown) => void;
    stubListFetch(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'My Tickets' }));

    // Exactly three shimmer skeleton rows while the request is in flight.
    const skeletons = await screen.findAllByTestId('sk-row');
    expect(skeletons).toHaveLength(3);
    for (const row of skeletons) {
      expect(row.querySelector('.sk')).not.toBeNull();
    }
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    resolveList(ok(ticketsPage(1)));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.getAllByText('Laptop will not boot after update (#1)').length,
    ).toBeGreaterThan(0);
    // First row's monospace link shows the newest ticket.
    expect(
      screen.getAllByRole('link', { name: 'TTK-2026-000001' })[0],
    ).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–10 of 14/)).toBeInTheDocument();
    // Every list request carried the dev requester header.
    const calls = (
      globalThis.fetch as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('/api/tickets'),
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        (call[1] as RequestInit).headers as Record<string, string>,
      ).toMatchObject({ 'X-Dev-Requester-Id': '1' });
    }
  });

  it('UI-04 + UI-10: failure shows error banner and Try again re-fetches without losing filter state', async () => {
    let seenSearchWithLaptop = false;
    stubListFetch((url) => {
      const search = url.searchParams.get('search') ?? '';
      if (search === 'laptop') {
        // Fail only the first laptop request; the retry succeeds.
        if (!seenSearchWithLaptop) {
          seenSearchWithLaptop = true;
          return { ok: false, status: 500, json: async () => ({ error: 'DB down' }) };
        }
        return ok(
          ticketsPage(
            Number(url.searchParams.get('page') ?? 1),
            10,
            TICKETS.filter((t) => /laptop/i.test(t.title)),
          ),
        );
      }
      return ok(ticketsPage(Number(url.searchParams.get('page') ?? 1)));
    });

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    // Set a search filter first so we can prove state survives the failure.
    await user.type(screen.getByLabelText('Search'), 'laptop');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't load your tickets. Your filters are preserved.",
    );
    expect(alert).toHaveClass('errbar');

    // Filter input preserved during failure.
    expect(screen.getByLabelText('Search')).toHaveValue('laptop');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    // Retry re-fetches the CURRENT params (same search), not defaults.
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url.searchParams.get('search')).toBe(
        'laptop',
      );
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('UI-05: zero tickets shows No tickets yet with Create your first ticket CTA', async () => {
    stubListFetch(() => ok(ticketsPage(1, 10, [])));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When you submit a support request, it will appear here with its official ticket number.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No results match your filters'),
    ).not.toBeInTheDocument();

    // The CTA navigates to the New Ticket screen.
    await user.click(
      screen.getByRole('button', { name: 'Create your first ticket' }),
    );
    expect(await screen.findByLabelText(/^Title/)).toBeInTheDocument();
  });

  it('UI-05: filters matching nothing shows distinct No results match your filters with Clear filters', async () => {
    // Empty page ONLY for the selected category — a vacuous empty response
    // would make this test pass without the filter ever being sent.
    const HARDWARE_ID = '2';
    stubListFetch((url) => {
      if (url.searchParams.get('categoryId') === HARDWARE_ID) {
        return ok(ticketsPage(1, 10, []));
      }
      return ok(ticketsPage(1));
    });

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    // Non-default filter (category) that matches nothing → no-results state.
    await user.selectOptions(screen.getByLabelText('Category'), HARDWARE_ID);

    await vi.waitFor(() => {
      expect(
        listCalls[listCalls.length - 1].url.searchParams.get('categoryId'),
      ).toBe(HARDWARE_ID);
    });
    expect(
      await screen.findByText('No results match your filters'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No tickets yet')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Try a different search term, or clear the filters to see all of your tickets.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Clear filters' }).length,
    ).toBeGreaterThan(0);
  });

  it('UI-06: search input debounces 300ms and issues one request with search param', async () => {
    stubListFetch(() => ok(ticketsPage(1)));

    // Real timers: userEvent typing takes ~0ms per char, so the only realistic
    // 300ms+ gap is the debounce itself; assert on call count + final param.
    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    const before = listCalls.length;

    await user.type(screen.getByLabelText('Search'), 'wifi');
    expect(listCalls.length).toBe(before); // debounce still pending

    await waitForUrl(
      () =>
        listCalls.length === before + 1 &&
        listCalls[listCalls.length - 1].url.searchParams.get('search') === 'wifi',
      'exactly one debounced request with search=wifi',
    );
    expect(listCalls.length).toBe(before + 1);
  });

  it('UI-06: category/priority/sort changes issue correct API params', async () => {
    stubListFetch(() => ok(ticketsPage(1)));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    const lastUrl = () => listCalls[listCalls.length - 1].url;

    // Category → categoryId param, resets to page 1.
    await user.selectOptions(screen.getByLabelText('Category'), '2');
    await waitForUrl(() => lastUrl().searchParams.get('categoryId') === '2');
    expect(lastUrl().searchParams.get('page')).toBe('1');

    // Priority → priority param.
    await user.selectOptions(screen.getByLabelText('Priority'), 'CRITICAL');
    await waitForUrl(() => lastUrl().searchParams.get('priority') === 'CRITICAL');
    expect(lastUrl().searchParams.get('categoryId')).toBe('2');

    // Sort select maps all six options exactly to sortBy/sortDir pairs.
    const sortMap: Array<[string, string, string]> = [
      ['Newest first', 'createdAt', 'desc'],
      ['Oldest first', 'createdAt', 'asc'],
      ['Title A–Z', 'title', 'asc'],
      ['Title Z–A', 'title', 'desc'],
      ['Priority: high first', 'priority', 'desc'],
      ['Priority: low first', 'priority', 'asc'],
    ];
    const sortSelect = screen.getByLabelText('Sort');
    for (const [label, sortBy, sortDir] of sortMap) {
      await user.selectOptions(sortSelect, label);
      await waitForUrl(
        () =>
          lastUrl().searchParams.get('sortBy') === sortBy &&
          lastUrl().searchParams.get('sortDir') === sortDir,
        `sort ${label} → ${sortBy} ${sortDir}`,
      );
    }
  });

  it('UI-06: Clear filters appears only when non-default and resets everything', async () => {
    stubListFetch(() => ok(ticketsPage(1)));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'printer');
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url.searchParams.get('search')).toBe(
        'printer',
      );
    });
    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    // Search box emptied; next request back to default params; button hidden.
    await vi.waitFor(() => {
      const p = listCalls[listCalls.length - 1].url.searchParams;
      expect(p.get('search')).toBeNull();
      expect(p.get('categoryId')).toBeNull();
      expect(p.get('priority')).toBeNull();
      // Default sort is sent explicitly: createdAt desc.
      expect(p.get('sortBy')).toBe('createdAt');
      expect(p.get('sortDir')).toBe('desc');
      expect(p.get('page')).toBe('1');
    });
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('pagination: Prev disabled on page 1, Next loads page=2 showing 11–14 of 14', async () => {
    stubListFetch((url) => ok(ticketsPage(Number(url.searchParams.get('page') ?? 1))));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    expect(screen.getByText(/Showing 1–10 of 14/)).toBeInTheDocument();

    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    // Numbered buttons max 5 with ellipsis: 1 … 5 … style for 2 pages → just
    // "1" and "2"; current page marked with aria-current.
    const pageOne = screen.getByRole('button', { name: 'Go to page 1' });
    expect(pageOne).toHaveAttribute('aria-current', 'page');

    await user.click(next);

    expect(await screen.findByText(/Showing 11–14 of 14/)).toBeInTheDocument();
    expect(listCalls[listCalls.length - 1].url.searchParams.get('page')).toBe('2');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Go to page 2' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('pagination window: >5 pages renders max 5 numbered buttons with ellipsis', async () => {
    // 55 items at pageSize 10 → 6 pages (the historical off-by-one case).
    const many = Array.from({ length: 55 }, (_, i): SeedTicket => {
      const n = i + 1;
      return {
        id: n,
        ticketNumber: `TTK-2026-${String(n).padStart(6, '0')}`,
        title: `Bulk ticket ${n}`,
        priority: 'MEDIUM',
        category: CATEGORIES[1],
      };
    });
    stubListFetch((url) =>
      ok(ticketsPage(Number(url.searchParams.get('page') ?? 1), 10, many)),
    );

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    const numberedButtons = () =>
      screen
        .getAllByRole('button')
        .filter((b) => /^Go to page \d+$/.test(b.getAttribute('aria-label') ?? ''));
    const ellipses = () => document.querySelectorAll('.ellipsis');

    // Page 1 of 6 → moving 3-window + first/last caps: "1 2 3 … 6".
    const numberedLabels = () =>
      numberedButtons().map((b) => b.textContent);
    expect(numberedLabels()).toEqual(['1', '2', '3', '6']);
    expect(numberedButtons().length).toBeLessThanOrEqual(5);
    expect(ellipses().length).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Go to page 1' }),
    ).toHaveAttribute('aria-current', 'page');

    // Middle page keeps the numbered count capped at five: "1 2 3 4 … 6".
    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(await screen.findByText(/Showing 21–30 of 55/)).toBeInTheDocument();
    expect(listCalls[listCalls.length - 1].url.searchParams.get('page')).toBe('3');
    expect(numberedButtons()).toHaveLength(5);
    expect(ellipses().length).toBe(1);

    // Last page → window merges with the end cap: "1 … 4 5 6" (≤ 5 buttons).
    await user.click(screen.getByRole('button', { name: 'Go to page 6' }));
    expect(await screen.findByText(/Showing 51–55 of 55/)).toBeInTheDocument();
    expect(numberedButtons().length).toBeLessThanOrEqual(5);
    expect(numberedLabels()).toEqual(['1', '4', '5', '6']);
    expect(ellipses().length).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Go to page 6' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('BR-05: switching requester resets filters/sort/page and refetches clean for the new identity', async () => {
    stubListFetch((url) => ok(ticketsPage(Number(url.searchParams.get('page') ?? 1))));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    // Establish non-default state: search + category + sort change + page 2.
    await user.type(screen.getByLabelText('Search'), 'printer');
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url.searchParams.get('search')).toBe(
        'printer',
      );
    });
    await user.selectOptions(screen.getByLabelText('Category'), '2');
    await user.selectOptions(
      screen.getByLabelText('Sort'),
      'Priority: low first',
    );
    await vi.waitFor(() => {
      const p = listCalls[listCalls.length - 1].url.searchParams;
      expect(p.get('sortBy')).toBe('priority');
      expect(p.get('sortDir')).toBe('asc');
      expect(p.get('categoryId')).toBe('2');
    });
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await vi.waitFor(() => {
      expect(listCalls[listCalls.length - 1].url.searchParams.get('page')).toBe('2');
    });

    // Switch the active requester through the header selector.
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Development Requester' }),
      '2',
    );

    // A fresh GET fires for requester 2 with NO stale params and page=1.
    await vi.waitFor(() => {
      const call = listCalls[listCalls.length - 1];
      expect(call.url.searchParams.get('page')).toBe('1');
      expect(call.url.searchParams.get('search')).toBeNull();
      expect(call.url.searchParams.get('categoryId')).toBeNull();
      expect(call.url.searchParams.get('priority')).toBeNull();
      // Default sort restored explicitly.
      expect(call.url.searchParams.get('sortBy')).toBe('createdAt');
      expect(call.url.searchParams.get('sortDir')).toBe('desc');
    });
    const lastCall = listCalls[listCalls.length - 1];
    expect(lastCall.headers['X-Dev-Requester-Id']).toBe('2');

    // UI reset too: search box empty, selects back to defaults, no Clear
    // filters button, Showing range back to the first page.
    expect(await screen.findByText(/Showing 1–10 of 14/)).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('Priority')).toHaveValue('');
    expect(screen.getByLabelText('Sort')).toHaveValue('0');
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('navigation: clicking a ticket-number link routes to the detail route', async () => {
    stubListFetch(() => ok(ticketsPage(1)));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    await user.click(
      screen.getAllByRole('link', { name: 'TTK-2026-000003' })[0],
    );

    expect(window.location.hash).toBe('#/tickets/TTK-2026-000003');
    expect(
      await screen.findByText('Official number:'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('TTK-2026-000003').length).toBeGreaterThan(0);
  });

  it('sortable headers: clicking Title/Priority/Created cycles direction via API params', async () => {
    stubListFetch(() => ok(ticketsPage(1)));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    const lastUrl = () => listCalls[listCalls.length - 1].url;

    // Title header: natural dir asc on first click, then desc. The sortable
    // <th> contains the click target button.
    const thButton = (name: string) =>
      within(screen.getByRole('columnheader', { name })).getByRole('button');
    await user.click(thButton('Title'));
    await waitForUrl(
      () =>
        lastUrl().searchParams.get('sortBy') === 'title' &&
        lastUrl().searchParams.get('sortDir') === 'asc',
      'Title first click → title asc',
    );
    await user.click(thButton('Title'));
    await waitForUrl(
      () =>
        lastUrl().searchParams.get('sortBy') === 'title' &&
        lastUrl().searchParams.get('sortDir') === 'desc',
      'Title second click → title desc',
    );

    // Priority header: natural dir desc (high first) on first click.
    await user.click(thButton('Priority'));
    await waitForUrl(
      () =>
        lastUrl().searchParams.get('sortBy') === 'priority' &&
        lastUrl().searchParams.get('sortDir') === 'desc',
      'Priority first click → priority desc',
    );

    // Created header: natural dir desc (newest first).
    await user.click(thButton('Created'));
    await waitForUrl(
      () =>
        lastUrl().searchParams.get('sortBy') === 'createdAt' &&
        lastUrl().searchParams.get('sortDir') === 'desc',
      'Created click → createdAt desc',
    );
  });

  it('UI-11: accessibility — headers, badge text labels, link names, aria-current pagination', async () => {
    // One ticket per priority so all four badges are asserted present.
    const oneOfEach: SeedTicket[] = [
      { id: 1, ticketNumber: 'TTK-2026-000001', title: 'Low prio issue', priority: 'LOW', category: CATEGORIES[0] },
      { id: 2, ticketNumber: 'TTK-2026-000002', title: 'Medium prio issue', priority: 'MEDIUM', category: CATEGORIES[1] },
      { id: 3, ticketNumber: 'TTK-2026-000003', title: 'High prio issue', priority: 'HIGH', category: CATEGORIES[2] },
      { id: 4, ticketNumber: 'TTK-2026-000004', title: 'Critical prio issue', priority: 'CRITICAL', category: CATEGORIES[3] },
    ];
    stubListFetch(() => ok(ticketsPage(1, 10, oneOfEach)));

    const user = userEvent.setup();
    render(<App />);
    await gotoMyTickets(user);

    const table = await screen.findByRole('table');
    for (const header of ['Ticket #', 'Title', 'Category', 'Priority', 'Status', 'Created']) {
      expect(
        screen.getByRole('columnheader', { name: header }),
      ).toHaveAttribute('scope', 'col');
    }

    // Badge text labels present for all four priorities + status (never
    // color-only).
    expect(screen.getAllByText('! Critical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
    // Status badge carries its leading dot span.
    expect(document.querySelectorAll('.b-new .dot').length).toBeGreaterThan(0);

    // Ticket-number links have accessible names including the ticket number.
    const links = within(table).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.textContent).toMatch(/^TTK-\d{4}-\d{6}$/);
    }

    // Busy region announced politely.
    expect(screen.getByTestId('my-tickets-region')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    // aria-current on the active pagination page.
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('button', { name: 'Previous page' })[0]).toBeDisabled();
  });
});

/** Poll until `predicate` sees true on the latest recorded list call. */
async function waitForUrl(
  predicate: () => boolean,
  what = 'expected URL params',
): Promise<void> {
  await vi.waitFor(
    () => {
      expect(predicate(), `waiting for ${what}`).toBe(true);
    },
    { timeout: 2000, interval: 25 },
  );
}
