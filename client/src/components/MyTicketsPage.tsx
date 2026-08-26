import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCategories, getTickets } from '../api';
import type {
  Priority,
  SortBy,
  SortDir,
  Ticket,
  TicketListMeta,
  TicketStatus,
} from '../api';
import { useDevRequester } from '../devRequesterContext';
import '../styles/my-tickets.css';

type ListStatus = 'loading' | 'ready' | 'error';

// Issue #30 — My Tickets v2 (ui-spec §10). Nine-column fluid table with
// sortable headers; the sort state lives on the headers (not a select).
// Natural defaults: ticketNumber asc, dates desc.
interface SortState {
  key: SortBy;
  dir: SortDir;
}

const NATURAL_DIR: Record<SortBy, SortDir> = {
  ticketNumber: 'asc',
  createdAt: 'desc',
  updatedAt: 'desc',
  title: 'asc',
  priority: 'desc',
};

const DEFAULT_SORT: SortState = { key: 'createdAt', dir: 'desc' };

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_LABELS: Array<{ value: TicketStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const PRIORITY_OPTIONS: Array<{ value: Priority | ''; label: string }> = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface Filters {
  search: string;
  categoryId: string;
  priority: string;
  itPriority: string;
  status: string;
  sort: SortState;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  categoryId: '',
  priority: '',
  itPriority: '',
  status: '',
  sort: DEFAULT_SORT,
};

function isDefault(filters: Filters): boolean {
  return (
    filters.search === '' &&
    filters.categoryId === '' &&
    filters.priority === '' &&
    filters.itPriority === '' &&
    filters.status === ''
  );
}

function filtersDiffer(a: Filters, b: Filters): boolean {
  return (
    a.search !== b.search ||
    a.categoryId !== b.categoryId ||
    a.priority !== b.priority ||
    a.itPriority !== b.itPriority ||
    a.status !== b.status ||
    a.sort.key !== b.sort.key ||
    a.sort.dir !== b.sort.dir
  );
}

function buildQuery(filters: Filters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  if (filters.search.trim() !== '') params.set('search', filters.search.trim());
  if (filters.categoryId !== '')
    params.set('categoryId', filters.categoryId);
  if (filters.priority !== '') params.set('priority', filters.priority);
  if (filters.itPriority !== '')
    params.set('itPriority', filters.itPriority);
  if (filters.status !== '') params.set('status', filters.status);
  params.set('sortBy', filters.sort.key);
  params.set('sortDir', filters.sort.dir);
  return params;
}

// Pagination window identical to the reference: all pages when ≤7 total,
// otherwise 1..5 + ellipsis + last / 1 + ellipsis + neighborhood + ellipsis
// + last / 1 + ellipsis + last-4..last.
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
    </span>
  );
}

function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case 'OPEN':
      return 'st-open';
    case 'PENDING':
      return 'st-pending';
    case 'IN_PROGRESS':
      return 'st-inprogress';
    case 'RESOLVED':
      return 'st-resolved';
    default:
      return 'badge-new';
  }
}

const STATUS_TEXT: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`mt-badge ${statusBadgeClass(status)}`}>
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
  sortKey: SortBy;
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
      // Switching columns applies that column's natural default direction.
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

