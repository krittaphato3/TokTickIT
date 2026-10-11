import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// L4-3 — governed workflow UI on the staff Ticket Detail screen
// (docs/lab-04/tests.md UI-05/UI-06 plus the AC-10/AC-12 style and ARIA
// assertions owned by this issue). The screen is driven through its real
// controls with fetch stubbed at the network boundary, so the assertions
// describe what the user sees and which operations the UI dispatches.
//
// The central AC-09 property: the status control renders ONLY the server's
// `allowedTransitions` and never a client-side copy of the matrix.

const STAFF = sessionUser({ role: 'IT_STAFF', id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' });
const TICKET_NUMBER = 'TTK-2026-901234';

const CONFLICT_TEXT = 'This ticket changed while you were working. Review the latest values, then try again.';
const GATE_NOTE = 'Resolution requires at least one recorded action, no outstanding follow-up, and a summary.';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

interface Deferred {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
}

function deferred(): Deferred {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    ticketNumber: TICKET_NUMBER,
    title: 'Laptop will not boot after update',
    description: 'Screen stays black after the latest OS update.',
    status: 'NEW',
    priority: 'HIGH',
    itPriority: null,
    version: 1,
    allowedTransitions: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
    resolvedAt: null,
    resolutionSummary: null,
    owner: { id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test', role: 'IT_STAFF', isActive: true },
    requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 3, name: 'Printer' },
    appearsResolvedAt: null,
    attachments: [],
    commentCount: 0,
    internalNoteCount: 0,
    createdAt: '2026-09-10T09:30:00.000Z',
    updatedAt: '2026-09-10T09:30:00.000Z',
    ...overrides,
  };
}

interface RecordedRequest {
  url: string;
  init?: RequestInit;
  body?: Record<string, unknown>;
}

function stubWorkflow(
  initialDetail: Record<string, unknown>,
  opts: { statusResponses?: Array<Response | Promise<Response>>; user?: typeof STAFF } = {},
) {
  const requests: RecordedRequest[] = [];
  let detail = initialDetail;
  let statusCalls = 0;

  const base = stubAuthenticatedFetch(opts.user ?? STAFF, (url) => {
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/status`)) {
      const next = opts.statusResponses?.[statusCalls];
      statusCalls += 1;
      return (next ??
        jsonResponse(200, {
          id: 501,
          ticketNumber: TICKET_NUMBER,
          status: 'IN_PROGRESS',
          version: 2,
          resolvedAt: null,
          updatedAt: '2026-09-10T12:00:00.000Z',
        })) as Response;
    }
    if (url.includes('/api/staff/owners')) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/comments`)) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/internal-notes`)) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}`)) return jsonResponse(200, detail);
    return undefined;
  });

  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return (base as unknown as (i: RequestInfo | URL, r?: RequestInit) => Promise<Response>)(input, init);
  };

  return {
    requests,
    fetchFn: fetchFn as unknown as typeof globalThis.fetch,
    setDetail: (next: Record<string, unknown>) => {
      detail = next;
    },
    statusCalls: () => statusCalls,
  };
}

function renderDetail(fetchFn: unknown) {
  vi.stubGlobal('fetch', fetchFn);
  window.location.hash = `#/staff/tickets/${TICKET_NUMBER}`;
  render(<App />);
}

