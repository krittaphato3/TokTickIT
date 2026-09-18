import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { stubAuthenticatedFetch, sessionUser } from '../helpers/auth';

// Lab 3 §8 — Administrator User Management screen (ui-spec §8; client halves
// of tests.md T-ADM rows + T-UX-01 admin half). Renders <App /> as an
// authenticated ADMINISTRATOR session and drives the screen through its real
// controls; all network traffic is stubbed at fetch level.
//
// jsdom note: the screen renders BOTH the desktop table and the mobile card
// list (CSS hides one side); queries therefore expect doubled text for row
// content (1 table cell + 1 card).

const ADMIN = sessionUser({ role: 'ADMINISTRATOR', name: 'Ada Admin', id: 9 });

interface StubUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

const mkUser = (
  id: number,
  name: string,
  email: string,
  role: string,
  isActive = true,
  mustChangePassword = false,
): StubUserRow => ({
  id,
  name,
  email,
  role,
  isActive,
  mustChangePassword,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
});

const USERS: StubUserRow[] = [
  mkUser(1, 'Dev User Alpha', 'alpha@toktickit.test', 'REQUESTER'),
  mkUser(2, 'Sara IT', 'sara.it@toktickit.test', 'IT_STAFF'),
  mkUser(3, 'Tom IT', 'tom.it@toktickit.test', 'IT_STAFF', false),
  mkUser(4, 'Bob Requester', 'bob@toktickit.test', 'REQUESTER', true, true),
  mkUser(9, 'Ada Admin', 'admin@toktickit.test', 'ADMIN'),
];

