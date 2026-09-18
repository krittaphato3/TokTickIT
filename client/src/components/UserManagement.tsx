import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createAdminUser,
  getAdminUsers,
  setUserInitialPassword,
  updateAdminUser,
} from '../api';
import type { AdminUser, AdminUserRole, AdminUserListMetaCounts } from '../api';
import { useAuth } from '../auth/AuthContext';
import '../styles/admin-users.css';

// Lab 3 §8 — Administrator User Management (ui-spec §8, api-spec §9). Renders
// for an authenticated ADMINISTRATOR session; the shell router gate blocks
// other roles before this mounts, and the server rejects non-admin calls with
// 403 regardless (BR-20 — this screen only mirrors the enforced contract).
//
// Stakeholder-requested additions (documented in ui-spec §8): server-side
// PAGINATION (page/pageSize from api-spec §9 meta; the "not required" list
// bars nothing — it only said pagination was not mandatory), a KPI stats
// strip rendered from the meta.counts dataset totals, a denser console-style
// table, and Facebook-style bottom-right TOAST notifications for save
// outcomes (success/conflict) instead of the old top banner. Inline feedback
// (validation, in-modal failures, the load-error state) is unchanged. There
// is still no delete — deactivation replaces deletion (BR-18).

const SEARCH_DEBOUNCE_MS = 300;

// Sortable columns. `id` is the unsorted server order (api-spec §9.1:
// id ascending); Actions is not sortable. Sorting reorders the CURRENT PAGE
// client-side (documented in ui-spec §8) — pages arrive id-ascending.
type SortKey = 'id' | 'name' | 'email' | 'role' | 'status';

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

// Sort weight per role (Administrator sorts first). NOTE: Lab 3 has exactly
// three roles, but if a new role is ever added to the User model, extend this
// map too — otherwise the role column falls back to rank 0 for it.
const ROLE_RANK: Record<string, number> = {
  ADMIN: 3,
  ADMINISTRATOR: 3,
  IT_STAFF: 2,
  REQUESTER: 1,
};

function compareUsers(a: AdminUser, b: AdminUser, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'email':
      return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
    case 'role':
      return (ROLE_RANK[a.role] ?? 0) - (ROLE_RANK[b.role] ?? 0);
    case 'status':
      return Number(b.isActive) - Number(a.isActive); // Active first ascending
    default:
      return a.id - b.id; // server order
  }
}

const ROLE_OPTIONS: Array<{ value: AdminUserRole | ''; label: string }> = [
  { value: '', label: 'All Roles' },
  { value: 'REQUESTER', label: 'Requester' },
  { value: 'IT_STAFF', label: 'IT Staff' },
  { value: 'ADMIN', label: 'Administrator' },
];

const ROLE_LABELS: Record<string, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMIN: 'Administrator',
  ADMINISTRATOR: 'Administrator',
};

const PAGE_SIZES = [10, 25, 50];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldIssues {
  [field: string]: string | undefined;
}

function issuesFromBody(body: { details?: { field: string; message: string }[] }): FieldIssues {
  const map: FieldIssues = {};
  for (const d of body.details ?? []) {
    if (!map[d.field]) map[d.field] = d.message;
  }
  return map;
}

type ModalMode =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser };

interface CreateForm {
  name: string;
  email: string;
  role: AdminUserRole | '';
  isActive: boolean;
  initialPassword: string;
  showPassword: boolean;
}

const EMPTY_CREATE: CreateForm = {
  name: '',
  email: '',
  role: '',
  isActive: true,
  initialPassword: '',
  showPassword: false,
};

interface EditForm {
  name: string;
  email: string;
  role: AdminUserRole | '';
  isActive: boolean;
  newPassword: string;
  showPassword: boolean;
}