async function openResolveDialog(summary = ''): Promise<HTMLElement> {
  const statusSelect = await screen.findByLabelText(/^Status$/);
  await waitFor(() => expect(statusSelect).not.toBeDisabled());
  await userEvent.selectOptions(statusSelect, 'RESOLVED');
  const dialog = await screen.findByRole('dialog', { name: /resolve ticket/i });
  if (summary) {
    await userEvent.type(within(dialog).getByLabelText(/resolution summary/i), summary);
  }
  return dialog;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UI-05 — the status control is server-driven (AC-09)', () => {
  it('renders exactly the targets the server allows, ignoring the Lab 3 client matrix', async () => {
    // The server says: from NEW the only permitted target is CANCELLED.
    // A client-side copy of BR-09 would also offer Open and In Progress.
    const stub = stubWorkflow(makeDetail({ status: 'NEW', allowedTransitions: ['CANCELLED'] }));
    renderDetail(stub.fetchFn);

    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());

    const options = within(statusSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'CANCELLED']);
    expect(within(statusSelect).queryByRole('option', { name: /in progress/i })).toBeNull();
    expect(within(statusSelect).queryByRole('option', { name: /^open$/i })).toBeNull();
  });

  it('shows the muted empty state and disables the control when nothing is permitted', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'CANCELLED', allowedTransitions: [] }));
    renderDetail(stub.fetchFn);

    expect(await screen.findByText('No further status changes')).toBeTruthy();
    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).toBeDisabled());
    expect(stub.requests.filter((r) => r.url.includes('/status'))).toHaveLength(0);
  });

  it('asks for confirmation before a confirmation-required transition and sends nothing until confirmed', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'NEW', allowedTransitions: ['CANCELLED'] }));
    renderDetail(stub.fetchFn);

    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
    await userEvent.selectOptions(statusSelect, 'CANCELLED');

    const confirm = await screen.findByRole('dialog', { name: /cancel this ticket\?/i });
    expect(stub.statusCalls()).toBe(0);
    expect(within(confirm).getByText(/cancel this ticket\?/i)).toBeTruthy();

    await userEvent.click(within(confirm).getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(stub.statusCalls()).toBe(1));
    const body = stub.requests.find((r) => r.url.includes('/status'))?.body;
    expect(body).toMatchObject({ status: 'CANCELLED', confirm: true });
    expect(typeof body?.expectedVersion).toBe('number');
  });

  it('disables the control while the write is in flight so a double submit cannot happen', async () => {
    const pending = deferred();
    const stub = stubWorkflow(makeDetail({ status: 'NEW', allowedTransitions: ['IN_PROGRESS'] }), {
      statusResponses: [pending.promise],
    });
    renderDetail(stub.fetchFn);

    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
    await userEvent.selectOptions(statusSelect, 'IN_PROGRESS');

    await waitFor(() => expect(stub.statusCalls()).toBe(1));
    await waitFor(() => expect(statusSelect).toBeDisabled());

    await act(async () => {
      pending.resolve(
        jsonResponse(200, {
          id: 501,
          ticketNumber: TICKET_NUMBER,
          status: 'IN_PROGRESS',
          version: 2,
          resolvedAt: null,
          updatedAt: '2026-09-10T12:00:00.000Z',
        }),
      );
    });

    await screen.findByText(/status updated to in progress/i);
    expect(stub.statusCalls()).toBe(1);
  });

  it('refreshes the header after a success: status badge, version and the success banner', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'NEW', allowedTransitions: ['IN_PROGRESS'] }), {
      statusResponses: [
        jsonResponse(200, {
          id: 501,
          ticketNumber: TICKET_NUMBER,
          status: 'IN_PROGRESS',
          version: 2,
          resolvedAt: null,
          updatedAt: '2026-09-10T12:00:00.000Z',
        }),
      ],
    });
    renderDetail(stub.fetchFn);

    expect(await screen.findByTestId('ticket-status-badge')).toHaveTextContent('New');
    expect(await screen.findByTestId('ticket-version')).toHaveTextContent('Version 1');

    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
    await userEvent.selectOptions(statusSelect, 'IN_PROGRESS');

    await waitFor(() =>
      expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('In Progress'),
    );
    expect(screen.getByTestId('ticket-version')).toHaveTextContent('Version 2');
    expect(screen.getByText(/status updated to in progress/i)).toBeTruthy();
  });

  it('surfaces a 409 conflict without ever showing the unconfirmed status, and offers Reload', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'NEW', allowedTransitions: ['IN_PROGRESS'] }), {
      statusResponses: [
        jsonResponse(409, {
          error: 'This record was changed by someone else',
          code: 'CONFLICT',
          currentVersion: 4,
          details: [{ field: 'expectedVersion', message: 'Expected version 1, stored version is 4' }],
        }),
      ],
    });
    renderDetail(stub.fetchFn);

    const statusSelect = await screen.findByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
    await userEvent.selectOptions(statusSelect, 'IN_PROGRESS');

    expect(await screen.findByText(CONFLICT_TEXT)).toBeTruthy();
    expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('New');
    const reload = await screen.findByRole('button', { name: /reload/i });
    expect(reload).toBeTruthy();

    // Re-issuing the read realigns the header with the server's version.
    stub.setDetail(makeDetail({ status: 'OPEN', version: 4, allowedTransitions: ['IN_PROGRESS', 'CANCELLED'] }));
    await userEvent.click(reload);
    await waitFor(() => expect(screen.getByTestId('ticket-version')).toHaveTextContent('Version 4'));
    expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('Open');
  });
});

