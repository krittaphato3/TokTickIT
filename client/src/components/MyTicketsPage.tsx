import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTickets } from '../api';
import type { Priority, SortBy, SortDir, Ticket, TicketListMeta } from '../api';
import { useDevRequester } from '../devRequesterContext';
import '../styles/my-tickets.css';

type ListStatus = 'loading' | 'ready' | 'error';

// Sort control value ⇄ API params. Order matches the mockup exactly.
const SORT_OPTIONS: Array<{ label: string; sortBy: SortBy; sortDir: SortDir }> = [
  { label: 'Newest first', sortBy: 'createdAt', sortDir: 'desc' },
  { label: 'Oldest first', sortBy: 'createdAt', sortDir: 'asc' },
  { label: 'Title A–Z', sortBy: 'title', sortDir: 'asc' },
  { label: 'Title Z–A', sortBy: 'title', sortDir: 'desc' },
  { label: 'Priority: high first', sortBy: 'priority', sortDir: 'desc' },
  { label: 'Priority: low first', sortBy: 'priority', sortDir: 'asc' },
];

const DEFAULT_SORT = SORT_OPTIONS[0];
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

interface Filters {
  search: string;
  categoryId: string; // '' = All Categories
  priority: string; // '' = All Priorities
  sortIndex: number; // index into SORT_OPTIONS
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  categoryId: '',
  priority: '',
  sortIndex: 0,
};

function isDefault(filters: Filters): boolean {
  return (
    filters.search === '' &&
    filters.categoryId === '' &&
    filters.priority === '' &&
    filters.sortIndex === 0
  );
}

function sortValueToParams(index: number): { sortBy: SortBy; sortDir: SortDir } {
  const option = SORT_OPTIONS[index] ?? DEFAULT_SORT;
  return { sortBy: option.sortBy, sortDir: option.sortDir };
}

function paramsToSortValue(sortBy: SortBy, sortDir: SortDir): number {
  const index = SORT_OPTIONS.findIndex(
    (o) => o.sortBy === sortBy && o.sortDir === sortDir,
  );
  return index >= 0 ? index : 0;
}

// Natural direction for the first click on a sortable column header.
const NATURAL_DIR: Record<'title' | 'priority' | 'createdAt', SortDir> = {
  title: 'asc',
  priority: 'desc',
  createdAt: 'desc',
};

function priorityBadgeClass(priority: Priority): string {
  switch (priority) {
    case 'LOW':
      return 'badge b-low';
    case 'MEDIUM':
      return 'badge b-med';
    case 'HIGH':
      return 'badge b-high';
    case 'CRITICAL':
      return 'badge b-crit';
  }
}

function priorityLabel(priority: Priority): string {
  return priority === 'CRITICAL' ? '! Critical' : priority.charAt(0) + priority.slice(1).toLowerCase();
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Numbered pagination: at most 5 numbered buttons whenever totalPages > 5,
// shaped `1 … x y z … N` (first and last always present when outside the
// moving 3-page window); all pages listed when totalPages <= 5.
function pageItems(current: number, total: number): Array<number | '…'> {
  if (total <= 0) return [];
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const windowStart = Math.max(1, Math.min(current - 1, total - 2));
  const windowEnd = windowStart + 2;
  const items: Array<number | '…'> = [];
  if (windowStart > 1) {
    items.push(1);
    if (windowStart > 2) items.push('…');
  }
  for (let p = windowStart; p <= windowEnd; p++) items.push(p);
  if (windowEnd < total) {
    if (windowEnd < total - 1) items.push('…');
    items.push(total);
  }
  return items;
}

/** aria-sort value for an actively sorted column header; null otherwise. */
function ariaSortFor(
  column: 'title' | 'priority' | 'createdAt',
  sortIndex: number,
): 'ascending' | 'descending' | null {
  const current = sortValueToParams(sortIndex);
  if (current.sortBy !== column) return null;
  return current.sortDir === 'asc' ? 'ascending' : 'descending';
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div className="sk-row" data-testid="sk-row" key={i} aria-hidden="true">
          <span className="sk" style={{ width: '14%' }} />
          <span className="sk" style={{ width: '38%' }} />
          <span className="sk" style={{ width: '12%' }} />
          <span className="sk" style={{ width: '10%' }} />
          <span className="sk" style={{ width: '10%' }} />
        </div>
      ))}
    </>
  );
}