function editFormOf(user: AdminUser): EditForm {
  return {
    name: user.name,
    email: user.email,
    role: (ROLE_LABELS[user.role] !== undefined ? user.role : '') as AdminUserRole | '',
    isActive: user.isActive,
    newPassword: '',
    showPassword: false,
  };
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Sort carets (same glyph convention as My Tickets / Staff Queue headers:
// both neutral until the column is active, then the active direction fills
// with the primary green). `none` columns keep clickable neutral carets.
function Carets({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  const cls = active ? `au-sic au-sic-active au-sic-${dir}` : 'au-sic';
  return (
    <svg className={cls} viewBox="0 0 8 12" aria-hidden="true">
      <path className="au-up" d="M4 0l4 5H0z" />
      <path className="au-dn" d="M4 12L0 7h8z" />
    </svg>
  );
}

// ---- Toasts (stakeholder request): Facebook-style bottom-right stack -------
// Success/conflict outcomes of create/edit/set-password actions surface as
// toasts; validation and load failures stay inline where the input is.
interface ToastItem {
  id: number;
  tone: 'success' | 'conflict';
  text: string;
}

const TOAST_TTL_MS = 6500;

function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(item.id), TOAST_TTL_MS);
    return () => window.clearTimeout(t);
  }, [item.id, onDismiss]);
  return (
    <div
      className={`au-toast ${item.tone === 'success' ? 'au-toast-success' : 'au-toast-conflict'}`}
      role={item.tone === 'success' ? 'status' : 'alert'}
    >
      <span className="au-toast-icon" aria-hidden="true">
        {item.tone === 'success' ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10.5l4 4 8-9" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="10" y1="4" x2="10" y2="12" />
            <circle cx="10" cy="16" r="0.6" fill="currentColor" />
          </svg>
        )}
      </span>
      <span className="au-toast-text">{item.text}</span>
      <button
        type="button"
        className="au-toast-x"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
      >
        ×
      </button>
    </div>
  );
}

// ---- Password strength meter (client-side hint only; the server keeps the
// 8–72 length contract for admin-set initial passwords, §1.3 relaxation). ----
function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
}

const METER_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function PasswordMeter({ pw }: { pw: string }) {
  if (!pw) return null;
  const score = passwordScore(pw);
  return (
    <div className="au-meter" aria-hidden="true">
      <div className="au-meter-segs">
        {[1, 2, 3, 4].map((seg) => (
          <span key={seg} className={`au-seg ${seg <= score ? `au-seg-${score}` : ''}`} />
        ))}
      </div>
      <span className="au-meter-label">{METER_LABELS[score]}</span>
    </div>
  );
}

// §8.3 — self-deactivation is blocked client-side via `isSelfRow`/`isLastAdmin`
// in the edit modal (server 409 is the authority).

