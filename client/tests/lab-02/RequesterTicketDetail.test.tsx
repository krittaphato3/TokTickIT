import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import App from '../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
];

const TICKET = {
  id: 1,
  ticketNumber: 'TTK-2026-000042',
  title: 'Laptop will not boot',
  description: 'Detailed desc',
  status: 'NEW',
  priority: 'HIGH',
  itPriority: null,
  ownerName: null,
  owner: null,
  category: { id: 1, name: 'Hardware' },
  requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  relatedSystem: { id: 1, name: 'Printer' },
  attachments: [
    { id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 1024, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
  ],
  createdAt: '2026-08-18T09:30:00.000Z',
  updatedAt: '2026-08-18T09:31:00.000Z',
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('RequesterTicketDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
      if (String(url).includes('/api/categories')) return ok([]);
      if (String(url).includes('/api/related-systems')) return ok([]);
      if (String(url).includes('/api/tickets/TTK-2026-000042')) return ok(TICKET);
      return ok({});
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('renders read-only detail with warm-ivory description and attachments', async () => {
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect((await screen.findAllByText('TTK-2026-000042')).length).toBeGreaterThan(0);
    // title now lives in Summary grid field (no standalone h1)
    expect(screen.getByText('Laptop will not boot')).toBeInTheDocument();
    expect(screen.getByText('Detailed desc')).toBeInTheDocument();
    // badge text in grid (Current Status)
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Hardware')).toBeInTheDocument();
    const desc = screen.getByText('Detailed desc');
    expect(desc.closest('.tok-desc-warm') || desc.closest('[data-warm]') || document.querySelector('.tok-desc-warm')).toBeTruthy();
    expect(screen.getByText(/Attachments \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('shot.png')).toBeInTheDocument();
    // Back button (now button aligned to breadcrumb, not link)
    expect(screen.getByRole('button', { name: /Back to My Tickets/i })).toBeInTheDocument();
    // breadcrumb still shows ticket number
    expect(screen.getAllByText(/My Tickets/).length).toBeGreaterThan(0);
    // Lab-pure ownership: Requester shows creator, Ticket Owner shows Unassigned
    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByText('Ticket Owner')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getAllByText('Dev User Alpha').length).toBeGreaterThan(0);
    // all four tabs render
    expect(screen.getByRole('tab', { name: /Public Comments/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Service Actions/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Event Log/ })).toBeInTheDocument();
    // mock tab captions present in DOM (even when tab not active)
    expect(screen.getByText(/UI preview only — commenting arrives in a later lab/)).toBeInTheDocument();
    expect(screen.getByText(/Read-only preview — service actions arrive in a later lab/)).toBeInTheDocument();
  });

  it('shows fallback when description empty and caption', async () => {
    const empty = { ...TICKET, description: null };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
      if (String(url).includes('/api/tickets/TTK-2026-000042')) return ok(empty);
      return ok([]);
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('No description provided')).toBeInTheDocument();
    expect(screen.getAllByText('Testing only — not real authentication').length).toBeGreaterThan(0);
  });
});
