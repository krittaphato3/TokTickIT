import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// L4-4 — Actions Taken UI on Ticket Detail (docs/lab-04/tests.md UI-01..UI-04,
// STYLE-02, RESP-02). Tests are driven through <App /> as both staff and
// requester sessions with fetch stubbed at the network boundary.

const STAFF = sessionUser({ role: 'IT_STAFF', id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' });
const REQUESTER = sessionUser({ role: 'REQUESTER', id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' });
const TICKET_NUMBER = 'TTK-2026-901234';

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
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    itPriority: 'HIGH',
    version: 3,
    allowedTransitions: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    resolvedAt: null,
    resolutionSummary: null,
    owner: { id: 11, name: 'Sara IT', email: 'sara.it@toktickit.test' },
    requester: { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 3, name: 'Laptop' },
    appearsResolvedAt: null,
    attachments: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
    ...overrides,
  };
}

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    ticketId: 501,
    actionAt: '2026-09-05T14:30:00.000Z',
    description: 'Replaced thermal paste and dusted fans.',
    result: 'Temperature dropped by 18C and system boots cleanly.',
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    performedBy: { id: 11, name: 'Sara IT', role: 'IT_STAFF' },
    version: 1,
    createdAt: '2026-09-05T14:35:00.000Z',
    updatedAt: '2026-09-05T14:35:00.000Z',
    ...overrides,
  };
}

interface HarnessOpts {
  user?: ReturnType<typeof sessionUser>;
  detail?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
  actionsPostHandler?: (body: Record<string, unknown>) => Response | Promise<Response>;
  actionsPatchHandler?: (actionId: string, body: Record<string, unknown>) => Response | Promise<Response>;
}

function setupHarness(opts: HarnessOpts = {}) {
  const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
  let detail = makeDetail(opts.detail);
  let actions = opts.actions ?? [makeAction()];

  const base = stubAuthenticatedFetch(opts.user ?? STAFF, (url, init) => {
    if (url.includes(`/api/tickets/${TICKET_NUMBER}/actions`) && init?.method === 'POST') {
      if (opts.actionsPostHandler) {
        const parsed = init?.body ? JSON.parse(String(init.body)) : {};
        return opts.actionsPostHandler(parsed);
      }
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      const newAction = makeAction({
        id: 99,
        actionAt: parsed.actionAt ?? new Date().toISOString(),
        description: parsed.description,
        result: parsed.result,
        followUpRequired: Boolean(parsed.followUpRequired),
        followUpNote: parsed.followUpNote ?? null,
        attachmentNotes: parsed.attachmentNotes ?? null,
        performedBy: { id: (opts.user ?? STAFF).id, name: (opts.user ?? STAFF).name, role: (opts.user ?? STAFF).role },
        version: 1,
      });
      actions = [newAction, ...actions];
      return jsonResponse(201, newAction);
    }

    const patchMatch = url.match(new RegExp(`/api/tickets/${TICKET_NUMBER}/actions/(\\d+)`));
    if (patchMatch && init?.method === 'PATCH') {
      const actionId = patchMatch[1];
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      if (opts.actionsPatchHandler) {
        return opts.actionsPatchHandler(actionId, parsed);
      }
      const existingIdx = actions.findIndex((a) => String(a.id) === actionId);
      const existing = actions[existingIdx] ?? makeAction({ id: Number(actionId) });
      const updated = {
        ...existing,
        ...parsed,
        version: (Number(existing.version) || 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) actions[existingIdx] = updated;
      return jsonResponse(200, updated);
    }

    if (url.includes(`/api/tickets/${TICKET_NUMBER}/actions`)) {
      return jsonResponse(200, { ticketNumber: TICKET_NUMBER, actions });
    }

    if (url.includes('/api/staff/owners')) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/comments`)) return jsonResponse(200, []);
    if (url.includes(`/api/tickets/${TICKET_NUMBER}/comments`)) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}/internal-notes`)) return jsonResponse(200, []);
    if (url.includes(`/api/staff/tickets/${TICKET_NUMBER}`)) return jsonResponse(200, detail);
    if (url.includes(`/api/tickets/${TICKET_NUMBER}`)) return jsonResponse(200, detail);
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
    getActions: () => actions,
    setActions: (next: Array<Record<string, unknown>>) => {
      actions = next;
    },
    setDetail: (next: Record<string, unknown>) => {
      detail = next;
    },
  };
}

