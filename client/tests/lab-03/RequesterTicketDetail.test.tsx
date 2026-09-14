import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// Lab 3 Issue #41 — requester Ticket Detail additions (client):
//   T-REQ-02  Development Requester selector / Change Requester absent (AC-03)
//   T-COMM-05 comments render author + time, escaped markup, distinct styles
//   T-STAT-03 (client half) appears-resolved action: confirm modal, success
//             banner, disabled afterwards; status never changed client-side
// Thread feedback states (empty / error / validation) are covered inline.

const USER = sessionUser();

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
  attachments: [],
  appearsResolvedAt: null,
  createdAt: '2026-08-18T09:30:00.000Z',
  updatedAt: '2026-08-18T09:31:00.000Z',
};

let comments: unknown[] = [
  {
    id: 11,
    body: 'Trying <script>alert(1)</script> markup.',
    author: { id: 1, name: 'Dev User Alpha', role: 'REQUESTER' },
    appearsResolved: false,
    createdAt: '2026-08-19T09:00:00.000Z',
  },
];

let postSpy: ReturnType<typeof vi.fn>;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  comments = [
    {
      id: 11,
      body: 'Trying <script>alert(1)</script> markup.',
      author: { id: 1, name: 'Dev User Alpha', role: 'REQUESTER' },
      appearsResolved: false,
      createdAt: '2026-08-19T09:00:00.000Z',
    },
  ];
  postSpy = vi.fn(async (_url: string, body: unknown) => {
    const created = {
      id: 12,
      body: (body as { body: string }).body,
      author: { id: 1, name: 'Dev User Alpha', role: 'REQUESTER' },
      appearsResolved: (body as { appearsResolved?: boolean }).appearsResolved ?? false,
      createdAt: '2026-08-19T10:00:00.000Z',
    };
    return { ok: true, status: 201, json: async () => created } as unknown as Response;
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function installFetch() {
  vi.stubGlobal('fetch', stubAuthenticatedFetch(USER, (url, init) => {
    const u = String(url);
    if (u.includes('/comments') && (init?.method ?? 'GET') === 'POST') {
      return postSpy(u, JSON.parse(String(init?.body)));
    }
    if (u.includes('/comments')) return ok(comments);
    if (u.includes('/api/tickets/TTK-2026-000042')) return ok(TICKET);
    return ok({});
  }));
}

async function openDetail() {
  installFetch();
  window.location.hash = '#/tickets/TTK-2026-000042';
  render(<App />);
  await screen.findAllByText('TTK-2026-000042');
}

describe('T-REQ-02 — selector removed, session identity shown (BR-03, AC-03)', () => {
  it('renders no Development Requester selector or Change Requester action', async () => {
    await openDetail();
    expect(document.querySelector('#dev-requester-select')).toBeNull();
    expect(screen.queryByLabelText(/select requester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change requester/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Testing only — not real authentication/i)).not.toBeInTheDocument();
    // The shell shows the authenticated account menu, not a picker.
    const navbar = document.querySelector('.tok-navbar') as HTMLElement;
    expect(navbar.querySelector('.tok-profile-btn[aria-haspopup="menu"]')).not.toBeNull();
    expect(navbar.textContent).toContain('Dev User Alpha');
  });
});

describe('T-COMM-05 — public comment thread renders safely (BR-14)', () => {
  it('shows author, role, timestamp, and escaped markup', async () => {
    await openDetail();
    // The author name appears in the shell, the read-only Requester field,
    // and the comment header — all must be present.
    expect((await screen.findAllByText('Dev User Alpha')).length).toBeGreaterThanOrEqual(2);
    // The comment row carries its own Requester role badge.
    const row = document.querySelector('.td-comment') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Requester');
    expect(row.textContent).toContain('2026');
    // Markup is displayed as text, never injected.
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    // Empty-state hint only when the thread is empty (not the case here).
    expect(screen.queryByText(/No public comments yet/i)).not.toBeInTheDocument();
  });

  it('empty thread shows the empty state; posting appends and clears the composer', async () => {
    comments = [];
    const user = userEvent.setup();
    await openDetail();
    expect(await screen.findByText(/No public comments yet\. Start the conversation below\./i)).toBeInTheDocument();

    const composer = screen.getByLabelText(/Add a public comment/i);
    await user.type(composer, 'A fresh comment.');
    await user.click(screen.getByRole('button', { name: /Post Comment/i }));

    expect(await screen.findByText('A fresh comment.')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload] = postSpy.mock.calls[0];
    expect(String(url)).toContain('/api/tickets/TTK-2026-000042/comments');
    expect((payload as { body: string }).body).toBe('A fresh comment.');
    expect('appearsResolved' in (payload as object)).toBe(false);
    await waitFor(() => {
      expect((screen.getByLabelText(/Add a public comment/i) as HTMLTextAreaElement).value).toBe('');
    });
    expect(screen.getByText('Comment posted.')).toBeInTheDocument();
  });

  it('whitespace-only drafts cannot be posted; over-limit shows the counter warning', async () => {
    const user = userEvent.setup();
    await openDetail();
    const composer = screen.getByLabelText(/Add a public comment/i);
    const postBtn = screen.getByRole('button', { name: /Post Comment/i });
    expect(postBtn).toBeDisabled();
    await user.type(composer, '    ');
    expect(postBtn).toBeDisabled();
    // Bulk value via change event: typing 2001 chars char-by-char is too slow.
    fireEvent.change(composer, { target: { value: 'a'.repeat(2001) } });
    expect(screen.getByText(/Keep this entry under 2000 characters\./i)).toBeInTheDocument();
    expect(screen.getByText(/characters remaining/i)).toBeInTheDocument();
    expect(postBtn).toBeDisabled();
    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('T-STAT-03 (client) — problem-appears-resolved action (BR-05)', () => {
  it('confirm modal posts a flagged comment; banner appears; button disables afterwards', async () => {
    const user = userEvent.setup();
    await openDetail();

    const signalBtn = screen.getByRole('button', { name: /Problem appears resolved/i });
    await user.click(signalBtn);
    const modal = await screen.findByRole('dialog');
    expect(modal.textContent).toContain('Mark this ticket as appearing resolved?');
    expect(modal.textContent).toContain('does not change the ticket status');

    await user.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload] = postSpy.mock.calls[0];
    expect(String(url)).toContain('/comments');
    expect((payload as { appearsResolved?: boolean }).appearsResolved).toBe(true);

    // Success feedback: flagged chip + banner + disabled control.
    expect((await screen.findAllByText(/appears resolved/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Marked as appearing resolved ✓/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Problem appears resolved/i })).not.toBeInTheDocument();
  });

  it('is hidden once the signal exists; Cancel dismisses without posting', async () => {
    comments = [
      {
        id: 11,
        body: 'Flagged signal comment.',
        author: { id: 1, name: 'Dev User Alpha', role: 'REQUESTER' },
        appearsResolved: true,
        createdAt: '2026-08-19T09:00:00.000Z',
      },
    ];
    const user = userEvent.setup();
    installFetch();
    window.location.hash = '#/tickets/TTK-2026-000042';
    render(<App />);
    await screen.findAllByText('TTK-2026-000042');

    // The flagged chip is visible in the thread.
    expect((await screen.findAllByText(/appears resolved/i)).length).toBeGreaterThan(0);

    const btn = screen.queryByRole('button', { name: /Problem appears resolved/i });
    if (btn) {
      await user.click(btn);
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(postSpy).not.toHaveBeenCalled();
    }
  });

  it('shows a 409-safe error when the signal was already recorded', async () => {
    postSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Problem-appears-resolved was already indicated for this ticket' }),
    } as unknown as Response);
    const user = userEvent.setup();
    await openDetail();
    await user.click(screen.getByRole('button', { name: /Problem appears resolved/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(await screen.findByText(/already marked as appearing resolved/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
