import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// L4-5 — Requester Dashboard Component Tests (docs/lab-04/tests.md UI-07).
// Renders <App /> with hash #/dashboard as an authenticated REQUESTER.
// Verifies: metric cards, empty state, recently updated/resolved lists, drill-down links.

const REQUESTER = sessionUser({ role: 'REQUESTER', id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' });

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function makeRequesterDashboard(overrides: Record<string, unknown> = {}) {
  return {
    activeCount: 4,
    waitingForRequesterCount: 1,
    resolvedCount: 2,
    closedCount: 3,
    recentlyUpdated: [
      { id: 17, ticketNumber: 'TTK-2026-000017', summary: 'Printer offline on floor 3', status: 'IN_PROGRESS', updatedAt: '2026-10-10T07:00:00.000Z' },
    ],
    recentlyResolved: [
      { id: 9, ticketNumber: 'TTK-2026-000009', summary: 'VPN drops every hour', status: 'RESOLVED', updatedAt: '2026-10-09T10:00:00.000Z' },
    ],
    ...overrides,
  };
}

describe('Requester Dashboard UI (L4-5, UI-07)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '#/';
  });

  it('renders loading skeleton and aria-busy when dashboard data is loading', async () => {
    const fetchFn = stubAuthenticatedFetch(REQUESTER, (url) => {
      if (url.includes('/api/dashboard/requester')) {
        return new Promise(() => {}); // Never resolves
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByRole('status', { name: /loading dashboard/i })).toBeInTheDocument();
  });

  it('renders metric cards with drill-down hrefs and recent lists on populated dashboard', async () => {
    const fetchFn = stubAuthenticatedFetch(REQUESTER, (url) => {
      if (url.includes('/api/dashboard/requester')) {
        return jsonResponse(200, makeRequesterDashboard());
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    // Page title and scope subtitle
    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/your tickets/i)).toBeInTheDocument();

    // Check metric cards and values
    expect(screen.getByText('4')).toBeInTheDocument(); // activeCount
    expect(screen.getByText('1')).toBeInTheDocument(); // waitingForRequesterCount
    expect(screen.getByText('2')).toBeInTheDocument(); // resolvedCount
    expect(screen.getByText('3')).toBeInTheDocument(); // closedCount

    // Check drill-down links per api-spec §5
    const activeCardLink = screen.getByRole('link', { name: /active tickets: 4/i });
    expect(activeCardLink).toHaveAttribute('href', '#/my?active=true');

    const waitingCardLink = screen.getByRole('link', { name: /waiting for you: 1/i });
    expect(waitingCardLink).toHaveAttribute('href', '#/my?status=WAITING_FOR_REQUESTER');

    const resolvedCardLink = screen.getByRole('link', { name: /resolved: 2/i });
    expect(resolvedCardLink).toHaveAttribute('href', '#/my?status=RESOLVED');

    const closedCardLink = screen.getByRole('link', { name: /closed: 3/i });
    expect(closedCardLink).toHaveAttribute('href', '#/my?status=CLOSED');

    // Recent items rendered as links
    expect(screen.getByText('Printer offline on floor 3')).toBeInTheDocument();
    expect(screen.getByText('VPN drops every hour')).toBeInTheDocument();

    const printerLink = screen.getByRole('link', { name: /TTK-2026-000017/i });
    expect(printerLink).toHaveAttribute('href', '#/tickets/TTK-2026-000017');

    // Quick action buttons in dashboard main
    const main = screen.getByRole('main');
    const newTicketBtn = within(main).getByRole('link', { name: /\+ new ticket/i });
    expect(newTicketBtn).toHaveAttribute('href', '#/new');
  });

  it('renders explicit empty state when requester has no tickets', async () => {
    const fetchFn = stubAuthenticatedFetch(REQUESTER, (url) => {
      if (url.includes('/api/dashboard/requester')) {
        return jsonResponse(200, {
          activeCount: 0,
          waitingForRequesterCount: 0,
          resolvedCount: 0,
          closedCount: 0,
          recentlyUpdated: [],
          recentlyResolved: [],
        });
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/no tickets yet/i)).toBeInTheDocument();
  });

  it('renders safe error state with retry button on failure', async () => {
    let callCount = 0;
    const fetchFn = stubAuthenticatedFetch(REQUESTER, (url) => {
      if (url.includes('/api/dashboard/requester')) {
        callCount += 1;
        if (callCount === 1) return jsonResponse(500, { error: 'Database unavailable' });
        return jsonResponse(200, makeRequesterDashboard());
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/database unavailable/i);

    const retryBtn = screen.getByRole('button', { name: /try again|retry/i });
    await userEvent.click(retryBtn);

    expect(await screen.findByText('Printer offline on floor 3')).toBeInTheDocument();
  });
});