function renderScreen(fetchFn: unknown, isRequester = false) {
  vi.stubGlobal('fetch', fetchFn);
  window.location.hash = isRequester ? `#/tickets/${TICKET_NUMBER}` : `#/staff/tickets/${TICKET_NUMBER}`;
  render(<App />);
}

describe('Actions Taken UI (L4-4)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '#/';
  });

  // UI-01: staff create form: empty submit, field-level errors, conditional follow-up note
  it('UI-01: validates create form fields, requires follow-up note conditionally, and blocks invalid submits', async () => {
    const harness = setupHarness();
    renderScreen(harness.fetchFn);

    const section = await screen.findByRole('region', { name: /actions taken/i });
    expect(section).toBeInTheDocument();

    const recordBtn = within(section).getByRole('button', { name: /record action/i });
    await userEvent.click(recordBtn);

    expect(within(section).getByText(/new action/i)).toBeInTheDocument();

    const descField = within(section).getByLabelText(/description/i);
    const resultField = within(section).getByLabelText(/result/i);
    const followUpToggle = within(section).getByLabelText(/follow-up required/i);

    // Follow-up note must not be rendered when toggle is off
    expect(within(section).queryByLabelText(/follow-up note/i)).not.toBeInTheDocument();

    // Submit while empty
    const saveBtn = within(section).getByRole('button', { name: /^save action$|^save$/i });
    await userEvent.click(saveBtn);

    // No POST should be sent
    const postCalls = harness.requests.filter((r) => r.url.includes('/actions') && r.init?.method === 'POST');
    expect(postCalls).toHaveLength(0);

    // Field errors rendered directly beneath fields
    expect(within(section).getByText(/description is required/i)).toBeInTheDocument();
    expect(within(section).getByText(/result is required/i)).toBeInTheDocument();

    // Turn on follow-up toggle
    await userEvent.click(followUpToggle);
    const followUpNoteField = await within(section).findByLabelText(/follow-up note/i);
    expect(followUpNoteField).toBeInTheDocument();

    // Submit again — follow-up note must now show validation error
    await userEvent.click(saveBtn);
    expect(within(section).getByText(/follow-up note is required/i)).toBeInTheDocument();

    // Fill valid data
    await userEvent.type(descField, 'Inspected internal power supply rails.');
    await userEvent.type(resultField, '12V rail showed 200mV ripple under load.');
    await userEvent.type(followUpNoteField, 'Order replacement capacitor kit.');

    await userEvent.click(saveBtn);

    await waitFor(() => {
      const posts = harness.requests.filter((r) => r.url.includes('/actions') && r.init?.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toMatchObject({
        description: 'Inspected internal power supply rails.',
        result: '12V rail showed 200mV ripple under load.',
        followUpRequired: true,
        followUpNote: 'Order replacement capacitor kit.',
      });
    });

    // Panel closes on success and success banner is shown
    await waitFor(() => {
      expect(within(section).queryByText(/new action/i)).not.toBeInTheDocument();
      expect(within(section).getByText(/action recorded/i)).toBeInTheDocument();
    });
  });

  // UI-02: busy state, no double submit, 500 error preserves data, clientRequestId reuse
  it('UI-02: disables controls while saving, prevents double submits, preserves entered values on 500, and reuses clientRequestId on retry', async () => {
    const gate = deferred();
    let postCount = 0;
    const clientRequestIds: string[] = [];

    const harness = setupHarness({
      actionsPostHandler: async (body) => {
        postCount += 1;
        clientRequestIds.push(String(body.clientRequestId));
        if (postCount === 1) {
          // Delay first request to test busy state, then return 500
          await gate.promise;
          return jsonResponse(500, { error: 'Database timeout while saving action' });
        }
        return jsonResponse(201, makeAction({ id: 99, ...body }));
      },
    });

    renderScreen(harness.fetchFn);
    const section = await screen.findByRole('region', { name: /actions taken/i });
    await userEvent.click(within(section).getByRole('button', { name: /record action/i }));

    const descField = within(section).getByLabelText(/description/i);
    const resultField = within(section).getByLabelText(/result/i);
    await userEvent.type(descField, 'Replaced faulty ethernet patch cable.');
    await userEvent.type(resultField, 'Packet loss dropped to 0%.');

    const saveBtn = within(section).getByRole('button', { name: /^save action$|^save$/i });

    // Click Save
    await userEvent.click(saveBtn);

    // Busy state: Save button disabled with saving/spinner indicator
    expect(saveBtn).toBeDisabled();
    expect(saveBtn.textContent).toMatch(/saving/i);
    expect(descField).toBeDisabled();
    expect(resultField).toBeDisabled();

    // A second click while busy cannot fire another request
    await userEvent.click(saveBtn);
    expect(postCount).toBe(1);

    // Let the 500 complete
    await act(async () => {
      gate.resolve(jsonResponse(500, { error: 'Database timeout while saving action' }));
    });

    // Error banner shown, form remains open, data preserved
    await waitFor(() => {
      expect(within(section).getByRole('alert')).toBeInTheDocument();
      expect(within(section).getByText(/database timeout while saving action/i)).toBeInTheDocument();
    });
    expect(descField).toHaveValue('Replaced faulty ethernet patch cable.');
    expect(resultField).toHaveValue('Packet loss dropped to 0%.');
    expect(saveBtn).not.toBeDisabled();

    // Retry submit
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(postCount).toBe(2);
    });

    // clientRequestId MUST be reused on retry per BR-06
    expect(clientRequestIds).toHaveLength(2);
    expect(clientRequestIds[0]).toBeTruthy();
    expect(clientRequestIds[0]).toBe(clientRequestIds[1]);
  });

  // UI-03: log rendering, empty state, requester read-only mode
  it('UI-03: renders actions sorted with performed-by, handles empty state, and keeps requester view strictly read-only', async () => {
    const action1 = makeAction({
      id: 101,
      actionAt: '2026-09-08T09:00:00.000Z',
      description: 'Older maintenance action',
      result: 'Success',
      performedBy: { id: 12, name: 'Tom IT', role: 'IT_STAFF' },
      followUpRequired: true,
      followUpNote: 'Inspect in 2 days',
      attachmentNotes: 'patch-log.txt',
    });
    const action2 = makeAction({
      id: 102,
      actionAt: '2026-09-09T15:00:00.000Z',
      description: 'Newer maintenance action',
      result: 'Clean diagnostics',
      performedBy: { id: 11, name: 'Sara IT', role: 'IT_STAFF' },
      followUpRequired: false,
    });

    // Test staff view with actions
    const harness = setupHarness({ actions: [action2, action1] });
    renderScreen(harness.fetchFn, false);

    const section = await screen.findByRole('region', { name: /actions taken/i });
    expect(within(section).getAllByText('Newer maintenance action').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText('Older maintenance action').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText('Sara IT').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText('Tom IT').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText(/follow-up required/i).length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText('Inspect in 2 days').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText(/patch-log\.txt/i).length).toBeGreaterThanOrEqual(1);

    // Test Requester view: read-only, no create button, no edit buttons
    cleanup();
    const reqHarness = setupHarness({ user: REQUESTER, actions: [action2, action1] });
    renderScreen(reqHarness.fetchFn, true);

    const reqSection = await screen.findByRole('region', { name: /actions taken/i });
    await waitFor(() => {
      expect(within(reqSection).getAllByText('Newer maintenance action').length).toBeGreaterThanOrEqual(1);
    });
    expect(within(reqSection).getAllByText('Older maintenance action').length).toBeGreaterThanOrEqual(1);
    expect(within(reqSection).queryByRole('button', { name: /record action/i })).not.toBeInTheDocument();
    expect(within(reqSection).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();

    // Test Requester empty state
    cleanup();
    const emptyHarness = setupHarness({ user: REQUESTER, actions: [] });
    renderScreen(emptyHarness.fetchFn, true);

    const emptySection = await screen.findByRole('region', { name: /actions taken/i });
    await waitFor(() => {
      expect(within(emptySection).getByText(/no actions recorded yet/i)).toBeInTheDocument();
    });
    expect(within(emptySection).getByText(/it staff will record the work here/i)).toBeInTheDocument();
    expect(within(emptySection).queryByRole('button', { name: /record action/i })).not.toBeInTheDocument();
  });

  // UI-04: staff view/edit mode: validation, stale 409 conflict, reload, cancel
  it('UI-04: handles row editing, validation, 409 conflict with reload, and cancel restoring original values', async () => {
    let patchCount = 0;
    const initialAction = makeAction({
      id: 42,
      version: 1,
      description: 'Initial action description',
      result: 'Initial result',
      followUpRequired: false,
      followUpNote: null,
    });

    const harness = setupHarness({
      actions: [initialAction],
      actionsPatchHandler: async (_actionId, body) => {
        patchCount += 1;
        if (Number(body.expectedVersion) === 1) {
          // Stale version conflict: simulate server having updated to version 2
          harness.setActions([{ ...initialAction, version: 2 }]);
          return jsonResponse(409, {
            error: 'This record was changed by someone else',
            currentVersion: 2,
          });
        }
        return jsonResponse(200, {
          ...initialAction,
          ...body,
          version: Number(body.expectedVersion) + 1,
        });
      },
    });

    renderScreen(harness.fetchFn);
    const section = await screen.findByRole('region', { name: /actions taken/i });

    const editBtn = within(section).getAllByRole('button', { name: /edit/i })[0];
    await userEvent.click(editBtn);

    expect(within(section).getAllByText(/editing action/i).length).toBeGreaterThanOrEqual(1);
    const descField = within(section).getAllByLabelText(/description/i)[0];
    const cancelBtn = within(section).getAllByRole('button', { name: /cancel/i })[0];

    // Cancel restores original values without request
    await userEvent.clear(descField);
    await userEvent.type(descField, 'Draft text that will be cancelled');
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(within(section).queryAllByText(/editing action/i)).toHaveLength(0);
    });
    expect(within(section).getAllByText('Initial action description').length).toBeGreaterThanOrEqual(1);
    expect(patchCount).toBe(0);

    // Edit again and test validation
    await userEvent.click(within(section).getAllByRole('button', { name: /edit/i })[0]);
    const editDescField = within(section).getAllByLabelText(/description/i)[0];
    await userEvent.clear(editDescField);
    const saveEditBtn = within(section).getAllByRole('button', { name: /^save changes$|^save$/i })[0];
    await userEvent.click(saveEditBtn);

    expect(within(section).getAllByText(/description is required/i).length).toBeGreaterThanOrEqual(1);
    expect(patchCount).toBe(0);

    // Type valid updated description and submit -> gets 409 conflict
    await userEvent.type(editDescField, 'Updated description for patch');
    await userEvent.click(saveEditBtn);

    await waitFor(() => {
      expect(patchCount).toBe(1);
    });

    // 409 Conflict banner shown, typed values KEPT, Reload action offered
    expect(within(section).getAllByText(/this action was changed by someone else/i).length).toBeGreaterThanOrEqual(1);
    expect(editDescField).toHaveValue('Updated description for patch');

    const reloadBtn = within(section).getAllByRole('button', { name: /reload/i })[0];
    expect(reloadBtn).toBeInTheDocument();

    // Click Reload -> updates expectedVersion to 2, keeps row editable with user data intact
    await userEvent.click(reloadBtn);

    // Save with updated version (2) -> succeeds
    await userEvent.click(saveEditBtn);

    await waitFor(() => {
      expect(patchCount).toBe(2);
      expect(within(section).queryAllByText(/editing action/i)).toHaveLength(0);
      expect(within(section).getAllByText('Updated description for patch').length).toBeGreaterThanOrEqual(1);
    });
  });

  // STYLE-02 & RESP-02: Zen Green classes, token treatments, responsive table vs card
  it('STYLE-02 & RESP-02: applies Zen Green tokens, accessible markup, and responsive card elements', async () => {
    const action = makeAction({
      followUpRequired: true,
      followUpNote: 'Check again tomorrow',
      attachmentNotes: 'error-screenshot.png',
    });
    const harness = setupHarness({ actions: [action] });
    renderScreen(harness.fetchFn);

    const section = await screen.findByRole('region', { name: /actions taken/i });
    expect(section).toHaveAttribute('aria-labelledby');

    // Section header badge count
    const countBadge = within(section).getByText('1');
    expect(countBadge).toBeInTheDocument();

    // Table markup with scope="col" on desktop
    const table = within(section).getByRole('table');
    expect(table).toBeInTheDocument();
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThanOrEqual(6);
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));

    // Check responsive card view exists or has card structure
    const cards = section.querySelectorAll('.action-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);

    // Follow-up warning badge/chip
    const followUpChip = within(section).getAllByText(/follow-up required/i)[0];
    expect(followUpChip).toBeInTheDocument();
    expect(followUpChip.className).toMatch(/warning|chip|badge/i);
  });
});
