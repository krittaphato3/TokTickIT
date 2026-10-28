import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// L4-5 — Staff / Admin Dashboard Component Tests (docs/lab-04/tests.md UI-07, UI-08, RESP-01).
// Tests both IT_STAFF and ADMINISTRATOR views through <App />.

const STAFF = sessionUser({ role: 'IT_STAFF', id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' });
const ADMIN = sessionUser({ role: 'ADMINISTRATOR', id: 99, name: 'Ada Admin', email: 'admin@toktickit.test' });

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function makeStaffDashboard(overrides: Record<string, unknown> = {}) {
  return {
    countsByStatus: {
      NEW: 3,
      OPEN: 4,
      IN_PROGRESS: 5,
      WAITING_FOR_REQUESTER: 2,
      RESOLVED: 4,
      CLOSED: 4,
      REOPENED: 2,
      CANCELLED: 1,
    },
    unassignedActiveCount: 6,
    myActiveOwnedCount: 4,
    countsByItPriority: {
      LOW: 1,
      MEDIUM: 3,
      HIGH: 4,
      CRITICAL: 1,
    },
    recentlyUpdated: [
      {
        id: 17,
        ticketNumber: 'TTK-2026-000017',
        summary: 'Printer offline on floor 3',
        status: 'IN_PROGRESS',
        owner: { id: 11, name: 'Sara IT' },
        updatedAt: '2026-10-10T07:00:00.000Z',
      },
    ],
    myRecentActions: [
      {
        id: 42,
        ticketId: 17,
        ticketNumber: 'TTK-2026-000017',
        description: 'Replaced the failing network switch port.',
        actionAt: '2026-10-10T07:30:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('Staff & Admin Dashboard UI (L4-5, UI-07, UI-08)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '#/';
  });

  it('renders loading skeleton and aria-busy while loading', async () => {
    const fetchFn = stubAuthenticatedFetch(STAFF, (url) => {
      if (url.includes('/api/dashboard/staff')) {
        return new Promise(() => {});
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByRole('status', { name: /loading dashboard/i })).toBeInTheDocument();
  });

  it('renders staff metrics, drill-down links with active=true, and omits user counts for IT_STAFF', async () => {
    const fetchFn = stubAuthenticatedFetch(STAFF, (url) => {
      if (url.includes('/api/dashboard/staff')) {
        return jsonResponse(200, makeStaffDashboard());
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/service desk overview/i)).toBeInTheDocument();

    // Check status cards and links
    const newCard = screen.getByRole('link', { name: /new: 3/i });
    expect(newCard).toHaveAttribute('href', '#/staff/queue?status=NEW');

    const openCard = screen.getByRole('link', { name: /open: 4/i });
    expect(openCard).toHaveAttribute('href', '#/staff/queue?status=OPEN');

    // Operational metrics with active=true
    const unassignedCard = screen.getByRole('link', { name: /unassigned active: 6/i });
    expect(unassignedCard).toHaveAttribute('href', '#/staff/queue?assigned=false&active=true');

    const myActiveCard = screen.getByRole('link', { name: /my active tickets: 4/i });
    expect(myActiveCard).toHaveAttribute('href', '#/staff/queue?ownerId=11&active=true');

    // IT Priority metrics with active=true
    const critCard = screen.getByRole('link', { name: /critical: 1/i });
    expect(critCard).toHaveAttribute('href', '#/staff/queue?itPriority=CRITICAL&active=true');

    // Lists
    expect(screen.getByText('Printer offline on floor 3')).toBeInTheDocument();
    expect(screen.getByText(/replaced the failing network switch port/i)).toBeInTheDocument();

    const ticketDetailLinks = screen.getAllByRole('link', { name: /TTK-2026-000017/i });
    expect(ticketDetailLinks.length).toBeGreaterThan(0);
    expect(ticketDetailLinks[0]).toHaveAttribute('href', '#/staff/tickets/TTK-2026-000017');

    // IT_STAFF should NOT see user counts card
    expect(screen.queryByRole('heading', { name: /user directory|users/i })).not.toBeInTheDocument();
  });

  it('renders userCounts card for ADMINISTRATOR session linking to #/admin/users', async () => {
    const fetchFn = stubAuthenticatedFetch(ADMIN, (url) => {
      if (url.includes('/api/dashboard/staff')) {
        return jsonResponse(200, makeStaffDashboard({
          userCounts: {
            requester: 5,
            itStaff: 4,
            administrator: 1,
            active: 9,
            inactive: 2,
          },
        }));
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /dashboard/i })).toBeInTheDocument();

    // Admin user counts section
    const main = screen.getByRole('main');
    const userCard = await within(main).findByRole('link', { name: /manage users/i });
    expect(userCard).toHaveAttribute('href', '#/admin/users');
    expect(within(main).getByText(/^active:/i)).toBeInTheDocument();
    expect(within(main).getByText(/^inactive:/i)).toBeInTheDocument();
  });

  it('handles safe error states and retries', async () => {
    let callCount = 0;
    const fetchFn = stubAuthenticatedFetch(STAFF, (url) => {
      if (url.includes('/api/dashboard/staff')) {
        callCount += 1;
        if (callCount === 1) return jsonResponse(500, { error: 'Database query timeout' });
        return jsonResponse(200, makeStaffDashboard());
      }
      return undefined;
    });

    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = '#/dashboard';
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/database query timeout/i);

    const retryBtn = screen.getByRole('button', { name: /try again|retry/i });
    await userEvent.click(retryBtn);

    expect(await screen.findByText('Printer offline on floor 3')).toBeInTheDocument();
  });
});
