import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import {
  stubAuthenticatedFetch,
  sessionUser,
} from '../helpers/auth';

// Lab 3 §7 — IT Staff Ticket Detail (ui-spec §7 / tests.md T-DETAIL-01).
// Renders <App /> as an authenticated IT_STAFF session and drives the screen
// through its real controls. Network traffic is stubbed at fetch level and
// recorded per URL so tests can assert the exact operations dispatched
// (server-side enforcement itself is covered by the API suites).

const STAFF = sessionUser({ role: 'IT_STAFF', id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' });
const ADMIN = sessionUser({ role: 'ADMINISTRATOR', id: 99, name: 'Ada Admin', email: 'ada@toktickit.test' });

const OWNERS = [
  { id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' },
  { id: 12, name: 'Tom IT', email: 'tom.it@toktickit.test' },
];

const TICKET_NUMBER = 'TTK-2026-901234';

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    ticketNumber: TICKET_NUMBER,
    title: 'Laptop will not boot after update',
    description: 'Screen stays black after the latest OS update.',
    status: 'NEW',
    priority: 'HIGH',
    itPriority: null,
    owner: null,
    requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 3, name: 'Printer' },
    appearsResolvedAt: null,
    attachments: [
      {
        id: 7,
        fileName: 'boot-error.png',
        mimeType: 'image/png',
        sizeBytes: 51200,
        uploadedAt: '2026-09-10T09:45:00.000Z',
        removedAt: null,
      },
    ],
    commentCount: 1,
    internalNoteCount: 1,
    createdAt: '2026-09-10T09:30:00.000Z',
    updatedAt: '2026-09-10T09:30:00.000Z',
    ...overrides,
  };
}

const COMMENTS = [
  {
    id: 900,
    body: 'Tried safe mode — same black screen.',
    author: { id: 1, name: 'Dev User Alpha', role: 'REQUESTER' },
    appearsResolved: false,
    createdAt: '2026-09-10T10:00:00.000Z',
  },
];

const NOTES = [
  {
    id: 950,
    body: 'Spare SSD ready on shelf 2; check warranty before swap.',
    author: { id: 11, name: 'Sara IT', role: 'IT_STAFF' },
    createdAt: '2026-09-10T11:00:00.000Z',
  },
];

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

