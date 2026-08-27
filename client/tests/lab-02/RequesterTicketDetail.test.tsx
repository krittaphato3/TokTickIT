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
  ownerName: 'Dev User Alpha',
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
    expect(screen.getByText('Laptop will not boot')).toBeInTheDocument();
    expect(screen.getByText('Detailed desc')).toBeInTheDocument();
    // badge text
    expect(screen.getByText('New')).toBeInTheDocument();
    // definition list items
    expect(screen.getByText('Hardware')).toBeInTheDocument();
    // description block should have warm ivory class/background
    const desc = screen.getByText('Detailed desc');
    expect(desc.closest('.tok-desc-warm') || desc.closest('[data-warm]') || document.querySelector('.tok-desc-warm')).toBeTruthy();
    // attachments count
    expect(screen.getByText(/Attachments \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('shot.png')).toBeInTheDocument();
    // back link
    expect(screen.getByRole('link', { name: /Back to My Tickets/i })).toBeInTheDocument();
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
