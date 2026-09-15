import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCategories,
  getQueueOwners,
  getStaffTickets,
} from '../api';
import type {
  Priority,
  QueueOwner,
  StaffQueueMeta,
  StaffQueueTicket,
  StaffSortField,
  SortDir,
  StaffTicketStatus,
} from '../api';
import '../styles/staff-queue.css';

// Lab 3 §6 — IT Staff Ticket Queue (ui-spec §6, api-spec §5.1). Cross-ticket
// operational list for IT Staff/Administrator sessions; requesters never
// reach this component (shell router gate) and are always rejected with 403
// server-side (BR-20 — this screen only mirrors the enforced contract).
// Query controls: debounced search (q), Category, Requested Priority,
// IT Priority, Status, Owner filters; header sort on Number/Created/Updated;
// default ordering Created descending (BR-19); page size 20.

type ListStatus = 'loading' | 'ready' | 'error';

interface SortState {
  key: StaffSortField;
  dir: SortDir;
}

// Natural directions (MyTickets convention): numbers/dates newest-or-asc by
// axis; priority reads best highest-first.
const NATURAL_DIR: Record<StaffSortField, SortDir> = {
  number: 'asc',
  createdAt: 'desc',
  updatedAt: 'desc',
  priority: 'desc',
};

const DEFAULT_SORT: SortState = { key: 'createdAt', dir: 'desc' };
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: Array<{ value: StaffTicketStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_FOR_REQUESTER', label: 'Waiting for Requester' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: Array<{ value: Priority | ''; label: string }> = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_TEXT: Record<StaffTicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

interface Filters {
  q: string;
  categoryId: string;
  priority: string;
  itPriority: string;
  status: string;
  ownerId: string; // '', 'unassigned', or a user id
  assigned: string; // '', 'true', 'false' (derived from ownerId)
  sort: SortState;
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  categoryId: '',
  priority: '',
  itPriority: '',
  status: '',
  ownerId: '',
  assigned: '',
  sort: DEFAULT_SORT,
};

function isDefaultFilters(f: Filters): boolean {
  return (
    f.q === '' &&
    f.categoryId === '' &&
    f.priority === '' &&
    f.itPriority === '' &&
    f.status === '' &&
    f.ownerId === ''
  );
}

interface QueueQuery {
  page: number;
  q: string;
  categoryId: string;
  priority: string;
  itPriority: string;
  status: string;
  ownerId: string;
  assigned: string;
  sort: SortState;
}

function buildQuery(f: Filters, page: number): QueueQuery {
  return {
    page,
    q: f.q.trim(),
    categoryId: f.categoryId,
    priority: f.priority,
    itPriority: f.itPriority,
    status: f.status,
    ownerId: f.ownerId !== '' && f.ownerId !== 'unassigned' ? f.ownerId : '',
    assigned: f.ownerId === 'unassigned' ? 'false' : '',
    sort: f.sort,
  };
}

// Pagination window identical to My Tickets: all pages when ≤7 total,
// otherwise 1..5 + … + last / 1 + … + neighborhood + … + last.
function pageWindow(totalPages: number, current: number): Array<number | '…'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', totalPages];
  if (current >= totalPages - 3)
    return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, '…', current - 1, current, current + 1, '…', totalPages];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  let h = d.getHours();
  const am = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(h).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')} ${am}`;
}

function priBadgeClass(priority: Priority): string {
  switch (priority) {
    case 'CRITICAL':
      return 'pri-critical';
    case 'HIGH':
      return 'pri-high';
    case 'MEDIUM':
      return 'pri-medium';
    default:
      return 'pri-low';
  }
}

function PriBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`mt-badge ${priBadgeClass(priority)}`}>
      {priority === 'CRITICAL' ? '! ' : ''}
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
      {''}
    </span>
  );
}

// §11.1 — the 8 Lab 3 status badges. Text label always present (never
// color-only); glyph per spec where meaningful.
function statusBadgeClass(status: StaffTicketStatus): string {
  switch (status) {
    case 'NEW':
      return 'badge-new';
    case 'OPEN':
      return 'st-open';
    case 'IN_PROGRESS':
      return 'st-inprogress';
    case 'WAITING_FOR_REQUESTER':
      return 'st-waiting';
    case 'RESOLVED':
      return 'st-resolved';
    case 'CLOSED':
      return 'st-closed';
    case 'REOPENED':
      return 'st-reopened';
    case 'CANCELLED':
      return 'st-cancelled';
  }
}

