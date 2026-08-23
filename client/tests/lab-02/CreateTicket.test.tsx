import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test' },
  { id: 2, name: 'Dev User Beta', email: 'beta@toktickit.test' },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test' },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test' },
];

const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];

const RELATED_SYSTEMS = [
  { id: 1, name: 'Email' },
  { id: 2, name: 'Campus Wi-Fi' },
];

// UI-01..03 — FR-01, BR-12, AC-01..05, AC-20; pixel-matched to the print
// (docs/mockups/create-ticket.html) class structure.
describe('Create Ticket screen', () => {
  let createCalls: { url: string; init: RequestInit }[];

  function stubFetch(options?: { failCreate?: boolean }) {
    createCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/requesters')) return ok(REQUESTERS);
        if (url.includes('/api/categories')) return ok(CATEGORIES);
        if (url.includes('/api/related-systems')) return ok(RELATED_SYSTEMS);
        if (url.includes('/api/tickets') && init?.method === 'POST') {
          createCalls.push({ url, init: init! });
          if (options?.failCreate) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                error: 'Validation failed',
                details: [
                  { field: 'title', message: 'Title must be 120 characters or fewer' },
                ],
              }),
            };
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 101,
              ticketNumber: 'TTK-2026-000042',
              title: JSON.parse(String(init?.body)).title,
              status: 'NEW',
              priority: 'MEDIUM',
              category: CATEGORIES[1],
              relatedSystem: RELATED_SYSTEMS[0],
              createdAt: '2026-08-23T10:00:00.000Z',
              updatedAt: '2026-08-23T10:00:00.000Z',
            }),
          };
        }
        return ok({});
      }),
    );
  }

  function ok(body: unknown) {
    return { ok: true, status: 200, json: async () => body };
  }

  async function gotoCreateScreen() {
    await userEvent.click(screen.getByRole('link', { name: 'New Ticket' }));
    expect(
      await screen.findByRole('option', { name: 'Hardware' }),
    ).toBeInTheDocument();
  }

  beforeEach(() => {
    localStorage.clear();
    stubFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shell: sticky navbar with brand, nav, and requester caption (Step 7)', async () => {
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(nav).toHaveTextContent('New Ticket');
    expect(nav).toHaveTextContent('My Tickets');
    // Brand is a link with the TokTickIT wordmark (home screen also shows the
    // title, so scope to the link role).
    expect(screen.getByRole('link', { name: 'TokTickIT' })).toBeInTheDocument();
    // The mock caption is exact: "Testing only — not real authentication".
    expect(
      screen.getByText('Testing only — not real authentication'),
    ).toBeInTheDocument();

    // Active nav pill lands on New Ticket after navigating.
    await userEvent.click(screen.getByRole('link', { name: 'New Ticket' }));
    expect(await screen.findByRole('option', { name: 'Hardware' })).toBeInTheDocument();
    const newTicketLink = screen.getByRole('link', { name: 'New Ticket' });
    expect(newTicketLink).toHaveAttribute('aria-current', 'page');
  });

  it('form: read-only Requester from context, no ticket number/date fields, selects populated from API (Step 7)', async () => {
    render(<App />);
    await gotoCreateScreen();

    // Read-only Requester reflects active context requester (BR-05).
    const requester = screen.getByRole('textbox', { name: /^Requester/ }) as HTMLInputElement;
    expect(requester).toHaveValue('Dev User Alpha');
    expect(requester).toHaveAttribute('readonly');
    expect(requester).toHaveAttribute('tabindex', '-1');

    // NO ticket-number or ticket-date input/placeholder exists on the create
    // screen; the TTK number appears only after a successful POST.
    expect(document.getElementById('ticket-number')).toBeNull();
    expect(document.getElementById('ticket-date')).toBeNull();
    const forbiddenLabels = screen.queryAllByLabelText(/ticket number|ticket date/i);
    expect(forbiddenLabels).toHaveLength(0);

    // Options came from GET /api/categories and /api/related-systems.
    expect(screen.getByRole('option', { name: 'Hardware' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Campus Wi-Fi' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Requested Priority/)).toHaveValue('MEDIUM');
  });

  it('AC-20: every input has a visible mocked label wired via for/id', async () => {
    render(<App />);
    await gotoCreateScreen();

    const labels = Array.from(document.querySelectorAll('label'));
    for (const name of ['Title', 'Description', 'Category', 'Related System', 'Requested Priority']) {
      const labelEl = labels.find((l) => l.textContent?.trim().startsWith(name));
      expect(labelEl, `visible label for ${name}`).toBeDefined();
      expect(labelEl!.getAttribute('for') ?? '').toBeTruthy();
      const control = document.getElementById(labelEl!.getAttribute('for')!);
      expect(control, `control wired to label ${name}`).not.toBeNull();
    }
  });

  it('UI-01 + AC-20: empty submit shows tok-err inline, focuses Title, aria wiring, no API call', async () => {
    render(<App />);
    await gotoCreateScreen();

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    // Inline error with icon + text below each invalid field (tok-err).
    const titleError = await screen.findByText('Title is required');
    expect(titleError.closest('.tok-err')).toHaveTextContent('!');

    // First invalid field receives focus (AC-20).
    const titleInput = screen.getByLabelText(/^Title/) as HTMLInputElement;
    expect(titleInput).toHaveFocus();

    // aria wiring (AC-20): aria-invalid + aria-describedby → error slot.
    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    const describedby = titleInput.getAttribute('aria-describedby') ?? '';
    expect(describedby.split(' ')).toContain('error-title');
    expect(document.getElementById('error-title')).toHaveTextContent('Title is required');

    // No create request was sent.
    expect(createCalls).toHaveLength(0);
  });

  it('UI-01: long title (>120) and long description (>4000) produce length errors client-side', async () => {
    render(<App />);
    await gotoCreateScreen();

    const setAndFire = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto =
        el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setAndFire(screen.getByLabelText(/^Title/) as HTMLInputElement, 'x'.repeat(121));
    setAndFire(
      screen.getByLabelText(/^Description/) as HTMLTextAreaElement,
      'y'.repeat(4001),
    );
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(
      await screen.findByText('Title must be 120 characters or fewer'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Description must be 4000 characters or fewer'),
    ).toBeInTheDocument();
    expect(createCalls).toHaveLength(0);
  });

  it('UI-02 + AC-05: rapid double-click submits exactly once; button busy/disabled with spinner + aria-busy', async () => {
    let resolveCreate!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/tickets') && init?.method === 'POST') {
          createCalls.push({ url, init: init! });
          return new Promise((resolve) => {
            resolveCreate = resolve;
          });
        }
        if (url.includes('/api/requesters')) return ok(REQUESTERS);
        if (url.includes('/api/categories')) return ok(CATEGORIES);
        if (url.includes('/api/related-systems')) return ok(RELATED_SYSTEMS);
        return ok({});
      }),
    );

    render(<App />);
    await gotoCreateScreen();

    await userEvent.type(screen.getByLabelText(/^Title/), 'Double click ticket');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '2');
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), '1');

    const submit = screen.getByRole('button', { name: /submit ticket|submitting/i });
    await userEvent.click(submit);
    await userEvent.click(submit); // second click while in flight → ignored

    expect(await screen.findByText('Submitting…')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    // The busy state replaces the label, so check the second click was ignored.
    expect(createCalls).toHaveLength(1);

    resolveCreate(ok({ ticketNumber: 'TTK-2026-000007' }));
    await waitFor(() => expect(createCalls).toHaveLength(1));
  });

  it('UI-03 + AC-01: successful create shows the official TTK number (Step 7)', async () => {
    render(<App />);
    await gotoCreateScreen();

    await userEvent.type(screen.getByLabelText(/^Title/), 'Laptop will not boot');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '2');
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), '1');

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    // Mock's success flow navigates to the ticket detail, which shows the
    // official number returned by the backend (STEP 7).
    const numberMatches = await screen.findAllByText(/TTK-2026-000042/);
    expect(numberMatches.length).toBeGreaterThan(0);
    expect(createCalls).toHaveLength(1);
    const sent = JSON.parse(String(createCalls[0].init.body));
    expect(sent.title).toBe('Laptop will not boot');
    expect(sent.categoryId).toBe(2);
    expect(sent.relatedSystemId).toBe(1);
    expect(sent.priority).toBe('MEDIUM');
    expect(
      (createCalls[0].init.headers as Record<string, string>)['X-Dev-Requester-Id'],
    ).toBe('1');
  });

  it('failure: server 400 renders tok-alert.error with Try again and preserves all input', async () => {
    stubFetch({ failCreate: true });
    render(<App />);
    await gotoCreateScreen();

    const title = screen.getByLabelText(/^Title/) as HTMLInputElement;
    await userEvent.type(title, 'A very long title the server rejects');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '2');
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), '1');
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    const alerts = await screen.findAllByRole('alert');
    const subtitle = alerts.find((a) => a.textContent?.includes('Validation failed'));
    expect(subtitle).toBeDefined();
    expect(subtitle).toHaveClass('tok-alert');
    expect(subtitle).toHaveClass('error');
    expect(screen.getByText('Try again')).toBeInTheDocument();
    // Input preserved after failure.
    expect(screen.getByLabelText(/^Title/)).toHaveValue(
      'A very long title the server rejects',
    );
  });

  it('attachments: mock chips — valid ✓ + size, invalid ! with dismissible ×, 5-file cap', async () => {
    render(<App />);
    await gotoCreateScreen();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const drop = (files: File[]) => fireEvent.change(input, { target: { files } });

    // Valid small PNG → ok chip with ✓ + name + size.
    drop([new File([new Uint8Array([137, 80, 78, 71])], 'boot-error.png', {
      type: 'image/png',
    })]);
    const okChip = (await screen.findByText('boot-error.png')).closest('.tok-chip') as HTMLElement;
    expect(okChip).not.toHaveClass('invalid');
    expect(okChip).toHaveTextContent('✓');
    expect(okChip).toHaveTextContent(/KB/);

    // Disallowed type → invalid chip worded like the mock.
    drop([new File([new Uint8Array([77, 90])], 'virus.exe', {
      type: 'application/x-msdownload',
    })]);
    const badChip = (await screen.findByText(/File type not supported/)).closest('.tok-chip') as HTMLElement;
    expect(badChip).toHaveClass('invalid');
    expect(badChip).toHaveTextContent('!');
    expect(badChip).toHaveTextContent('virus.exe');

    // Oversized → invalid chip.
    drop([new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'huge.pdf', {
      type: 'application/pdf',
    })]);
    const bigChip = (await screen.findByText(/File too large — max 5 MB/)).closest('.tok-chip') as HTMLElement;
    expect(bigChip).toHaveClass('invalid');

    // 5-file cap on ACTIVE (non-invalid) chips → next valid file becomes an
    // invalid chip with the limit message; all chips remain dismissible.
    for (let i = 0; i < 5; i++) {
      drop([new File([new Uint8Array([1])], `extra${i}.jpg`, {
        type: 'image/jpeg',
      })]);
    }
    const limitChip = (await screen.findByText(/Attachment limit reached \(5 max\)/)).closest('.tok-chip') as HTMLElement;
    expect(limitChip).toHaveClass('invalid');

    const activeChips = Array.from(document.querySelectorAll('.tok-chip')).filter(
      (c) => !c.classList.contains('invalid'),
    );
    expect(activeChips).toHaveLength(5);

    // A chip is dismissible via its × button.
    const dismissButtons = Array.from(document.querySelectorAll('.tok-chip .x'));
    expect(dismissButtons.length).toBeGreaterThan(0);

    // Files are pending only — nothing was uploaded to the API yet.
    expect(createCalls).toHaveLength(0);
  });
});