export default function UserManagement() {
  const { user: self } = useAuth();
  const selfId = self?.id ?? -1;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminUserRole | ''>('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState({
    totalItems: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    counts: { total: 0, admin: 0, itStaff: 0, requester: 0, active: 0, inactive: 0 } as AdminUserListMetaCounts,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // Load-failure copy rendered inside the error state block (never duplicated
  // as a banner — §10 failure feedback lives in one place per surface).
  const [loadError, setLoadError] = useState<string>('We could not load users.');
  // Save outcomes (create/edit/set-password) surface as bottom-right toasts;
  // conflicts (self-deactivation, last-admin, 404) use the amber tone.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalMode>({ kind: 'none' });
  // Client-side single-column sort over the CURRENT page (api-spec §9 returns
  // id-ascending pages; sorting the fetched slice is instant and complete for
  // what is rendered — documented in ui-spec §8).
  const [sort, setSort] = useState<SortState>({ key: 'id', dir: 'asc' });

  const debounceRef = useRef<number | undefined>(undefined);
  const requestIdRef = useRef(0);
  const toastSeq = useRef(0);

  const pushToast = useCallback((tone: ToastItem['tone'], text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, tone, text }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1); // new search → back to the first page
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [searchInput]);

  const load = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState('loading');
    try {
      const result = await getAdminUsers({ search, role: roleFilter, page, pageSize });
      if (id !== requestIdRef.current) return;
      // Page overflow (e.g. filters shrank the dataset): snap to the last
      // valid page; the effect refetches with the corrected number once.
      if (result.data.length === 0 && page > 1 && result.meta.totalItems > 0) {
        setPage(result.meta.totalPages);
        return;
      }
      setUsers(result.data);
      setMeta(result.meta);
      setState('ready');
    } catch (err) {
      if (id !== requestIdRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setLoadError('User management is restricted to administrators.');
      } else {
        setLoadError('We could not load users.');
      }
      setState('error');
    }
  }, [search, roleFilter, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setRoleFilter('');
    setPage(1);
  };

  function changeRoleFilter(value: AdminUserRole | '') {
    setRoleFilter(value);
    setPage(1);
  }

  function changePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }

  // Sorted view of the fetched page; the server list itself is untouched
  // so a refresh preserves the api-spec §9.1 id-ascending contract.
  const sortedUsers = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      const primary = compareUsers(a, b, sort.key);
      return primary !== 0 && sort.key !== 'id'
        ? sort.dir === 'asc'
          ? primary
          : -primary
        : primary; // `id` ignores dir (single natural order)
    });
    return list;
  }, [users, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key === key) {
        if (key === 'id') return prev; // natural order has no second direction
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Sensible first-click directions per column: Role opens with the
      // highest rank (Administrator) first; Status opens Active first;
      // text columns open A→Z.
      return { key, dir: key === 'role' ? 'desc' : 'asc' };
    });
  }

  async function handleCreated() {
    setModal({ kind: 'none' });
    pushToast('success', 'User saved.');
    await load();
  }

  async function handleSaved(user: AdminUser) {
    setModal({ kind: 'none' });
    pushToast('success', `Changes to ${user.email} saved.`);
    await load();
  }

  async function handlePasswordSet(user: AdminUser) {
    setModal({ kind: 'none' });
    pushToast(
      'success',
      `Initial password set for ${user.email}. They must change it at next sign-in.`,
    );
    await load();
  }

  // Footer math (§9 meta): "Showing X–Y of N users".
  const rangeStart = meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const rangeEnd = (meta.page - 1) * meta.pageSize + users.length;

  // Compact page list: 1 … (p-1) p (p+1) … n
  const pageButtons = useMemo(() => {
    const n = meta.totalPages;
    const p = meta.page;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const set = new Set<number>([1, 2, p - 1, p, p + 1, n - 1, n]);
    const list = [...set].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b);
    const out: Array<number | '…'> = [];
    let prev = 0;
    for (const x of list) {
      if (x - prev > 1) out.push('…');
      out.push(x);
      prev = x;
    }
    return out;
  }, [meta.totalPages, meta.page]);

  const kpis: Array<{
    label: string;
    value: number;
    onClick?: () => void;
    active?: boolean;
    tone?: 'admin' | 'staff' | 'requester' | 'active' | 'inactive';
  }> = [
    { label: 'Total users', value: meta.counts.total },
    {
      label: 'Administrators',
      value: meta.counts.admin,
      tone: 'admin',
      onClick: () => changeRoleFilter(roleFilter === 'ADMIN' ? '' : 'ADMIN'),
      active: roleFilter === 'ADMIN',
    },
    {
      label: 'IT Staff',
      value: meta.counts.itStaff,
      tone: 'staff',
      onClick: () => changeRoleFilter(roleFilter === 'IT_STAFF' ? '' : 'IT_STAFF'),
      active: roleFilter === 'IT_STAFF',
    },
    {
      label: 'Requesters',
      value: meta.counts.requester,
      tone: 'requester',
      onClick: () => changeRoleFilter(roleFilter === 'REQUESTER' ? '' : 'REQUESTER'),
      active: roleFilter === 'REQUESTER',
    },
    { label: 'Active', value: meta.counts.active, tone: 'active' },
    { label: 'Inactive', value: meta.counts.inactive, tone: 'inactive' },
  ];

  return (
    <main className="mt-page au-page" aria-labelledby="au-heading">
      <div className="mt-head">
        <div>
          <h1 id="au-heading">User Management</h1>
          <p className="mt-sub">Create accounts, assign roles, and control access.</p>
        </div>
        <div className="mt-actions">
          <button
            type="button"
            className="mt-btn mt-btn-primary"
            onClick={() => setModal({ kind: 'create' })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create user
          </button>
        </div>
      </div>

      {/* Dataset-wide KPI strip from §9 meta.counts; role tiles are filter
          shortcuts (click to filter, click again to clear). */}
      <div className="au-kpis" role="group" aria-label="User statistics">
        {kpis.map((k) =>
          k.onClick ? (
            <button
              key={k.label}
              type="button"
              className={`au-kpi au-kpi-btn ${k.active ? 'au-kpi-active' : ''} ${k.tone ? `au-kpi-${k.tone}` : ''}`}
              onClick={k.onClick}
              aria-pressed={k.active}
            >
              <span className="au-kpi-num">{k.value}</span>
              <span className="au-kpi-label">{k.label}</span>
            </button>
          ) : (
            <div key={k.label} className={`au-kpi ${k.tone ? `au-kpi-${k.tone}` : ''}`}>
              <span className="au-kpi-num">{k.value}</span>
              <span className="au-kpi-label">{k.label}</span>
            </div>
          ),
        )}
      </div>

      <div className="mt-filter-card au-filter">
        <div className="mt-search-wrap">
          <svg className="mt-mag" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
          </svg>
          <input
            type="search"
            aria-label="Search users by name or email"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput ? (
            <button type="button" className="mt-search-clear" aria-label="Clear search" onClick={() => setSearchInput('')}>
              ×
            </button>
          ) : null}
        </div>
        <div>
          <label className="mt-f-label" htmlFor="au-role-filter">Role</label>
          <select
            id="au-role-filter"
            value={roleFilter}
            onChange={(e) => changeRoleFilter(e.target.value as AdminUserRole | '')}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mt-f-label" htmlFor="au-page-size">Rows</label>
          <select
            id="au-page-size"
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-table-card">
        {state === 'loading' ? (
          <div className="mt-skeleton" aria-live="polite" aria-busy="true">
            <div className="sk-row" />
            <div className="sk-row" />
            <div className="sk-row" />
          </div>
        ) : state === 'error' ? (
          <div className="mt-live-state">
            <h3 role="alert">{loadError}</h3>
            <p>Your search and filters are preserved.</p>
            <button type="button" className="mt-btn mt-btn-primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : users.length === 0 ? (
          search || roleFilter ? (
            <div className="mt-live-state">
              <h3>No users match this search.</h3>
              <p>Try a different name, email, or role.</p>
              <button type="button" className="mt-btn mt-btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="mt-live-state">
              <h3>No users yet.</h3>
              <p>Create the first account to get started.</p>
            </div>
          )
        ) : (
          <>
            <table className="au-table">
              <caption className="au-caption" aria-live="polite">
                Showing {rangeStart}–{rangeEnd} of {meta.totalItems}{' '}
                {meta.totalItems === 1 ? 'user' : 'users'}
              </caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="mt-th-sort" onClick={() => toggleSort('name')}>
                      Name <Carets active={sort.key === 'name'} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'email' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="mt-th-sort" onClick={() => toggleSort('email')}>
                      Email <Carets active={sort.key === 'email'} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'role' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="mt-th-sort" onClick={() => toggleSort('role')}>
                      Role <Carets active={sort.key === 'role'} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.key === 'status' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="mt-th-sort" onClick={() => toggleSort('status')}>
                      Status <Carets active={sort.key === 'status'} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" className="au-th-static">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="au-name">
                      <span className="au-avatar" aria-hidden="true">{initialsOf(u.name)}</span>
                      <span className="au-name-text">{u.name}</span>
                      {u.mustChangePassword ? (
                        <span className="au-flag" title="Must change password at next sign-in">P!</span>
                      ) : null}
                    </td>
                    <td className="au-email">{u.email}</td>
                    <td>
                      <span className={`mt-badge au-role au-role-${u.role === 'ADMINISTRATOR' ? 'ADMIN' : u.role}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`mt-badge ${u.isActive ? 'au-status-active' : 'au-status-inactive'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sq-open-btn"
                        onClick={() => setModal({ kind: 'edit', user: u })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards (below 768px, §8.1) — same sort order as the
                table so both renderings agree. */}
            <div className="mt-cards">
              {sortedUsers.map((u) => (
                <div key={u.id} className="m-card">
                  <div className="row1">
                    <span className="au-name-text">{u.name}</span>
                    <span className={`mt-badge ${u.isActive ? 'au-status-active' : 'au-status-inactive'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="meta">
                    <span className="au-email">{u.email}</span>
                  </div>
                  <div className="badges">
                    <span className={`mt-badge au-role au-role-${u.role === 'ADMINISTRATOR' ? 'ADMIN' : u.role}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sq-open-btn sq-open-btn--full"
                    onClick={() => setModal({ kind: 'edit', user: u })}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>

            {/* Pagination footer (§9 meta; server-driven pages). */}
            <div className="au-pager">
              <span className="au-pager-info">
                Page {meta.page} of {meta.totalPages}
              </span>
              <div className="au-pager-btns">
                <button
                  type="button"
                  className="au-pager-btn"
                  aria-label="Previous page"
                  disabled={meta.page <= 1}
                  onClick={() => setPage(meta.page - 1)}
                >
                  ‹ Prev
                </button>
                {pageButtons.map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="au-pager-gap" aria-hidden="true">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`au-pager-btn au-pager-num ${p === meta.page ? 'au-pager-cur' : ''}`}
                      aria-label={`Page ${p}`}
                      aria-current={p === meta.page ? 'page' : undefined}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="au-pager-btn"
                  aria-label="Next page"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage(meta.page + 1)}
                >
                  Next ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal.kind === 'create' ? (
        <CreateUserModal
          onClose={() => setModal({ kind: 'none' })}
          onCreated={handleCreated}
        />
      ) : null}
      {modal.kind === 'edit' ? (
        <EditUserModal
          user={modal.user}
          selfId={selfId}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={handleSaved}
          onPasswordSet={handlePasswordSet}
          onBlocked={(text) => pushToast('conflict', text)}
        />
      ) : null}

      {/* Facebook-style bottom-right toast stack. */}
      {toasts.length > 0 ? (
        <div className="au-toasts" aria-live="polite">
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDismiss={dismissToast} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [issues, setIssues] = useState<FieldIssues>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function validate(): FieldIssues {
    const next: FieldIssues = {};
    if (!form.name.trim()) next.name = 'Enter a name.';
    else if (form.name.trim().length > 100) next.name = 'Name must be at most 100 characters.';
    if (!form.email.trim()) next.email = 'Enter a valid email address.';
    else if (!EMAIL_RE.test(form.email.trim()) || form.email.trim().length > 254) {
      next.email = 'Enter a valid email address.';
    }
    if (!form.role) next.role = 'Select a role.';
    if (form.initialPassword.length < 8) next.initialPassword = 'Use at least 8 characters.';
    else if (form.initialPassword.length > 72) next.initialPassword = 'Use at most 72 characters.';
    return next;
  }

  async function submit() {
    const next = validate();
    setIssues(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFailure(null);
    try {
      await createAdminUser({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role as AdminUserRole,
        isActive: form.isActive,
        initialPassword: form.initialPassword,
      });
      await onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setIssues({ email: 'An account with this email already exists.' });
          return;
        }
        if (err.status === 400 && err.body.details) {
          setIssues(issuesFromBody(err.body));
          return;
        }
      }
      setFailure('We could not save this user. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="td-modal-backdrop" role="presentation" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="au-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="au-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="au-modal-head">
          <span className="au-avatar au-avatar-lg" aria-hidden="true">＋</span>
          <div>
            <h2 id="au-create-title">Create user</h2>
            <p className="au-modal-sub">The person signs in with the initial password and must change it at first login.</p>
          </div>
        </header>
        {failure ? (
          <div className="std-banner error" role="alert">
            <span>{failure}</span>
          </div>
        ) : null}
        <div className="au-form-grid">
          <div className={`tok-field au-field ${issues.name ? 'invalid' : ''}`}>
            <label htmlFor="au-c-name">Name</label>
            <input
              ref={nameRef}
              id="au-c-name"
              className="tok-input"
              value={form.name}
              aria-invalid={issues.name ? true : undefined}
              aria-describedby={issues.name ? 'au-c-name-err' : undefined}
              disabled={saving}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {issues.name ? (
              <p id="au-c-name-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.name}</span></p>
            ) : null}
          </div>
          <div className={`tok-field au-field ${issues.email ? 'invalid' : ''}`}>
            <label htmlFor="au-c-email">Email</label>
            <input
              id="au-c-email"
              type="email"
              className="tok-input"
              value={form.email}
              aria-invalid={issues.email ? true : undefined}
              aria-describedby={issues.email ? 'au-c-email-err' : undefined}
              disabled={saving}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {issues.email ? (
              <p id="au-c-email-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.email}</span></p>
            ) : null}
          </div>
          <div className={`tok-field au-field ${issues.role ? 'invalid' : ''}`}>
            <label htmlFor="au-c-role">Role</label>
            <select
              id="au-c-role"
              className="tok-select"
              value={form.role}
              aria-invalid={issues.role ? true : undefined}
              aria-describedby={issues.role ? 'au-c-role-err' : undefined}
              disabled={saving}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminUserRole | '' })}
            >
              <option value="">Select a role…</option>
              {ROLE_OPTIONS.slice(1).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {issues.role ? (
              <p id="au-c-role-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.role}</span></p>
            ) : (
              <p className="tok-hint">One role per account in Lab 3.</p>
            )}
          </div>
          <div className="au-field au-switch-row au-switch-block">
            <label htmlFor="au-c-active">Status</label>
            <button
              id="au-c-active"
              type="button"
              role="switch"
              aria-checked={form.isActive}
              className="au-switch"
              disabled={saving}
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
            >
              <span className="au-switch-thumb" />
              <span className="au-switch-text">{form.isActive ? 'Active' : 'Inactive'}</span>
            </button>
          </div>
          <div className={`tok-field au-field au-field-full ${issues.initialPassword ? 'invalid' : ''}`}>
            <label htmlFor="au-c-password">Initial Password</label>
            <div className="au-password-row">
              <input
                id="au-c-password"
                type={form.showPassword ? 'text' : 'password'}
                className="tok-input"
                value={form.initialPassword}
                aria-invalid={issues.initialPassword ? true : undefined}
                aria-describedby={issues.initialPassword ? 'au-c-password-err' : 'au-c-password-hint'}
                disabled={saving}
                onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
              />
              <button
                type="button"
                className="au-show-btn"
                onClick={() => setForm({ ...form, showPassword: !form.showPassword })}
              >
                {form.showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <PasswordMeter pw={form.initialPassword} />
            {issues.initialPassword ? (
              <p id="au-c-password-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.initialPassword}</span></p>
            ) : (
              <p id="au-c-password-hint" className="tok-hint">The user must change this at next sign-in.</p>
            )}
          </div>
        </div>
        <div className="td-modal-actions">
          <button type="button" className="tok-btn secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tok-btn primary"
            disabled={saving}
            aria-busy={saving || undefined}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  selfId,
  onClose,
  onSaved,
  onPasswordSet,
  onBlocked,
}: {
  user: AdminUser;
  selfId: number;
  onClose: () => void;
  onSaved: (user: AdminUser) => Promise<void>;
  onPasswordSet: (user: AdminUser) => Promise<void>;
  onBlocked: (text: string) => void;
}) {
  const [form, setForm] = useState<EditForm>(() => editFormOf(user));
  const [issues, setIssues] = useState<FieldIssues>({});
  const [saving, setSaving] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [passwordFailure, setPasswordFailure] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Guards evaluated against THIS row: the signed-in admin's own row can
  // never be deactivated (§8.3), and the last active Administrator row cannot
  // be deactivated or re-rol ed (BR-18). The server remains the authority.
  const isSelfRow = user.id === selfId;
  const isLastAdmin = user.role === 'ADMIN' && user.isActive;
  const activeToggleDisabled = (isSelfRow && user.isActive) || isLastAdmin;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function validate(): FieldIssues {
    const next: FieldIssues = {};
    if (!form.name.trim()) next.name = 'Enter a name.';
    else if (form.name.trim().length > 100) next.name = 'Name must be at most 100 characters.';
    if (!form.email.trim()) next.email = 'Enter a valid email address.';
    else if (!EMAIL_RE.test(form.email.trim()) || form.email.trim().length > 254) {
      next.email = 'Enter a valid email address.';
    }
    if (!form.role) next.role = 'Select a role.';
    return next;
  }

  async function submit() {
    const next = validate();
    setIssues(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFailure(null);
    try {
      const updated = await updateAdminUser(user.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role as AdminUserRole,
        isActive: form.isActive,
      });
      await onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          onBlocked(
            err.body.error === 'Cannot deactivate your own account'
              ? 'You cannot deactivate your own account.'
              : 'At least one active Administrator must remain. This change was not saved.',
          );
          onClose();
          return;
        }
        if (err.status === 404) {
          onBlocked('User not found. The list has been refreshed.');
          onClose();
          return;
        }
        if (err.status === 400 && err.body.details) {
          setIssues(issuesFromBody(err.body));
          return;
        }
      }
      setFailure('We could not save this user. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword() {
    if (form.newPassword.length < 8) {
      setIssues({ initialPassword: 'Use at least 8 characters.' });
      return;
    }
    if (form.newPassword.length > 72) {
      setIssues({ initialPassword: 'Use at most 72 characters.' });
      return;
    }
    setIssues({});
    setSettingPassword(true);
    setPasswordFailure(null);
    try {
      await setUserInitialPassword(user.id, form.newPassword);
      await onPasswordSet(user);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          onBlocked('User not found. The list has been refreshed.');
          onClose();
          return;
        }
        if (err.status === 400 && err.body.details) {
          setIssues(issuesFromBody(err.body));
          return;
        }
      }
      setPasswordFailure('We could not save this user. Try again.');
    } finally {
      setSettingPassword(false);
    }
  }

  return (
    <div className="td-modal-backdrop" role="presentation" onClick={() => { if (!saving && !settingPassword) onClose(); }}>
      <div
        className="au-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="au-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="au-edit-title">Edit user — {user.name}</h2>
        <div className="au-id-row">
          <span className="au-avatar au-avatar-lg" aria-hidden="true">{initialsOf(user.name)}</span>
          <span className="au-id-email">{user.email}</span>
          <span className={`mt-badge au-role au-role-${user.role === 'ADMINISTRATOR' ? 'ADMIN' : user.role}`}>
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <span className={`mt-badge ${user.isActive ? 'au-status-active' : 'au-status-inactive'}`}>
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {failure ? (
          <div className="std-banner error" role="alert">
            <span>{failure}</span>
          </div>
        ) : null}
        <div className="au-form-grid">
          <div className={`tok-field au-field ${issues.name ? 'invalid' : ''}`}>
            <label htmlFor="au-e-name">Name</label>
            <input
              ref={nameRef}
              id="au-e-name"
              className="tok-input"
              value={form.name}
              aria-invalid={issues.name ? true : undefined}
              aria-describedby={issues.name ? 'au-e-name-err' : undefined}
              disabled={saving || settingPassword}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {issues.name ? (
              <p id="au-e-name-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.name}</span></p>
            ) : null}
          </div>
          <div className={`tok-field au-field ${issues.email ? 'invalid' : ''}`}>
            <label htmlFor="au-e-email">Email</label>
            <input
              id="au-e-email"
              type="email"
              className="tok-input"
              value={form.email}
              aria-invalid={issues.email ? true : undefined}
              aria-describedby={issues.email ? 'au-e-email-err' : undefined}
              disabled={saving || settingPassword}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {issues.email ? (
              <p id="au-e-email-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.email}</span></p>
            ) : null}
          </div>
          <div className={`tok-field au-field ${issues.role ? 'invalid' : ''}`}>
            <label htmlFor="au-e-role">Role</label>
            <select
              id="au-e-role"
              className="tok-select"
              value={form.role}
              aria-invalid={issues.role ? true : undefined}
              aria-describedby={issues.role ? 'au-e-role-err' : undefined}
              disabled={saving || settingPassword || (isLastAdmin && !user.role.startsWith('ADMIN'))}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminUserRole | '' })}
            >
              {ROLE_OPTIONS.slice(1).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {issues.role ? (
              <p id="au-e-role-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.role}</span></p>
            ) : null}
          </div>
          <div className="au-field au-switch-row au-switch-block">
            <label htmlFor="au-e-active">Status</label>
            <button
              id="au-e-active"
              type="button"
              role="switch"
              aria-checked={form.isActive}
              className="au-switch"
              disabled={saving || settingPassword}
              onClick={() => {
                // Block only the DEACTIVATING transition (Active → Inactive).
                // The guard is evaluated on the CURRENT rendered state: an
                // active self row or the last active Administrator row cannot
                // be switched off. Turning a blocked toggle back ON is always
                // allowed.
                if (form.isActive && activeToggleDisabled) {
                  setIssues({
                    isActive: isSelfRow
                      ? 'You cannot deactivate your own account.'
                      : 'At least one active Administrator must remain.',
                  });
                  return;
                }
                setIssues({});
                setForm({ ...form, isActive: !form.isActive });
              }}
            >
              <span className="au-switch-thumb" />
              <span className="au-switch-text">{form.isActive ? 'Active' : 'Inactive'}</span>
            </button>
            {issues.isActive ? (
              <p className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.isActive}</span></p>
            ) : null}
          </div>
        </div>
        <div className="au-password-section">
          <h3>Set initial password</h3>
          {passwordFailure ? (
            <div className="std-banner error" role="alert">
              <span>{passwordFailure}</span>
            </div>
          ) : null}
          <div className={`tok-field au-field ${issues.initialPassword ? 'invalid' : ''}`}>
            <label htmlFor="au-e-password">New Initial Password</label>
            <div className="au-password-row">
              <input
                id="au-e-password"
                type={form.showPassword ? 'text' : 'password'}
                className="tok-input"
                value={form.newPassword}
                aria-invalid={issues.initialPassword ? true : undefined}
                aria-describedby={issues.initialPassword ? 'au-e-password-err' : 'au-e-password-hint'}
                disabled={saving || settingPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              />
              <button
                type="button"
                className="au-show-btn"
                onClick={() => setForm({ ...form, showPassword: !form.showPassword })}
              >
                {form.showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <PasswordMeter pw={form.newPassword} />
            {issues.initialPassword ? (
              <p id="au-e-password-err" className="au-field-err" role="alert"><span aria-hidden="true">⚠️</span> <span>{issues.initialPassword}</span></p>
            ) : (
              <p id="au-e-password-hint" className="tok-hint">
                The user must change it at next sign-in.
              </p>
            )}
          </div>
          <button
            type="button"
            className="tok-btn secondary"
            disabled={settingPassword || saving || form.newPassword.length === 0}
            aria-busy={settingPassword || undefined}
            onClick={() => void submitPassword()}
          >
            {settingPassword ? 'Saving…' : 'Set initial password'}
          </button>
        </div>
        <div className="td-modal-actions">
          <button type="button" className="tok-btn secondary" disabled={saving || settingPassword} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tok-btn primary"
            disabled={saving || settingPassword}
            aria-busy={saving || undefined}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