export default function MyTicketsPage({ onNavigate }: { onNavigate?: (hash: string) => void }) {
  const { activeRequester } = useDevRequester();
  const [status, setStatus] = useState<ListStatus>('loading');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meta, setMeta] = useState<TicketListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');

  const requestSeq = useRef(0);

  // Debounce the search draft into the committed filter.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchDraft }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search]);

  const load = useCallback(async () => {
    if (!activeRequester) return;
    const seq = ++requestSeq.current;
    // Only the initial fetch (or a retry after an error) shows the loading
    // skeleton; refreshes while data is on screen keep the table mounted so
    // sort/pagination clicks never flash or detach the header the user just
    // interacted with.
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const result = await getTickets(
        Object.fromEntries(buildQuery(filters, page)) as never,
        activeRequester.id,
      );
      if (seq !== requestSeq.current) return; // stale response — discard
      setTickets(result.data);
      setMeta(result.meta);
      setStatus('ready');
    } catch {
      if (seq !== requestSeq.current) return;
      setStatus('error');
    }
  }, [activeRequester, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const scrollToTop = () => {
    document.querySelector('.mt-page')?.scrollIntoView?.({ behavior: 'smooth' });
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

  const anyFilterActive = !isDefault(filters);
  const showEmpty = status === 'ready' && meta?.totalItems === 0 && !anyFilterActive;
  const showNoResults =
    status === 'ready' && meta?.totalItems === 0 && anyFilterActive;
  const showClearHeadButton =
    filtersDiffer(filters, DEFAULT_FILTERS);

  const rows = useMemo(
    () =>
      tickets.map((t) => (
        <tr key={t.id}>
          <td>
            <a
              className="mt-tkt-link"
              href={`#/tickets/${t.ticketNumber}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.(`#/tickets/${t.ticketNumber}`);
              }}
            >
              {t.ticketNumber}
            </a>
          </td>
          <td>{fmtDate(t.createdAt)}</td>
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
            {t.ownerName ?? <span className="mt-muted">Unassigned</span>}
          </td>
          <td>{fmtDate(t.updatedAt)}</td>
        </tr>
      )),
    [tickets, onNavigate],
  );

  const cards = useMemo(
    () =>
      tickets.map((t) => (
        <div className="m-card" key={t.id}>
          <div className="row1">
            <a
              className="mt-tkt-link"
              href={`#/tickets/${t.ticketNumber}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.(`#/tickets/${t.ticketNumber}`);
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
              {t.category.name} · {t.ownerName ?? 'Unassigned'}
            </span>
            <span>Updated {fmtDate(t.updatedAt)}</span>
          </div>
        </div>
      )),
    [tickets, onNavigate],
  );

  if (!activeRequester) {
    return null;
  }

  const showingText =
    meta == null || meta.totalItems === 0
      ? 'Showing 0 to 0 of 0 tickets'
      : `Showing ${(meta.page - 1) * meta.pageSize + 1} to ${Math.min(
          meta.page * meta.pageSize,
          meta.totalItems,
        )} of ${meta.totalItems} tickets`;

  const window_ = meta ? pageWindow(meta.totalPages, meta.page) : [];

  return (
    <main className="mt-page">
      <div className="mt-head">
        <div>
          <h1>My Tickets</h1>
          <p className="mt-sub">View and track all of your support requests.</p>
        </div>
        <div className="mt-actions">
          {showClearHeadButton && (
            <button type="button" className="mt-btn mt-btn-secondary" onClick={clearAllFilters}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M20 11A8 8 0 1 0 20 13" />
                <polyline points="20 4 20 11 13 11" />
              </svg>
              Clear Filters
            </button>
          )}
          <a
            className="mt-btn mt-btn-primary"
            href="#/new-ticket"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.('#/new-ticket');
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Ticket
          </a>
        </div>
      </div>

      <section className="mt-filter-card" aria-label="Search and filters">
        <div>
          <label className="mt-f-label" htmlFor="mt-search">
            Search by ticket number or summary
          </label>
          <div className="mt-search-wrap">
            <svg className="mt-mag" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
            </svg>
            <input
              id="mt-search"
              type="search"
              placeholder="Search by ticket number or summary..."
              aria-label="Search by ticket number or summary"
              aria-describedby="mt-search-hint"
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
          <span id="mt-search-hint" hidden>
            Matches are case-insensitive across ticket number, title and description.
          </span>
        </div>
        <div>
          <label className="mt-f-label" htmlFor="mt-f-category">
            Category
          </label>
          <CategorySelect
            id="mt-f-category"
            value={filters.categoryId}
            onChange={(v) => updateFilter({ categoryId: v })}
          />
        </div>
        <div>
          <label className="mt-f-label" htmlFor="mt-f-reqpri">
            Requested Priority
          </label>
          <select
            id="mt-f-reqpri"
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
          <label className="mt-f-label" htmlFor="mt-f-itpri">
            IT Priority
          </label>
          <select
            id="mt-f-itpri"
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
          <label className="mt-f-label" htmlFor="mt-f-status">
            Current Status
          </label>
          <select
            id="mt-f-status"
            value={filters.status}
            onChange={(e) => updateFilter({ status: e.target.value })}
          >
            {STATUS_LABELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-table-card" aria-label="My tickets list">
        {status === 'loading' && (
          <div data-testid="skeleton-row-container" className="mt-skeleton" role="status" aria-label="Loading tickets">
            <div data-testid="skeleton-row" className="sk-row" />
            <div data-testid="skeleton-row" className="sk-row" />
            <div data-testid="skeleton-row" className="sk-row" />
          </div>
        )}

        {status === 'error' && (
          <div className="mt-errbar" role="alert">
            <span>We couldn&apos;t load your tickets. Your filters are preserved.</span>
            <button type="button" className="mt-btn mt-btn-tertiary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="mt-live-state">
            <h3>No tickets yet</h3>
            <p>When you submit a support request, it will appear here with its official ticket number.</p>
            <a
              className="mt-btn mt-btn-primary"
              href="#/new-ticket"
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.('#/new-ticket');
              }}
            >
              Create your first ticket
            </a>
          </div>
        )}

        {showNoResults && (
          <div className="mt-live-state">
            <h3>No results match your filters</h3>
            <p>Try a different search term, or clear the filters to see all of your tickets.</p>
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
                  <SortableHeader label="Ticket No." sortKey="ticketNumber" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                  <SortableHeader label="Created Date" sortKey="createdAt" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Requested Priority</th>
                  <th>IT Priority</th>
                  <th>Current Status</th>
                  <th>Ticket Owner</th>
                  <SortableHeader label="Last Updated" sortKey="updatedAt" active={filters.sort} onChange={(sort) => updateFilter({ sort })} />
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>

            {/* Mobile cards (<768px) mirror each row exactly. */}
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
    </main>
  );
}

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        /* filter simply stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All Categories</option>
      {categories.map((c) => (
        <option key={c.id} value={String(c.id)}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