function StatusGlyph({ status }: { status: StaffTicketStatus }) {
  const glyph =
    status === 'WAITING_FOR_REQUESTER'
      ? '⏳'
      : status === 'RESOLVED'
        ? '✓'
        : status === 'CLOSED'
          ? '🔒'
          : status === 'REOPENED'
            ? '↻'
            : status === 'CANCELLED'
              ? '⊘'
              : null;
  return glyph ? (
    <span className="sq-glyph" aria-hidden="true">
      {glyph}
    </span>
  ) : null;
}

function StatusBadge({ status }: { status: StaffTicketStatus }) {
  return (
    <span className={`mt-badge ${statusBadgeClass(status)}`}>
      <StatusGlyph status={status} />
      {STATUS_TEXT[status]}
    </span>
  );
}

function Carets() {
  return (
    <svg className="mt-sic" viewBox="0 0 8 12" aria-hidden="true">
      <path className="mt-up" d="M4 0l4 5H0z" />
      <path className="mt-dn" d="M4 12L0 7h8z" />
    </svg>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: StaffSortField;
  active: SortState;
  onChange: (next: SortState) => void;
}

function SortableHeader({ label, sortKey, active, onChange }: SortableHeaderProps) {
  const isActive = active.key === sortKey;
  const ariaSort = isActive ? (active.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const handleClick = () => {
    if (isActive) {
      onChange({ key: sortKey, dir: active.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      onChange({ key: sortKey, dir: NATURAL_DIR[sortKey] });
    }
  };
  return (
    <th aria-sort={ariaSort}>
      <button type="button" className="mt-th-sort" onClick={handleClick}>
        {label} <Carets />
      </button>
    </th>
  );
}

export default function StaffTicketQueue({ onNavigate }: { onNavigate?: (hash: string) => void }) {
  const [status, setStatus] = useState<ListStatus>('loading');
  const [tickets, setTickets] = useState<StaffQueueTicket[]>([]);
  const [meta, setMeta] = useState<StaffQueueMeta | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [owners, setOwners] = useState<QueueOwner[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);

  const requestSeq = useRef(0);

  // Reference data loads once; a failure leaves the filter simply unpopulated
  // (matching My Tickets behavior) rather than blocking the queue.
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => undefined);
    getQueueOwners()
      .then((list) => {
        if (!cancelled) setOwners(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the search draft into the committed filter.
  useEffect(() => {
    if (searchDraft === filters.q) return;
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, q: searchDraft }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.q]);

  const load = useCallback(async () => {
    const query = buildQuery(filters, page);
    const seq = ++requestSeq.current;
    // Keep the table mounted on refreshes so sort/pagination clicks never
    // flash; only the initial fetch (or a retry after error) shows skeleton.
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const result = await getStaffTickets({
        page: query.page,
        pageSize: PAGE_SIZE,
        q: query.q || undefined,
        status: (query.status || undefined) as StaffTicketStatus | undefined,
        categoryId: query.categoryId ? Number(query.categoryId) : undefined,
        reqPriority: (query.priority || undefined) as Priority | undefined,
        itPriority: (query.itPriority || undefined) as Priority | undefined,
        ownerId: query.ownerId ? Number(query.ownerId) : undefined,
        assigned:
          query.assigned === 'true' ? true : query.assigned === 'false' ? false : undefined,
        sort: query.sort.key,
        order: query.sort.dir,
      });
      if (seq !== requestSeq.current) return; // stale response — discard
      setTickets(result.data);
      setMeta(result.meta);
      setStatus('ready');
    } catch {
      if (seq !== requestSeq.current) return;
      setStatus('error');
    }
  }, [filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const scrollToTop = () => {
    document.querySelector('.sq-page')?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const updateFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchDraft('');
    setPage(1);
    scrollToTop();
  };

  const changePage = (next: number) => {
    setPage(next);
    scrollToTop();
  };

  const anyFilterActive = !isDefaultFilters(filters);
  const showEmpty = status === 'ready' && meta?.totalItems === 0 && !anyFilterActive;
  const showNoResults = status === 'ready' && meta?.totalItems === 0 && anyFilterActive;

  const openDetail = (ticketNumber: string) => {
    onNavigate?.(`#/staff/tickets/${ticketNumber}`);
    window.location.hash = `/staff/tickets/${ticketNumber}`;
  };

  const rows = useMemo(
    () =>
      tickets.map((t) => (
        <tr key={t.id}>
          <td>
            <a
              className="mt-tkt-link"
              href={`#/staff/tickets/${t.ticketNumber}`}
              onClick={(e) => {
                e.preventDefault();
                openDetail(t.ticketNumber);
              }}
            >
              {t.ticketNumber}
            </a>
          </td>
          <td className="sq-date">{fmtDate(t.createdAt)}</td>
          <td className="mt-sum">{t.title}</td>
          <td>{t.category.name}</td>
          <td>
            <PriBadge priority={t.priority} />
          </td>
          <td>
            {t.itPriority ? (
              <PriBadge priority={t.itPriority} />
            ) : (
              <span className="mt-badge badge-unset">Unset</span>
            )}
          </td>
          <td>
            <StatusBadge status={t.status} />
          </td>
          <td>
            {t.owner ? t.owner.name : <span className="mt-muted">Unassigned</span>}
          </td>
          <td className="sq-date">{fmtDate(t.updatedAt)}</td>
          <td>
            <button
              type="button"
              className="sq-open-btn"
              onClick={() => openDetail(t.ticketNumber)}
            >
              Open
            </button>
          </td>
        </tr>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets],
  );

  const cards = useMemo(
    () =>
      tickets.map((t) => (
        <div className="m-card" key={t.id}>
          <div className="row1">
            <a
              className="mt-tkt-link"
              href={`#/staff/tickets/${t.ticketNumber}`}
              onClick={(e) => {
                e.preventDefault();
                openDetail(t.ticketNumber);
              }}
            >
              {t.ticketNumber}
            </a>
            <span className="mt-muted" style={{ fontSize: '0.8125rem' }}>
              {fmtDate(t.createdAt)}
            </span>
          </div>
          <div className="sum">{t.title}</div>
          <div className="badges">
            <PriBadge priority={t.priority} />
            {t.itPriority ? (
              <PriBadge priority={t.itPriority} />
            ) : (
              <span className="mt-badge badge-unset">Unset</span>
            )}
            <StatusBadge status={t.status} />
          </div>
          <div className="meta">
            <span>
              {t.category.name} · {t.owner ? t.owner.name : 'Unassigned'}
            </span>
            <span>Updated {fmtDate(t.updatedAt)}</span>
          </div>
          <button
            type="button"
            className="sq-open-btn sq-open-btn--full"
            onClick={() => openDetail(t.ticketNumber)}
          >
            Open
          </button>
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets],
  );

  const showingText =
    meta == null || meta.totalItems === 0
      ? 'Showing 0 to 0 of 0 tickets'
      : `Showing ${(meta.page - 1) * meta.pageSize + 1} to ${Math.min(
          meta.page * meta.pageSize,
          meta.totalItems,
        )} of ${meta.totalItems} tickets`;

  const resultCount =
    meta == null ? '' : `${meta.totalItems} ticket${meta.totalItems === 1 ? '' : 's'}`;

  const window_ = meta ? pageWindow(meta.totalPages, meta.page) : [];

  return (
    <main className="mt-page sq-page">
      <div className="mt-head">
        <div>
          <h1>Ticket Queue</h1>
          <p className="mt-sub">Find, prioritize, and open tickets across all requesters.</p>
        </div>
        <div className="mt-actions">
          <span className="sq-count" aria-live="polite">
            {resultCount}
          </span>
          {anyFilterActive && (
            <button type="button" className="mt-btn mt-btn-secondary" onClick={clearAllFilters}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M20 11A8 8 0 1 0 20 13" />
                <polyline points="20 4 20 11 13 11" />
              </svg>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-single-card">
        <section className="mt-filter-card mt-filter-section sq-filter" aria-label="Queue search and filters">
          <div>
            <label className="mt-f-label" htmlFor="sq-search">
              Search by ticket number or summary
            </label>
            <div className="mt-search-wrap">
              <svg className="mt-mag" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
              </svg>
              <input
                id="sq-search"
                type="search"
                placeholder="Search by ticket number or summary..."
                aria-label="Search by ticket number or summary"
                autoComplete="off"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              {searchDraft !== '' && (
                <button
                  type="button"
                  className="mt-search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearchDraft('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="mt-f-label" htmlFor="sq-f-category">
              Category
            </label>
            <select
              id="sq-f-category"
              value={filters.categoryId}
              onChange={(e) => updateFilter({ categoryId: e.target.value })}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mt-f-label" htmlFor="sq-f-reqpri">
              Requested Priority
            </label>
            <select
              id="sq-f-reqpri"
              value={filters.priority}
              onChange={(e) => updateFilter({ priority: e.target.value })}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mt-f-label" htmlFor="sq-f-itpri">
              IT Priority
            </label>
            <select
              id="sq-f-itpri"
              value={filters.itPriority}
              onChange={(e) => updateFilter({ itPriority: e.target.value })}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mt-f-label" htmlFor="sq-f-status">
              Current Status
            </label>
            <select
              id="sq-f-status"
              value={filters.status}
              onChange={(e) => updateFilter({ status: e.target.value })}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mt-f-label" htmlFor="sq-f-owner">
              Owner
            </label>
            <select
              id="sq-f-owner"
              value={filters.ownerId}
              onChange={(e) => updateFilter({ ownerId: e.target.value })}
            >
              <option value="">All Owners</option>
              <option value="unassigned">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="mt-table-card mt-table-section" aria-label="Ticket queue">
          {status === 'loading' && (
            <div data-testid="skeleton-row-container" className="mt-skeleton" role="status" aria-label="Loading tickets">
              <div data-testid="skeleton-row" className="sk-row" />
              <div data-testid="skeleton-row" className="sk-row" />
              <div data-testid="skeleton-row" className="sk-row" />
            </div>
          )}

          {status === 'error' && (
            <div className="mt-errbar" role="alert">
              <span>We could not load the queue. Your filters are preserved.</span>
              <button type="button" className="mt-btn mt-btn-tertiary" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}

          {showEmpty && (
            <div className="mt-live-state">
              <h3>No tickets in the queue yet.</h3>
              <p>When requesters submit support requests, they will appear here for triage.</p>
            </div>
          )}

          {showNoResults && (
            <div className="mt-live-state">
              <h3>No tickets match these filters.</h3>
              <p>Try a different search term, or clear the filters to see the full queue.</p>
              <button type="button" className="mt-btn mt-btn-secondary" onClick={clearAllFilters}>
                Clear filters
              </button>
            </div>
          )}

          {status === 'ready' && meta !== null && meta.totalItems > 0 && (
            <>
              <table className="mt-desktop-only">
                <thead>
                  <tr>
                    <SortableHeader label="Number" sortKey="number" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                    <SortableHeader label="Created" sortKey="createdAt" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                    <th>Summary</th>
                    <th>Category</th>
                    <th>Req. Priority</th>
                    <th>IT Priority</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <SortableHeader label="Updated" sortKey="updatedAt" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>{rows}</tbody>
              </table>

              {/* <768px: stacked cards mirror each row; no horizontal scroll. */}
              <div className="mt-cards">{cards}</div>
            </>
          )}

          {meta !== null && (
            <div className="mt-foot">
              <span className="mt-showing" aria-live="polite">
                {showingText}
              </span>
              <nav className="mt-pager" aria-label="Pagination">
                <button
                  type="button"
                  className="mt-page-btn"
                  disabled={meta.page <= 1}
                  onClick={() => changePage(meta.page - 1)}
                >
                  ‹ Previous
                </button>
                {window_.map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="mt-page-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`mt-page-btn${p === meta.page ? ' active' : ''}`}
                      aria-current={p === meta.page ? 'page' : undefined}
                      onClick={() => changePage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="mt-page-btn"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => changePage(meta.page + 1)}
                >
                  Next ›
                </button>
              </nav>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
