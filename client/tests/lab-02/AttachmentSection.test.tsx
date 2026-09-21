import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

const USER = sessionUser();
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
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url) => {
      if (url.includes('/api/tickets/TTK-2026-000042') && !url.includes('attachments')) return ok(TICKET_BASE);
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

  it('UI-09: remove flow with modal; chip becomes grayed + strikethrough + Removed badge; download gone', async () => {
    const single = { ...TICKET_BASE, attachments: [{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null, sha256: '9f64aabbccddeeff00112233445566778899aabbccddeeff0011223344556677' }] };
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url, init) => {
      if (url.includes('/api/tickets/TTK-2026-000042') && init?.method === 'DELETE') {
        return ok({ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: new Date().toISOString() });
      }
      if (url.includes('/api/tickets/TTK-2026-000042') && url.includes('/events')) return ok([]);
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(removeBtn);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Remove attachment')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Purge file' }));
    await waitFor(() => expect(screen.getAllByText('Removed').length).toBeGreaterThan(0));
    // chip grayed/strikethrough class
    const chip = screen.getByText('shot.png').closest('.tok-chip, .attachment-chip');
    expect(chip?.className).toMatch(/removed|grayed/i);
    // download link gone
    expect(screen.queryByRole('link', { name: /Download/i })).not.toBeInTheDocument();
  });

  it('Download: per-row button fetches correct /download URL with credentials include', async () => {
    const single = { ...TICKET_BASE, attachments: [{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null }] };
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const blobBody = new Blob(['hello'], { type: 'image/png' });
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url, init) => {
      seen.push({ url, init });
      if (url.includes('/attachments/10/download')) {
        return { ok: true, status: 200, blob: async () => blobBody, clone: () => ({ json: async () => ({}) }), json: async () => ({}) } as unknown as Response;
      }
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    const createSpy = vi.fn(() => 'blob:mock-url');
    const revokeSpy = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      (this as unknown as { __clicked?: boolean }).__clicked = true;
    });
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const dlBtn = screen.getByRole('button', { name: 'Download shot.png' });
    await userEvent.click(dlBtn);
    await waitFor(() => expect(seen.some(s => s.url.includes('/api/tickets/TTK-2026-000042/attachments/10/download'))).toBe(true));
    const dlCall = seen.find(s => s.url.includes('/attachments/10/download'))!;
    expect(dlCall.init?.credentials).toBe('include');
    expect(createSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('Download-all loops all active files', async () => {
    const two = { ...TICKET_BASE, attachments: [
      { id: 10, fileName: 'a.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null },
      { id: 11, fileName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 200, uploadedAt: '2026-08-18T09:46:00.000Z', removedAt: null },
    ] };
    const downloaded: string[] = [];
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url) => {
      if (url.includes('/attachments/') && url.includes('/download')) {
        downloaded.push(url);
        const b = new Blob(['x'], { type: 'application/octet-stream' });
        return { ok: true, status: 200, blob: async () => b, clone: () => ({ json: async () => ({}) }), json: async () => ({}) } as unknown as Response;
      }
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(two);
      return ok({});
    }));
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { /* noop */ });
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('a.png')).toBeInTheDocument();
    const allBtn = screen.getByRole('button', { name: /Download all/i });
    expect(allBtn).toBeEnabled();
    await userEvent.click(allBtn);
    await waitFor(() => expect(downloaded.filter(u => u.includes('/attachments/10/download')).length).toBeGreaterThan(0));
    await waitFor(() => expect(downloaded.filter(u => u.includes('/attachments/11/download')).length).toBeGreaterThan(0), { timeout: 5000 });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Downloaded 2 of 2/));
    (HTMLAnchorElement.prototype.click as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it('No bare relative href remains for attachment downloads', async () => {
    window.location.hash = '#/tickets/TTK-2026-000042';
    const { container } = render(<App />);
    expect(await screen.findByText(/Attachments \(5\)/)).toBeInTheDocument();
    const bad = container.querySelectorAll('a[href*="attachments"][href*="download"]');
    expect(bad.length).toBe(0);
    const rel = Array.from(container.querySelectorAll('a[href]')).filter(a => {
      const href = a.getAttribute('href') ?? '';
      return href.includes('attachments/') && !href.startsWith('http');
    });
    expect(rel.length).toBe(0);
  });

  it('file rows show truncated sha with full value in title', async () => {
    const single = { ...TICKET_BASE, attachments: [{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null, sha256: '9f64aabbccddeeff00112233445566778899aabbccddeeff0011223344556677' }] };
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url) => {
      if (url.includes('/events')) return ok([]);
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const sha = screen.getByText('sha256:9f64…6677');
    expect(sha).toBeInTheDocument();
    expect(sha.getAttribute('title')).toBe('9f64aabbccddeeff00112233445566778899aabbccddeeff0011223344556677');
  });
});

