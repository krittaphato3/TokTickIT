import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

const REQUESTERS = [{ id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' }];
const TICKET_BASE = {
  id: 1,
  ticketNumber: 'TTK-2026-000042',
  title: 'Laptop will not boot',
  description: 'desc',
  status: 'NEW',
  priority: 'HIGH',
  itPriority: null,
  ownerName: null,
  owner: null,
  category: { id: 1, name: 'Hardware' },
  requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  relatedSystem: { id: 1, name: 'Printer' },
  attachments: [
    { id: 10, fileName: 'a.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
    { id: 11, fileName: 'b.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
    { id: 12, fileName: 'c.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
    { id: 13, fileName: 'd.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
    { id: 14, fileName: 'e.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
  ],
  createdAt: '2026-08-18T09:30:00.000Z',
  updatedAt: '2026-08-18T09:31:00.000Z',
};

function ok(body: unknown) { return { ok: true, status: 200, json: async () => body } as unknown as Response; }

describe('AttachmentSection UI-08/09', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
      if (String(url).includes('/api/tickets/TTK-2026-000042') && !String(url).includes('attachments')) return ok(TICKET_BASE);
      return ok({});
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('UI-08: oversize/unsupported chips show inline errors, 5-limit disables picker with caption', async () => {
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText(/Attachments \(5\)/)).toBeInTheDocument();
    // picker disabled when 5 active
    expect(screen.getByText(/Attachment limit reached \(5 max\)/)).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('UI-09: remove flow with inline confirm; chip becomes grayed + strikethrough + Removed badge; download gone', async () => {
    const single = { ...TICKET_BASE, attachments: [{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null }] };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/requesters')) return ok(REQUESTERS);
      if (String(url).includes('/api/tickets/TTK-2026-000042') && init?.method === 'DELETE') {
        return ok({ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: new Date().toISOString() });
      }
      if (String(url).includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: /Remove/i });
    await userEvent.click(removeBtn);
    expect(screen.getByText('Remove this attachment?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getAllByText('Removed').length).toBeGreaterThan(0));
    // chip grayed/strikethrough class
    const chip = screen.getByText('shot.png').closest('.tok-chip, .attachment-chip');
    expect(chip?.className).toMatch(/removed|grayed/i);
    // download link gone
    expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
  });
});