describe('UI-06 — the Resolve dialog and the resolution gate (AC-10)', () => {
  it('opens an accessible modal with the recap, the summary field and the gate note', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }));
    renderDetail(stub.fetchFn);

    const dialog = await openResolveDialog();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();

    const summary = within(dialog).getByLabelText(/resolution summary/i);
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(dialog).getByText(TICKET_NUMBER, { exact: false })).toBeTruthy();
    expect(within(dialog).getByText(GATE_NOTE)).toBeTruthy();
  });

  it('blocks an empty summary client-side and sends no request', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }));
    renderDetail(stub.fetchFn);

    const dialog = await openResolveDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: /^resolve ticket$/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/add a resolution summary/i);
    expect(stub.statusCalls()).toBe(0);
    expect(within(dialog).getByLabelText(/resolution summary/i)).toBeTruthy();
  });

  it('renders one row per RESOLUTION_GATE reason, keeps the dialog open and keeps the typed summary', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }), {
      statusResponses: [
        jsonResponse(422, {
          error: 'Resolution requirements are not met',
          code: 'RESOLUTION_GATE',
          details: [
            { field: 'reasons', message: 'OPEN_FOLLOW_UP' },
            { field: 'reasons', message: 'MISSING_SUMMARY' },
          ],
        }),
      ],
    });
    renderDetail(stub.fetchFn);

    const dialog = await openResolveDialog('Monitored overnight.');
    await userEvent.click(within(dialog).getByRole('button', { name: /^resolve ticket$/i }));

    const openFollowUp = await within(dialog).findByText(/an action still has follow-up required/i);
    expect(openFollowUp).toBeTruthy();
    const missing = await within(dialog).findByText(/add a resolution summary/i);
    expect(missing).toBeTruthy();
    // Each reason is announced, never colour-only.
    for (const row of [openFollowUp, missing]) {
      expect(row.closest('[role="alert"]')).not.toBeNull();
    }
    expect(screen.getByRole('dialog', { name: /resolve ticket/i })).toBeTruthy();
    expect((within(dialog).getByLabelText(/resolution summary/i) as HTMLTextAreaElement).value).toBe(
      'Monitored overnight.',
    );
    expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('Open');
  });

  it('closes on success and shows the Resolved header with the stored summary', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }), {
      statusResponses: [
        jsonResponse(200, {
          id: 501,
          ticketNumber: TICKET_NUMBER,
          status: 'RESOLVED',
          version: 2,
          resolvedAt: '2026-09-11T08:00:00.000Z',
          resolutionSummary: 'Port replaced and monitored for 24 hours.',
          updatedAt: '2026-09-11T08:00:00.000Z',
        }),
      ],
    });
    renderDetail(stub.fetchFn);
    // The post-success refresh re-reads the detail, so the reload returns the
    // resolved shape.
    stub.setDetail(
      makeDetail({
        status: 'RESOLVED',
        version: 2,
        allowedTransitions: ['CLOSED', 'REOPENED'],
        resolvedAt: '2026-09-11T08:00:00.000Z',
        resolutionSummary: 'Port replaced and monitored for 24 hours.',
      }),
    );

    const dialog = await openResolveDialog('Port replaced and monitored for 24 hours.');
    await userEvent.click(within(dialog).getByRole('button', { name: /^resolve ticket$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /resolve ticket/i })).toBeNull());
    await waitFor(() => expect(screen.getByTestId('ticket-status-badge')).toHaveTextContent('Resolved'));
    expect(screen.getByTestId('ticket-version')).toHaveTextContent('Version 2');
    expect(await screen.findByTestId('resolution-summary')).toHaveTextContent(
      'Port replaced and monitored for 24 hours.',
    );

    const body = stub.requests.find((r) => r.url.includes('/status'))?.body;
    expect(body).toMatchObject({
      status: 'RESOLVED',
      confirm: true,
      resolutionSummary: 'Port replaced and monitored for 24 hours.',
    });

    // The refreshed permitted list comes from the server, not from the old copy.
    const statusSelect = screen.getByLabelText(/^Status$/);
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
    const options = within(statusSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'CLOSED', 'REOPENED']);
  });

  it('keeps the typed summary when the write fails with a conflict, and realigns on Reload', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }), {
      statusResponses: [
        jsonResponse(409, {
          error: 'This record was changed by someone else',
          code: 'CONFLICT',
          currentVersion: 3,
        }),
      ],
    });
    renderDetail(stub.fetchFn);

    const dialog = await openResolveDialog('Part on order, monitored.');
    await userEvent.click(within(dialog).getByRole('button', { name: /^resolve ticket$/i }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText(/resolution summary/i) as HTMLTextAreaElement).value,
      ).toBe('Part on order, monitored.'),
    );
    expect(screen.getByText(CONFLICT_TEXT)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /reload/i })).toBeTruthy();
  });

  it('closes the dialog on Escape without submitting and sends nothing', async () => {
    const stub = stubWorkflow(makeDetail({ status: 'OPEN', allowedTransitions: ['RESOLVED', 'CANCELLED'] }));
    renderDetail(stub.fetchFn);

    const dialog = await openResolveDialog('Draft summary.');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /resolve ticket/i })).toBeNull());
    expect(stub.statusCalls()).toBe(0);
  });
});