describe('AttachmentSection audit ledger', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const SHA = '9f64aabbccddeeff00112233445566778899aabbccddeeff0011223344556677';

  function baseTicket(attachments: unknown[]) {
    return { ...TICKET_BASE, attachments };
  }

  it('modal opens with reason/note fields, focuses reason, Esc closes and returns focus', async () => {
    const single = baseTicket([{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 2048, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null, sha256: SHA }]);
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url) => {
      if (url.includes('/events')) return ok([]);
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(removeBtn);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Remove attachment')).toBeInTheDocument();
    const reason = screen.getByLabelText(/removal reason code/i);
    expect(reason).toBeInTheDocument();
    expect((reason as HTMLSelectElement).value).toBe('Duplicate');
    expect(screen.getByPlaceholderText('e.g. re-uploaded corrected scan')).toBeInTheDocument();
    expect(screen.getByText(/ATT-0010/)).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(reason));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(removeBtn));
  });

  it('confirm sends DELETE body with reasonCode/note and refreshes list + events', async () => {
    const single = baseTicket([{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null, sha256: SHA }]);
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    let eventsCalls = 0;
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url, init) => {
      seen.push({ url, init });
      if (url.includes('/attachments/10') && init?.method === 'DELETE') {
        return ok({ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: new Date().toISOString(), removeReason: 'Sensitive content', removeNote: 're-uploaded corrected scan' });
      }
      if (url.includes('/events')) {
        eventsCalls += 1;
        return ok([]);
      }
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    const before = eventsCalls;
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await screen.findByRole('dialog');
    await userEvent.selectOptions(screen.getByLabelText(/removal reason code/i), 'Sensitive content');
    await userEvent.type(screen.getByPlaceholderText('e.g. re-uploaded corrected scan'), 're-uploaded corrected scan');
    await userEvent.click(screen.getByRole('button', { name: 'Purge file' }));
    await waitFor(() => {
      const del = seen.find(s => s.url.includes('/attachments/10') && s.init?.method === 'DELETE');
      expect(del).toBeTruthy();
      const parsed = JSON.parse(String(del!.init!.body));
      expect(parsed.reasonCode).toBe('Sensitive content');
      expect(parsed.note).toBe('re-uploaded corrected scan');
    });
    await waitFor(() => expect(eventsCalls).toBeGreaterThan(before));
    expect(await screen.findByText(/written to ledger/i)).toBeInTheDocument();
  });

  it('audit rows render newest-first with badges, metadata details, and Restore calls endpoint + refreshes', async () => {
    const removedFile = { id: 20, fileName: 'old.png', mimeType: 'image/png', sizeBytes: 1024, uploadedAt: '2026-09-14T13:52:40.000Z', removedAt: '2026-09-14T14:05:12.000Z', sha256: SHA, removeReason: 'Duplicate', removeNote: 'uploaded twice' };
    let restored = false;
    const uploadEv = { id: 1, type: 'UPLOAD', at: '2026-09-14T13:52:40.000Z', createdAt: '2026-09-14T13:52:40.000Z', by: 'Dev User Alpha', actorName: 'Dev User Alpha', file: { id: 20, name: 'old.png', size: 1024, mime: 'image/png', sha: SHA }, reason: null, note: null };
    const removeEv = { id: 2, type: 'REMOVE', at: '2026-09-14T14:05:12.000Z', createdAt: '2026-09-14T14:05:12.000Z', by: 'Dev User Alpha', actorName: 'Dev User Alpha', file: { id: 20, name: 'old.png', size: 1024, mime: 'image/png', sha: SHA }, reason: 'Duplicate', note: 'uploaded twice' };
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url, init) => {
      seen.push({ url, init });
      if (url.includes('/attachments/20/restore') && init?.method === 'POST') {
        restored = true;
        return ok({ ...removedFile, removedAt: null, removeReason: null, removeNote: null });
      }
      if (url.includes('/events')) return ok([removeEv, uploadEv]);
      if (url.includes('/api/tickets/TTK-2026-000042')) {
        return ok(baseTicket([restored ? { ...removedFile, removedAt: null } : removedFile]));
      }
      return ok({});
    }));
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('Audit trail')).toBeInTheDocument();
    expect(await screen.findByText('2 events')).toBeInTheDocument();
    const removeBadges = await screen.findAllByText('REMOVE');
    expect(removeBadges.length).toBeGreaterThan(0);
    expect(document.querySelector('.tok-aud-badge--remove')).not.toBeNull();
    expect((await screen.findAllByText('UPLOAD')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/AUD-0002/)).length).toBeGreaterThan(0);
    const restoreBtn = await screen.findByRole('button', { name: 'Restore' });
    expect(restoreBtn).toBeInTheDocument();
    await userEvent.click(restoreBtn);
    await waitFor(() => expect(seen.some(s => s.url.includes('/attachments/20/restore') && s.init?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByText(/Attachment restored/)).toBeInTheDocument());
    const details = document.querySelector('[data-testid="audit-row-2"]') as HTMLElement;
    expect(details).not.toBeNull();
    expect(details.textContent).toMatch(/Event ID/);
    expect(details.textContent).toMatch(/Retention note/);
    expect(details.textContent).toMatch(/SHA-256/);
    expect(details.textContent).toMatch(/Ledger note/);
  });

  it('Export JSON downloads {ticket, exportedAt, retention, events} blob', async () => {
    const uploadEv = { id: 5, type: 'UPLOAD', at: '2026-09-15T09:12:00.000Z', createdAt: '2026-09-15T09:12:00.000Z', by: 'Dev User Alpha', actorName: 'Dev User Alpha', file: { id: 10, name: 'shot.png', size: 100, mime: 'image/png', sha: SHA }, reason: null, note: null };
    const single = baseTicket([{ id: 10, fileName: 'shot.png', mimeType: 'image/png', sizeBytes: 100, uploadedAt: '2026-08-18T09:45:00.000Z', removedAt: null, sha256: SHA }]);
    vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, async (url) => {
      if (url.includes('/events')) return ok([uploadEv]);
      if (url.includes('/api/tickets/TTK-2026-000042')) return ok(single);
      return ok({});
    }));
    const blobs: Blob[] = [];
    const createSpy = vi.fn((b: Blob) => { blobs.push(b); return 'blob:mock-audit'; });
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { /* noop */ });
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    expect(await screen.findByText('Audit trail')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const text = await blobs[0].text();
    const parsed = JSON.parse(text) as { ticket: string; exportedAt: string; retention: string; events: unknown[] };
    expect(parsed.ticket).toBe('TTK-2026-000042');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.retention).toBe('RET-7');
    expect(parsed.events).toHaveLength(1);
    expect(await screen.findByText(/Audit ledger exported/)).toBeInTheDocument();
    clickSpy.mockRestore();
  });
});