export default function MyTicketsPage({
  onNavigate,
}: {
  onNavigate: (hash: string) => void;
}) {
  const { activeRequester } = useDevRequester();
  const requesterId = activeRequester?.id ?? null;

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meta, setMeta] = useState<TicketListMeta | null>(null);

  // Monotonic token so only the latest in-flight response mutates state.
  const requestSeq = useRef(0);

  // Latest-request snapshot used by the debounced search effect and Try again.
  const fetchList = useCallback(
    async (params: Filters, targetPage: number) => {
      if (requesterId === null) return;
      const seq = ++requestSeq.current;
      setStatus('loading');
      try {
        const result = await getTickets(
          {
            page: targetPage,
            pageSize: PAGE_SIZE,
            ...(params.search !== '' ? { search: params.search } : {}),
            ...(params.categoryId !== ''
              ? { categoryId: Number(params.categoryId) }
              : {}),
            ...(params.priority !== ''
              ? { priority: params.priority as Priority }
              : {}),
            ...sortValueToParams(params.sortIndex),
          },
          requesterId,
        );
        if (seq !== requestSeq.current) return;
        setTickets(result.data);
        setMeta(result.meta);
        setStatus('ready');
      } catch {
        if (seq !== requestSeq.current) return;
        setStatus('error');
      }
    },
    [requesterId],
  );

  // Refetch whenever filters or pagination change.
  useEffect(() => {
    void fetchList(filters, page);
  }, [fetchList, filters, page]);

  // Debounced search commits to `filters` (which triggers the refetch above).
  const [searchDraft, setSearchDraft] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === searchDraft
          ? current
          : { ...current, search: searchDraft },
      );
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  // Page change scrolls the list back into view (jsdom has no scrollIntoView).
  useEffect(() => {
    document.getElementById('my-tickets-top')?.scrollIntoView?.({
      block: 'start',
    });
  }, [page]);

  function updateFilter(patch: Partial<Filters>) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleColumnSort(column: 'title' | 'priority' | 'createdAt') {
    const current = sortValueToParams(filters.sortIndex);
    const dir =
      current.sortBy === column && current.sortDir === NATURAL_DIR[column]
        ? column === 'title'
          ? 'desc'
          : 'asc'
        : NATURAL_DIR[column];
    updateFilter({ sortIndex: paramsToSortValue(column, dir) });
  }

  function clearAllFilters() {
    setSearchDraft('');
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  const nonDefault = !isDefault(filters);

  const rangeText = useMemo(() => {
    if (!meta || meta.totalItems === 0) return null;
    const x = (meta.page - 1) * meta.pageSize + 1;
    const y = Math.min(meta.page * meta.pageSize, meta.totalItems);
    return `Showing ${x}–${y} of ${meta.totalItems}`;
  }, [meta]);

  const emptyTickets = status === 'ready' && meta !== null && meta.totalItems === 0 && isDefault(filters);
  const noResults =
    status === 'ready' && meta !== null && meta.totalItems === 0 && !isDefault(filters);
  const showTable = status === 'ready' && tickets.length > 0;

  const pages = meta ? pageItems(meta.page, meta.totalPages) : [];

  return (
    <main className="tok-main">
      <div id="my-tickets-top" />
      <h1 className="tok-page-title">My Tickets</h1>
      <p className="mt-sub">
        Owned by <strong>{activeRequester?.name ?? '—'}</strong> · default sort:
        newest first
      </p>

      <section className="mt-card tok-card" aria-label="My Tickets list">
        <div className="toolbar">
          <div className="ctl search">
            <label className="tok-label" htmlFor="ticket-search">
              Search
            </label>
            <div className="searchwrap">
              <span className="mag" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
              </span>
              <input
                id="ticket-search"
                type="text"
                placeholder="Search by title or description…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              {searchDraft !== '' && (
                <button
                  type="button"
                  className="clear"
                  aria-label="Clear search"
                  onClick={() => setSearchDraft('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="ctl">
            <label className="tok-label" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              className="tok-select"
              value={filters.categoryId}
              onChange={(e) => updateFilter({ categoryId: e.target.value })}
            >
              <option value="">All Categories</option>
              <option value="1">Account and Access</option>
              <option value="2">Hardware</option>
              <option value="3">Software</option>
              <option value="4">Network</option>
            </select>
          </div>

          <div className="ctl">
            <label className="tok-label" htmlFor="filter-priority">
              Priority
            </label>
            <select
              id="filter-priority"
              className="tok-select"
              value={filters.priority}
              onChange={(e) => updateFilter({ priority: e.target.value })}
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div className="ctl">
            <label className="tok-label" htmlFor="filter-sort">
              Sort
            </label>
            <select
              id="filter-sort"
              className="tok-select"
              value={filters.sortIndex}
              onChange={(e) =>
                updateFilter({ sortIndex: Number(e.target.value) })
              }
            >
              {SORT_OPTIONS.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {nonDefault && (
            <button
              type="button"
              className="tok-btn secondary clear-filters"
              onClick={clearAllFilters}
            >
              Clear filters
            </button>
          )}
        </div>

        <div data-testid="my-tickets-region" aria-live="polite">
          {status === 'loading' && <SkeletonRows />}

          {status === 'error' && (
            <div className="errbar" role="alert">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 3 2 21h20z" />
                <line x1="12" y1="10" x2="12" y2="15" />
                <circle cx="12" cy="18" r="0.5" fill="currentColor" />
              </svg>
              <span>
                We couldn't load your tickets. Your filters are preserved.
              </span>
              <button
                type="button"
                className="btn-tertiary retry"
                onClick={() => void fetchList(filters, page)}
              >
                Try again
              </button>
            </div>
          )}

          {showTable && (
            <>
              <div className="tablewrap">
                <table>
                <thead>
                  <tr>
                    <th scope="col">Ticket #</th>
                    <th
                      scope="col"
                      aria-sort={ariaSortFor('title', filters.sortIndex) ?? undefined}
                    >
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleColumnSort('title')}
                      >
                        Title
                        {ariaSortFor('title', filters.sortIndex) !== null && (
                          <span className="sort-glyph" aria-hidden="true">
                            {ariaSortFor('title', filters.sortIndex) ===
                            'ascending'
                              ? '▲'
                              : '▼'}
                          </span>
                        )}
                      </button>
                    </th>
                    <th
                      scope="col"
                      className="col-cat"
                      aria-sort={undefined}
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      aria-sort={ariaSortFor('priority', filters.sortIndex) ?? undefined}
                    >
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleColumnSort('priority')}
                      >
                        Priority
                        {ariaSortFor('priority', filters.sortIndex) !== null && (
                          <span className="sort-glyph" aria-hidden="true">
                            {ariaSortFor('priority', filters.sortIndex) ===
                            'ascending'
                              ? '▲'
                              : '▼'}
                          </span>
                        )}
                      </button>
                    </th>
                    <th scope="col" aria-sort={undefined}>
                      Status
                    </th>
                    <th
                      scope="col"
                      aria-sort={ariaSortFor('createdAt', filters.sortIndex) ?? undefined}
                    >
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleColumnSort('createdAt')}
                      >
                        Created
                        {ariaSortFor('createdAt', filters.sortIndex) !==
                          null && (
                          <span className="sort-glyph" aria-hidden="true">
                            {ariaSortFor('createdAt', filters.sortIndex) ===
                            'ascending'
                              ? '▲'
                              : '▼'}
                          </span>
                        )}
                      </button>
                    </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <a
                            className="tnum"
                            href={`#/tickets/${ticket.ticketNumber}`}
                            onClick={(e) => {
                              e.preventDefault();
                              onNavigate(`#/tickets/${ticket.ticketNumber}`);
                            }}
                          >
                            {ticket.ticketNumber}
                          </a>
                        </td>
                        <td className="ttitle">
                          {ticket.title}
                          <span className="cat-chip cat-inline">
                            {ticket.category.name}
                          </span>
                        </td>
                        <td className="col-cat">
                          <span className="cat-chip">{ticket.category.name}</span>
                        </td>
                        <td>
                          <span className={priorityBadgeClass(ticket.priority)}>
                            {priorityLabel(ticket.priority)}
                          </span>
                        </td>
                        <td>
                          <span className="badge b-new">
                            <span className="dot" aria-hidden="true" />
                            New
                          </span>
                        </td>
                        <td className="created">
                          {formatDateTime(ticket.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile (<768px) representation of the same rows; visibility is
                  purely CSS so tests can assert either representation. */}
              <div className="mcards">
                {tickets.map((ticket) => (
                  <a
                    key={ticket.id}
                    className="mcard"
                    href={`#/tickets/${ticket.ticketNumber}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(`#/tickets/${ticket.ticketNumber}`);
                    }}
                  >
                    <span className="row1">
                      <span className="tnum">{ticket.ticketNumber}</span>
                      <span className="ttitle">{ticket.title}</span>
                    </span>
                    <span className="row2">
                      <span className={priorityBadgeClass(ticket.priority)}>
                        {priorityLabel(ticket.priority)}
                      </span>
                      <span className="badge b-new">
                        <span className="dot" aria-hidden="true" />
                        New
                      </span>
                      <span className="cat-chip">{ticket.category.name}</span>
                    </span>
                    <span className="created">
                      {formatDateTime(ticket.createdAt)}
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}

          {emptyTickets && (
            <div className="state-pad">
              <span className="glyph" aria-hidden="true">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z" />
                  <line
                    x1="13"
                    y1="7"
                    x2="13"
                    y2="17"
                    strokeDasharray="2 2"
                  />
                </svg>
              </span>
              <h3 className="state-title">No tickets yet</h3>
              <p className="state-text">
                When you submit a support request, it will appear here with its
                official ticket number.
              </p>
              <button
                type="button"
                className="tok-btn primary"
                onClick={() => onNavigate('#/new-ticket')}
              >
                Create your first ticket
              </button>
            </div>
          )}

          {noResults && (
            <div className="state-pad">
              <span className="glyph" aria-hidden="true">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </span>
              <h3 className="state-title">No results match your filters</h3>
              <p className="state-text">
                Try a different search term, or clear the filters to see all of
                your tickets.
              </p>
              <button
                type="button"
                className="tok-btn secondary"
                onClick={clearAllFilters}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {showTable && meta && (
          <div className="pager">
            <span className="range">{rangeText}</span>
            <span className="pages">
              <button
                type="button"
                className="pbtn prev"
                aria-label="Previous page"
                disabled={!meta.hasPrevPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹ Prev
              </button>
              {pages.map((item, i) =>
                item === '…' ? (
                  <span className="ellipsis" key={`ellipsis-${i}`}>
                    …
                  </span>
                ) : (
                  <button
                    type="button"
                    key={item}
                    className={`pbtn${item === meta.page ? ' current' : ''}`}
                    aria-current={item === meta.page ? 'page' : undefined}
                    aria-label={`Go to page ${item}`}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="pbtn next"
                aria-label="Next page"
                disabled={!meta.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>
            </span>
            <span className="page-simple">
              Page {meta.page} of {meta.totalPages}
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