function stubStaffDetailFetch(
  detail: ReturnType<typeof makeDetail>,
  opts: { user?: typeof STAFF | typeof ADMIN; comments?: unknown[]; notes?: unknown[] } = {},
) {
  const requests: RecordedRequest[] = [];
  const fetchStub = stubAuthenticatedFetch(opts.user ?? STAFF, (url, init) => {
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/comments`)) {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 901,
            body: 'Reply body',
            author: { id: 11, name: 'Sara IT', role: 'IT_STAFF' },
            appearsResolved: false,
            createdAt: '2026-09-10T12:00:00.000Z',
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => opts.comments ?? COMMENTS } as unknown as Response;
    }
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/internal-notes`)) {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 951,
            body: 'Note body',
            author: { id: 11, name: 'Sara IT', role: 'IT_STAFF' },
            createdAt: '2026-09-10T12:00:00.000Z',
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => opts.notes ?? NOTES } as unknown as Response;
    }
    if (url.includes(`/api/staff/owners`)) {
      return { ok: true, status: 200, json: async () => OWNERS } as unknown as Response;
    }
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/owner`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: detail.id,
          ticketNumber: TICKET_NUMBER,
          status: detail.status,
          owner: { id: 12, name: 'Tom IT', email: 'tom.it@toktickit.test' },
          itPriority: detail.itPriority,
          itPriorityCopied: false,
          updatedAt: '2026-09-10T12:30:00.000Z',
        }),
      } as unknown as Response;
    }
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/it-priority`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: detail.id,
          ticketNumber: TICKET_NUMBER,
          priority: detail.priority,
          itPriority: 'HIGH',
          updatedAt: '2026-09-10T12:30:00.000Z',
        }),
      } as unknown as Response;
    }
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}`)) {
      return { ok: true, status: 200, json: async () => detail } as unknown as Response;
    }
    return undefined;
  });
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    return (fetchStub as unknown as (i: RequestInfo | URL, r?: RequestInit) => Promise<Response>)(input, init);
  };
  return { requests, fetchFn: wrapped as unknown as typeof globalThis.fetch };
}

function renderAtHash(hash: string, fetchFn: unknown) {
  vi.stubGlobal('fetch', fetchFn);
  window.location.hash = hash;
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('T-DETAIL-01 — field grouping and read-only enforcement (ui-spec §7.1)', () => {
  it('renders grouped read-only info and editable Owner/IT Priority/Status controls', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);

    await waitFor(() => {
      expect(screen.getByText('Hardware')).toBeInTheDocument();
    });

    // Read-only group present (scoped to the header card: tab panels keep
    // hidden siblings in the DOM, so raw getByText would match those too).
    const header = screen.getByRole('region', { name: 'Ticket fields' });
    expect(within(header).getByText('Dev User Alpha')).toBeInTheDocument();
    expect(within(header).getByText(/Laptop will not boot/)).toBeInTheDocument();

    // Editable controls present with labels.
    expect(screen.getByLabelText(/Owner/)).toBeInTheDocument();
    expect(screen.getByLabelText(/IT Priority/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Status/)).toBeInTheDocument();
  });

  it('does not render a Save bar when nothing is dirty', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Owner/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Save Changes/ })).not.toBeInTheDocument();
  });

  it('shows the Save/Discard bar only after an edit and discards revert it', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Owner/)).toBeInTheDocument());

    const ownerSelect = screen.getByLabelText(/Owner/) as HTMLSelectElement;
    await userEvent.selectOptions(ownerSelect, '12');
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Discard/ }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Save Changes/ })).not.toBeInTheDocument();
    });
  });

  it('saves an owner change to PATCH /owner and shows the success banner', async () => {
    const { fetchFn, requests } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Owner/)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/Owner/), '12');
    await userEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

    await waitFor(() => {
      expect(screen.getByText(/Ticket assigned to Tom IT/)).toBeInTheDocument();
    });
    const ownerCall = requests.find(
      (r) => r.url.includes(`/api/staff/tickets/${TICKET_NUMBER}/owner`) && r.init?.method === 'PATCH',
    );
    expect(ownerCall).toBeDefined();
    expect(JSON.parse(String(ownerCall!.init?.body))).toEqual({ ownerId: 12 });
  });

  it('displays the BR-13 copy-on-claim caption for an unassigned ticket with unset IT Priority', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail({ owner: null, itPriority: null }));
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => {
      expect(screen.getByText(/Claiming copies Requested Priority into IT Priority when unset/)).toBeInTheDocument();
    });
  });

  it('shows the requester appears-resolved indication without calling it formal resolution', async () => {
    const { fetchFn } = stubStaffDetailFetch(
      makeDetail({ appearsResolvedAt: '2026-09-10T10:30:00.000Z', status: 'OPEN' }),
    );
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    // BR-05 wording: an indication to verify, never "formally resolved".
    await waitFor(() => {
      expect(screen.getByText(/indicated this problem appears resolved/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/formally resolved/i)).not.toBeInTheDocument();
  });
});

describe('T-DETAIL-01 — three-tab thread shell (ui-spec §7.3)', () => {
  it('shows Public Comments, Internal Notes (lock-labelled), and Attachments tabs', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Public Comments/ })).toBeInTheDocument());

    expect(screen.getByRole('tab', { name: /Internal Notes/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Internal Notes/ }).textContent).toContain('staff only');
    expect(screen.getByRole('tab', { name: /Attachments/ })).toBeInTheDocument();

    // Public thread content is rendered in its (visible) panel; internal
    // note content stays inside the hidden Internal panel region.
    expect(within(screen.getByRole('tabpanel', { name: 'Public Comments' })).getByText('Tried safe mode — same black screen.')).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: 'Public Comments' })).queryByText('Spare SSD ready on shelf 2; check warranty before swap.')).not.toBeInTheDocument();
  });

  it('internal note body is hidden until the Internal tab is selected', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Internal Notes/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: /Internal Notes/ }));
    await waitFor(() => {
      expect(screen.getByText('Spare SSD ready on shelf 2; check warranty before swap.')).toBeInTheDocument();
    });
  });

  it('renders the persistent staff-only warning inside the Internal tab', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Internal Notes/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: /Internal Notes/ }));
    expect(
      screen.getByText(/Staff only — never visible to the requester/),
    ).toBeInTheDocument();
  });

  it('keeps public and internal styling classes distinct (BR-04 visual separation)', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Internal Notes/ })).toBeInTheDocument());

    const internalTab = screen.getByRole('tab', { name: /Internal Notes/ });
    expect(internalTab.className).toContain('std-tab-internal');

    await userEvent.click(internalTab);
    const warning = await screen.findByText(/Staff only — never visible to the requester/);
    expect(warning.className).toContain('std-internal-warning');
  });

  it('posts a public comment via the staff alias and an internal note via the notes endpoint', async () => {
    const { fetchFn, requests } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Add a public comment/)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Add a public comment/), 'Alias reply.');
    await userEvent.click(screen.getByRole('button', { name: /Post Comment/ }));

    await waitFor(() => {
      const call = requests.find(
        (r) => r.url.includes(`/api/staff/tickets/${TICKET_NUMBER}/comments`) && r.init?.method === 'POST',
      );
      expect(call).toBeDefined();
    });

    await userEvent.click(screen.getByRole('tab', { name: /Internal Notes/ }));
    await userEvent.type(screen.getByLabelText(/Add an internal note/), 'Private detail.');
    await userEvent.click(screen.getByRole('button', { name: /Post Internal Note/ }));

    await waitFor(() => {
      const call = requests.find(
        (r) => r.url.includes(`/api/staff/tickets/${TICKET_NUMBER}/internal-notes`) && r.init?.method === 'POST',
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call!.init?.body))).toEqual({ body: 'Private detail.' });
    });
  });

  it('disables posting when the composer content is empty or whitespace', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('button', { name: /Post Comment/ })).toBeInTheDocument());

    const postBtn = screen.getByRole('button', { name: /Post Comment/ }) as HTMLButtonElement;
    expect(postBtn.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Add a public comment/), '   ');
    expect((screen.getByRole('button', { name: /Post Comment/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists attachments with download in the read-only viewer (no upload affordance)', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail());
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Attachments/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: /Attachments/ }));
    expect(screen.getByText('boot-error.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    // No upload affordance on the staff viewer (read-only per ui-spec §7.3).
    // The tab label itself contains "Attachments", so scope to the panel.
    expect(within(screen.getByRole('tabpanel', { name: 'Attachments' })).queryByText(/drop files/i)).not.toBeInTheDocument();
  });
});

describe('T-DETAIL-01 — status transition controls (BR-15 UI half)', () => {
  it('offers only permitted status targets (disallowed omitted)', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail({ status: 'NEW' }));
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Status/)).toBeInTheDocument());

    const statusSelect = screen.getByLabelText(/Status/) as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map((o) => o.value);
    expect(options).toEqual(['', 'OPEN', 'CANCELLED']);
  });

  it('opens the confirm modal for confirm-required transitions and PATCHes confirm:true', async () => {
    const { fetchFn, requests } = stubStaffDetailFetch(
      makeDetail({ status: 'IN_PROGRESS', owner: OWNERS[0] }),
    );
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Status/)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/Status/), 'RESOLVED');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    await userEvent.click(withinDialogConfirm());
    await waitFor(() => {
      const call = requests.find(
        (r) => r.url.includes(`/api/staff/tickets/${TICKET_NUMBER}/status`) && r.init?.method === 'PATCH',
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call!.init?.body));
      expect(body).toMatchObject({ status: 'RESOLVED', confirm: true });
    });
  });

  it('REOPENED target collects a required reason and includes it in the PATCH', async () => {
    const { fetchFn, requests } = stubStaffDetailFetch(
      makeDetail({ status: 'RESOLVED', owner: OWNERS[0] }),
    );
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Status/)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/Status/), 'REOPENED');
    await screen.findByRole('dialog');

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true); // no reason yet

    await userEvent.type(screen.getByLabelText(/Reason for reopening/), 'Issue returned.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      const call = requests.find(
        (r) => r.url.includes(`/api/staff/tickets/${TICKET_NUMBER}/status`) && r.init?.method === 'PATCH',
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call!.init?.body));
      expect(body).toMatchObject({ status: 'REOPENED', confirm: true, reason: 'Issue returned.' });
    });
  });
});

describe('Role restrictions (client half; server is the enforcer)', () => {
  it('renders editable controls disabled for an ADMINISTRATOR session (AD-02 view-only)', async () => {
    const { fetchFn } = stubStaffDetailFetch(makeDetail(), { user: ADMIN });
    renderAtHash(`#/staff/tickets/${TICKET_NUMBER}`, fetchFn);
    await waitFor(() => expect(screen.getByLabelText(/Owner/)).toBeInTheDocument());

    expect((screen.getByLabelText(/Owner/) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText(/IT Priority/) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Status/) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Post Comment/ })).not.toBeInTheDocument();
  });

  it('requester sessions are refused before the screen mounts', async () => {
    const REQ = sessionUser({ role: 'REQUESTER', id: 2 });
    const { fetchFn } = stubStaffDetailFetch(makeDetail(), { user: REQ });
    vi.stubGlobal('fetch', fetchFn);
    window.location.hash = `#/staff/tickets/${TICKET_NUMBER}`;
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/You do not have access to staff ticket operations/i)).toBeInTheDocument();
    });
  });
});

function withinDialogConfirm(): HTMLElement {
  const dialog = screen.getByRole('dialog');
  const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
    /Confirm/.test(b.textContent ?? ''),
  );
  if (!confirm) throw new Error('Confirm button not found in dialog');
  return confirm;
}
