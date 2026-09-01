import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
];
const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];
const RELATED_SYSTEMS = [
  { id: 1, name: 'Email' },
  { id: 2, name: 'Campus Wi-Fi' },
  { id: 3, name: 'Printer' },
  { id: 4, name: 'VPN' },
  { id: 5, name: 'HR Portal' },
  { id: 6, name: 'Finance System' },
  { id: 7, name: 'Learning Management' },
];

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

// UI-12 — FR-17, AC-22: Related system select renders seeded options;
// selection sends correct relatedSystemId in create payload;
// detail shows the chip.
describe('UI-12 Related system select', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    window.location.hash = '';
  });

  it('renders related system options from GET /api/related-systems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
        if (String(url).includes('/api/related-systems')) return ok(RELATED_SYSTEMS);
        if (String(url).includes('/api/categories')) return ok(CATEGORIES);
        return ok({});
      }),
    );
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'New Ticket' }));
    // Wait for the form to be ready (lookups loaded)
    expect(await screen.findByLabelText(/^Related System/)).toBeInTheDocument();
    for (const sys of RELATED_SYSTEMS) {
      expect(screen.getByRole('option', { name: sys.name })).toBeInTheDocument();
    }
  });

  it('selection sends correct relatedSystemId in create payload', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
        if (String(url).includes('/api/categories')) return ok(CATEGORIES);
        if (String(url).includes('/api/related-systems')) return ok(RELATED_SYSTEMS);
        if (String(url).includes('/api/tickets') && init?.method === 'POST') {
          capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              ticketNumber: 'TTK-2026-000099',
              title: capturedBody?.title,
              status: 'NEW',
              priority: 'MEDIUM',
              category: CATEGORIES[0],
              relatedSystem: RELATED_SYSTEMS[2],
              createdAt: '2026-08-28T10:00:00.000Z',
              updatedAt: '2026-08-28T10:00:00.000Z',
            }),
          } as unknown as Response;
        }
        return ok({});
      }),
    );
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'New Ticket' }));
    await screen.findByLabelText(/^Related System/);

    await userEvent.type(screen.getByLabelText(/^Title/), 'Printer jam in office');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '1');
    // Pick the third system (Printer, id 3) — the options render id as value.
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), '3');
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    // Wait for the navigation to detail which shows the ticket number
    expect(await screen.findByText('TTK-2026-000099')).toBeInTheDocument();
    expect(capturedBody).not.toBeNull();
    expect(capturedBody?.relatedSystemId).toBe(3);
  });

  it('detail shows the related system chip', async () => {
    const TICKET = {
      id: 10,
      ticketNumber: 'TTK-2026-000077',
      title: 'Email not syncing',
      description: 'Outlook stuck',
      status: 'NEW',
      priority: 'MEDIUM',
      itPriority: null,
      ownerName: null,
      owner: null,
      category: { id: 1, name: 'Account and Access' },
      relatedSystem: { id: 2, name: 'Campus Wi-Fi' },
      requester: REQUESTERS[0],
      attachments: [],
      createdAt: '2026-08-28T09:00:00.000Z',
      updatedAt: '2026-08-28T09:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
        if (String(url).includes('/api/tickets/TTK-2026-000077')) return ok(TICKET);
        if (String(url).includes('/api/categories')) return ok([]);
        if (String(url).includes('/api/related-systems')) return ok([]);
        return ok({});
      }),
    );
    window.location.hash = '#/tickets/TTK-2026-000077';
    render(<App />);
    expect(await screen.findByText('Campus Wi-Fi')).toBeInTheDocument();
    // Label "Related System" should be present in the detail grid
    expect(screen.getByText('Related System')).toBeInTheDocument();
  });
});