const REQUESTER = sessionUser({ role: 'REQUESTER' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Full §9 meta shape (stakeholder-requested pagination; fixed 10/page).
function usersResponse(list = USERS, page = 1, pageSize = 10): Response {
  const totalItems = list.length;
  return jsonResponse({
    data: list.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      totalItems,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  });
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

let fetchHandler: FetchHandler = () => usersResponse();
let userCalls: string[] = [];

beforeEach(() => {
  fetchHandler = () => usersResponse();
  userCalls = [];
  vi.stubGlobal(
    'fetch',
    stubAuthenticatedFetch(ADMIN, (url, init) => {
      if (url.includes('/api/users')) {
        userCalls.push(`${init?.method ?? 'GET'} ${url}`);
        return fetchHandler(url, init);
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openScreen(waitForRows = true) {
  window.location.hash = '#/admin/users';
  render(<App />);
  await screen.findByRole('heading', { name: 'User Management', level: 1 });
  if (waitForRows) {
    await screen.findAllByText('Dev User Alpha'); // rows rendered (table + card)
  }
}

// Matches accessible text composed of multiple nodes (e.g. "⚠️ + message"),
// which getByText's default exact string matcher cannot cross.
const withText = (text: string) => (_content: string, node: Element | null) => {
  if (!node) return false;
  const hasDirectText = Array.from(node.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes(text),
  );
  return hasDirectText;
};

async function waitUntil(predicate: () => boolean): Promise<void> {
  await waitFor(() => expect(predicate()).toBe(true));
}

function editButtonsIn(name: string): HTMLElement[] {
  // Return Edit buttons whose row/card also contains the given user name.
  return screen
    .getAllByRole('button', { name: 'Edit' })
    .filter((btn) => btn.closest('tr, .m-card')?.textContent?.includes(name));
}

async function openEdit(name: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const buttons = editButtonsIn(name);
  expect(buttons.length).toBeGreaterThan(0);
  await user.click(buttons[0]);
  return await screen.findByRole('dialog', { name: `Edit user — ${name}` });
}

// ---------------------------------------------------------------------------
describe('T-AUTHZ-04 (client half) — shell gate for non-admins', () => {
  it('forbidden state replaces the screen when the session role is REQUESTER', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      stubAuthenticatedFetch(REQUESTER, () => jsonResponse({})),
    );
    window.location.hash = '#/admin/users';
    render(<App />);
    expect(
      await screen.findByText('User management is restricted to administrators.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create user' })).not.toBeInTheDocument();
  });
});

describe('T-ADM-01 (client half) — list rendering and search', () => {
  it('renders Name/Email/Role/Status/Actions columns with role and status badges', async () => {
    await openScreen();
    const headers = within(document.querySelector('thead')!).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent?.trim())).toEqual([
      'Name',
      'Email',
      'Role',
      'Status',
      'Actions',
    ]);
    expect(screen.getAllByText('IT Staff').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 1–5 of 5 users/)).toBeInTheDocument();
  });

  it('paginates server-side: page param, footer navigation, and range caption', async () => {
    const user = userEvent.setup();
    // 12 users at 10/page → 2 pages; the stub slices like the server.
    const big = [
      ...USERS,
      ...Array.from({ length: 7 }, (_, i) =>
        mkUser(100 + i, `Extra User ${i + 1}`, `extra${i + 1}@toktickit.test`, 'REQUESTER'),
      ),
    ];
    fetchHandler = (url) => {
      const params = new URL(url).searchParams;
      return usersResponse(big, Number(params.get('page') ?? '1'), Number(params.get('pageSize') ?? '10'));
    };
    await openScreen();
    expect(screen.getByText(/Showing 1–10 of 12 users/)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitUntil(() => userCalls.some((c) => c.includes('page=2')));
    expect(await screen.findByText(/Showing 11–12 of 12 users/)).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    // Page size is fixed at 10 (stakeholder decision): every request carries it.
    expect(userCalls.every((c) => !c.includes('/api/users') || c.includes('pageSize=10'))).toBe(true);
  });

  it('debounces search and sends the search param to the API', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.type(screen.getByLabelText('Search users by name or email'), 'sa');
    await waitUntil(() => userCalls.some((c) => c.includes('search=sa')));
  });

  it('role filter sends role=IT_STAFF and a blank selection clears the param', async () => {
    const user = userEvent.setup();
    fetchHandler = (url) => {
      if (url.includes('role=IT_STAFF')) return usersResponse([USERS[1]]);
      return usersResponse();
    };
    await openScreen();

    await user.selectOptions(screen.getByLabelText('Role'), 'IT_STAFF');
    await waitUntil(() => userCalls.some((c) => c.includes('role=IT_STAFF')));
    // Filtered list renders (table + mobile card = one 'Sara IT' each).
    await screen.findAllByText('Sara IT');

    // Back to All Roles: the role param disappears from the request.
    await user.selectOptions(screen.getByLabelText('Role'), '');
    await waitUntil(() => userCalls.some((c) => !c.includes('role=') && !c.includes('search=')));
    await screen.findAllByText('Dev User Alpha');
  });

  it('no-results state offers Clear filters (filter-aware copy)', async () => {
    const user = userEvent.setup();
    // A filter must be active for the no-results copy (distinct from the
    // empty-system state); use the role filter.
    fetchHandler = () => usersResponse([]);
    await openScreen(false);
    await user.selectOptions(screen.getByLabelText('Role'), 'IT_STAFF');
    expect(await screen.findByText('No users match this search.')).toBeInTheDocument();
    const clear = screen.getByRole('button', { name: 'Clear filters' });

    // Clearing refetches without params and keeps working.
    fetchHandler = () => usersResponse();
    await user.click(clear);
    await waitUntil(() => userCalls.some((c) => !c.includes('role=') && !c.includes('search=')));
    expect(await screen.findAllByText('Dev User Alpha')).toHaveLength(2);
  });

  it('empty system state is distinct from no-results', async () => {
    // No search/role filter is active, so an empty payload means a truly
    // empty system; the screen must render the empty state, not no-results.
    fetchHandler = () => usersResponse([]);
    await openScreen(false);
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });

  it('sorts by Name/Email/Role/Status with aria-sort and cycle directions; Actions stays static', async () => {
    const user = userEvent.setup();
    // Deliberately out of alphabetical order to make sort effects visible.
    fetchHandler = () =>
      usersResponse([
        mkUser(1, 'Zoe Requester', 'zoe@x.test', 'REQUESTER'),
        mkUser(2, 'Adam Staff', 'adam@x.test', 'IT_STAFF'),
        mkUser(3, 'Mia Admin', 'mia@x.test', 'ADMIN', false),
        mkUser(4, 'Bob Requester', 'bob@x.test', 'REQUESTER', false),
      ]);
    await openScreen(false); // payload has no 'Dev User Alpha' row to wait for
    await screen.findAllByText('Zoe Requester');

    const namesInOrder = () =>
      [...document.querySelectorAll('.au-table tbody tr .au-name-text')].map(
        (el) => el.textContent,
      );
    const headerButton = (label: string) =>
      within(document.querySelector('thead')!).getByRole('button', { name: new RegExp(label) });
    const actionsHeader = () =>
      within(document.querySelector('thead')!).getByText('Actions');

    // Default: server order (id ascending).
    expect(namesInOrder()).toEqual(['Zoe Requester', 'Adam Staff', 'Mia Admin', 'Bob Requester']);

    // Name ascending on first click.
    await user.click(headerButton('Name'));
    expect(namesInOrder()).toEqual(['Adam Staff', 'Bob Requester', 'Mia Admin', 'Zoe Requester']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');

    // Name descending on second click.
    await user.click(headerButton('Name'));
    expect(namesInOrder()).toEqual(['Zoe Requester', 'Mia Admin', 'Bob Requester', 'Adam Staff']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending');

    // Email column sorts by email.
    await user.click(headerButton('Email'));
    const emails = [...document.querySelectorAll('.au-table tbody td.au-email')].map(
      (el) => el.textContent,
    );
    expect(emails).toEqual(['adam@x.test', 'bob@x.test', 'mia@x.test', 'zoe@x.test']);
    expect(screen.getByRole('columnheader', { name: /Email/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');

    // Role: first click ranks Administrator > IT Staff > Requester.
    await user.click(headerButton('Role'));
    const roles = [...document.querySelectorAll('.au-table tbody .au-role')].map(
      (el) => el.textContent,
    );
    expect(roles).toEqual(['Administrator', 'IT Staff', 'Requester', 'Requester']);

    // Status: first click puts Active before Inactive.
    await user.click(headerButton('Status'));
    const statuses = [...document.querySelectorAll('.au-table tbody td:nth-child(4) .mt-badge')].map(
      (el) => el.textContent,
    );
    expect(statuses.every((s, i, arr) => i === 0 || arr[i - 1] === 'Active' || s === 'Inactive')).toBe(true);
    expect(statuses.filter((s) => s === 'Active')).toHaveLength(2);

    // Actions header is not a button — no sort control on that column.
    expect(actionsHeader().tagName).toBe('TH');
    expect(document.querySelector('thead')!.querySelectorAll('button')).toHaveLength(4);

    // The mobile card list mirrors the table's sort order (both renderings
    // show the same users in the same sequence).
    const cardNames = [...document.querySelectorAll('.m-card .au-name-text')].map(
      (el) => el.textContent,
    );
    expect(cardNames).toEqual(namesInOrder());
  });

  it('load failure shows the failure state with Try again, then recovers', async () => {
    fetchHandler = () =>
      jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
    await openScreen(false);

    expect(await screen.findByText('We could not load users.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    fetchHandler = () => usersResponse();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByText('Dev User Alpha')).toHaveLength(2);
  });
});

describe('T-ADM-03 (client half) — create user modal', () => {
  it('creates a user and refreshes the list with a success banner', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          mkUser(20, 'New Staff', 'new.staff@toktickit.test', 'IT_STAFF'),
          201,
        );
      }
      return usersResponse();
    };
    await openScreen();

    await user.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create user' });

    await user.type(within(dialog).getByLabelText('Name'), 'New Staff');
    await user.type(within(dialog).getByLabelText('Email'), 'new.staff@toktickit.test');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'IT_STAFF');
    await user.type(within(dialog).getByLabelText('Initial Password'), 'TempPass1!');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    // Success now surfaces as a bottom-right toast (stakeholder request).
    const toast = await screen.findByText('User saved.');
    expect(toast.closest('.au-toast')).toHaveClass('au-toast-success');
    expect(toast.closest('.au-toasts')).not.toBeNull();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it('blocks submit on invalid input with inline messages and no request', async () => {
    const user = userEvent.setup();
    await openScreen();
    await user.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create user' });

    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(within(dialog).getByText(withText('Enter a name.'))).toBeInTheDocument();
    expect(
      within(dialog).getByText(withText('Enter a valid email address.')),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(withText('Select a role.'))).toBeInTheDocument();
    expect(
      within(dialog).getByText(withText('Use at least 8 characters.')),
    ).toBeInTheDocument();
    // No request left the client while invalid.
    expect(userCalls.filter((c) => c.startsWith('POST')).length).toBe(0);
  });

  it('maps duplicate-email 409 to the inline email error and keeps the modal open', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'POST') return jsonResponse({ error: 'Email already exists' }, 409);
      return usersResponse();
    };
    await openScreen();

    await user.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create user' });
    await user.type(within(dialog).getByLabelText('Name'), 'Dup');
    await user.type(within(dialog).getByLabelText('Email'), 'taken@toktickit.test');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'REQUESTER');
    await user.type(within(dialog).getByLabelText('Initial Password'), 'TempPass1!');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(
      await screen.findByText(withText('An account with this email already exists.')),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create user' })).toBeInTheDocument();
  });
});

describe('T-ADM-04/05 (client half) — edit modal, safety, and initial password', () => {
  it('edits fields and saves with a success banner', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'PATCH' && url.endsWith('/api/users/2')) {
        return jsonResponse(mkUser(2, 'Sara IT-Lead', 'sara.it@toktickit.test', 'IT_STAFF'));
      }
      return usersResponse();
    };
    await openScreen();
    const dialog = await openEdit('Sara IT');

    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Sara IT-Lead');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const toast = await screen.findByText('Changes to sara.it@toktickit.test saved.');
    expect(toast.closest('.au-toast')).toHaveClass('au-toast-success');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it('blocks clearing the self Active toggle with the inline warning', async () => {
    const user = userEvent.setup();
    await openScreen();
    // The signed-in admin's own row (Ada Admin, id 9).
    const dialog = await openEdit('Ada Admin');

    // Status is a segmented Active/Inactive control (stakeholder layout pass).
    const inactiveOpt = within(dialog).getByRole('radio', { name: 'Inactive' });
    expect(within(dialog).getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
    await user.click(inactiveOpt);
    expect(
      within(dialog).getByText(withText('You cannot deactivate your own account.')),
    ).toBeInTheDocument();
    // Selection unchanged after the blocked click — still Active.
    expect(within(dialog).getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
    expect(inactiveOpt).toHaveAttribute('aria-checked', 'false');
  });

  it('allows a non-admin row toggle and surfaces server 409 as the amber conflict banner', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'PATCH' && url.endsWith('/api/users/2')) {
        return jsonResponse({ error: 'Cannot reassign the last active Administrator' }, 409);
      }
      if (init?.method === 'PATCH') {
        return jsonResponse({ error: 'Unsupported PATCH target' }, 500);
      }
      return usersResponse();
    };
    await openScreen();
    const dialog = await openEdit('Sara IT');

    await user.selectOptions(within(dialog).getByLabelText('Role'), 'REQUESTER');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const conflictToast = await screen.findByText(
      withText('At least one active Administrator must remain. This change was not saved.'),
    );
    expect(conflictToast.closest('.au-toast')).toHaveClass('au-toast-conflict');
    // Server is the authority: the guarded PATCH actually went out.
    expect(userCalls.some((c) => c.startsWith('PATCH') && c.endsWith('/api/users/2'))).toBe(true);
  });

  it('maps a generic 500 on save to the failure banner with input preserved', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'PATCH') return jsonResponse({ error: 'boom' }, 500);
      if (init?.method === 'POST') {
        return jsonResponse({ error: 'Unsupported POST' }, 500);
      }
      return usersResponse();
    };
    await openScreen();
    const dialog = await openEdit('Sara IT');

    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Sara Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(withText('We could not save this user. Try again.')),
    ).toBeInTheDocument();
    // Values preserved, modal still open.
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Sara Renamed');
  });

  it('sets a new initial password and shows the must-change confirmation', async () => {
    const user = userEvent.setup();
    let postedPassword = '';
    fetchHandler = (url, init) => {
      if (init?.method === 'POST' && url.includes('/set-initial-password')) {
        const payload = JSON.parse(String(init.body)) as { initialPassword: string };
        postedPassword = payload.initialPassword;
        return jsonResponse({
          id: 2,
          email: 'sara.it@toktickit.test',
          mustChangePassword: true,
          updatedAt: '2026-09-01T10:00:00.000Z',
        });
      }
      return usersResponse();
    };
    await openScreen();
    const dialog = await openEdit('Sara IT');

    await user.type(within(dialog).getByLabelText('New Initial Password'), 'ResetPass2@');
    await user.click(within(dialog).getByRole('button', { name: 'Set initial password' }));

    expect(
      await screen.findByText(
        withText(
          'Initial password set for sara.it@toktickit.test. They must change it at next sign-in.',
        ),
      ),
    ).toBeInTheDocument();
    expect(postedPassword).toBe('ResetPass2@');
  });

  it('toasts auto-dismiss and can be dismissed manually', async () => {
    const user = userEvent.setup();
    fetchHandler = (url, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          mkUser(21, 'Toast User', 'toast.user@toktickit.test', 'IT_STAFF'),
          201,
        );
      }
      return usersResponse();
    };
    await openScreen();
    await user.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create user' });
    await user.type(within(dialog).getByLabelText('Name'), 'Toast User');
    await user.type(within(dialog).getByLabelText('Email'), 'toast.user@toktickit.test');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'IT_STAFF');
    await user.type(within(dialog).getByLabelText('Initial Password'), 'TempPass1!');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('User saved.')).toBeInTheDocument();
    // Manual dismiss removes the toast immediately.
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() =>
      expect(screen.queryByText('User saved.')).not.toBeInTheDocument(),
    );
  });

  it('rejects a short initial password client-side without a request', async () => {
    const user = userEvent.setup();
    await openScreen();
    const dialog = await openEdit('Sara IT');

    await user.type(within(dialog).getByLabelText('New Initial Password'), 'Short7!');
    await user.click(within(dialog).getByRole('button', { name: 'Set initial password' }));

    expect(within(dialog).getByText(withText('Use at least 8 characters.'))).toBeInTheDocument();
    expect(userCalls.filter((c) => c.includes('set-initial-password')).length).toBe(0);
  });
});
