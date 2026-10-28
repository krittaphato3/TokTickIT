import React, { useCallback, useEffect, useState } from 'react';
import { getRequesterDashboard, type RequesterDashboardData, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import '../styles/dashboard.css';

const STATUS_TEXT: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for You',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export const RequesterDashboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<RequesterDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRequesterDashboard();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.body.error ?? err.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <main className="dash-page" aria-busy="true">
        <div className="tt-skeleton" role="status" aria-label="Loading dashboard" style={{ minHeight: '160px' }} />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="dash-page">
        <div className="dash-error-alert" role="alert">
          <span>{error ?? 'An unexpected error occurred.'}</span>
          <button type="button" className="tok-btn secondary small" onClick={() => void loadData()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const isZeroState =
    data.activeCount === 0 &&
    data.waitingForRequesterCount === 0 &&
    data.resolvedCount === 0 &&
    data.closedCount === 0;

  const displayName = user?.name ? user.name.split(' ')[0] : 'Requester';

  // Display top 3 recent tickets and top 3 resolved tickets to fit the screen without scrolling
  const displayedRecent = data.recentlyUpdated.slice(0, 3);
  const displayedResolved = data.recentlyResolved.slice(0, 3);

  return (
    <main className="dash-page">
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title" aria-label="Dashboard">
            Welcome, {displayName}!
          </h1>
          <p className="dash-subtitle">
            Here's the latest on your requests. <span className="text-muted" style={{ fontSize: '0.825rem' }}>(Your tickets)</span>
          </p>
        </div>
        <button
          type="button"
          className="tok-btn secondary small dash-refresh-btn"
          onClick={() => void loadData()}
          aria-label="Refresh dashboard"
        >
          <span aria-hidden="true" style={{ marginRight: 4 }}>↻</span> Refresh
        </button>
      </div>

      {isZeroState ? (
        <div className="tok-card" style={{ textAlign: 'center', padding: '32px 20px', margin: '16px 0' }}>
          <h2>No tickets yet</h2>
          <p className="tok-hint">You haven't submitted any IT support requests yet.</p>
          <a href="#/new" className="tok-btn primary" style={{ display: 'inline-block', marginTop: '10px' }}>
            Submit your first ticket
          </a>
        </div>
      ) : (
        <>
          {/* Top 4 Metric Cards */}
          <section className="dash-metric-grid" aria-label="Key ticket metrics">
            <a
              href="#/my?active=true"
              className="dash-metric-card"
              aria-label={`Active tickets: ${data.activeCount}`}
            >
              <span className="dash-metric-label">Active Tickets</span>
              <span className="dash-metric-value">{data.activeCount}</span>
              <span className="dash-metric-view-all">View all →</span>
            </a>

            <a
              href="#/my?status=WAITING_FOR_REQUESTER"
              className="dash-metric-card"
              aria-label={`Waiting for you: ${data.waitingForRequesterCount}`}
            >
              <span className="dash-metric-label">Waiting for You</span>
              <span className="dash-metric-value">{data.waitingForRequesterCount}</span>
              <span className="dash-metric-view-all">View all →</span>
            </a>

            <a
              href="#/my?status=RESOLVED"
              className="dash-metric-card"
              aria-label={`Resolved: ${data.resolvedCount}`}
            >
              <span className="dash-metric-label">Resolved</span>
              <span className="dash-metric-value">{data.resolvedCount}</span>
              <span className="dash-metric-view-all">View all →</span>
            </a>

            <a
              href="#/my?status=CLOSED"
              className="dash-metric-card"
              aria-label={`Closed: ${data.closedCount}`}
            >
              <span className="dash-metric-label">Closed</span>
              <span className="dash-metric-value">{data.closedCount}</span>
              <span className="dash-metric-view-all">View all →</span>
            </a>
          </section>

          {/* Two-Column Layout balanced to avoid scrolling */}
          <div className="dash-two-col">
            {/* Left Column: Recent Tickets (Top 3) */}
            <div className="dash-main-col">
              <div className="dash-list-card">
                <div className="dash-list-card-header">
                  <h2 className="dash-list-card-title">My Recent Tickets</h2>
                  <a href="#/my" className="dash-view-all-link">View all</a>
                </div>

                {displayedRecent.length === 0 ? (
                  <p className="dash-empty-note">No recent tickets.</p>
                ) : (
                  <ul className="dash-items-list">
                    {displayedRecent.map((ticket) => (
                      <li key={ticket.id}>
                        <a href={`#/tickets/${ticket.ticketNumber}`} className="dash-item-link">
                          <div className="dash-item-info">
                            <span className="dash-item-num">{ticket.ticketNumber}</span>
                            <span className="dash-item-summary">{ticket.summary}</span>
                          </div>
                          <div className="dash-item-badge">
                            <span className={`tok-badge status-${ticket.status.toLowerCase()}`}>
                              {STATUS_TEXT[ticket.status] || ticket.status}
                            </span>
                          </div>
                          <div className="dash-item-date">{fmtDate(ticket.updatedAt)}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Quick Actions + Recently Resolved (Top 3) */}
            <div className="dash-side-col">
              <div className="dash-quick-actions-card">
                <h2 className="dash-quick-actions-title">Quick Actions</h2>
                <div className="dash-quick-actions-list">
                  <a href="#/new" className="dash-action-card" aria-label="+ New Ticket">
                    <div className="dash-action-icon green-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </div>
                    <div className="dash-action-text">
                      <div className="dash-action-main">+ New Ticket</div>
                      <div className="dash-action-sub">Submit a new request</div>
                    </div>
                  </a>

                  <a href="#/my" className="dash-action-card">
                    <div className="dash-action-icon green-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <div className="dash-action-text">
                      <div className="dash-action-main">View My Tickets</div>
                      <div className="dash-action-sub">Track existing requests</div>
                    </div>
                  </a>
                </div>
              </div>

              {/* Recently Resolved Card (Top 3) */}
              <div className="dash-list-card" style={{ marginTop: '14px' }}>
                <div className="dash-list-card-header">
                  <h2 className="dash-list-card-title">Recently Resolved</h2>
                  <a href="#/my?status=RESOLVED" className="dash-view-all-link">View all</a>
                </div>

                {displayedResolved.length === 0 ? (
                  <p className="dash-empty-note">No resolved tickets yet.</p>
                ) : (
                  <ul className="dash-items-list">
                    {displayedResolved.map((ticket) => (
                      <li key={ticket.id}>
                        <a href={`#/tickets/${ticket.ticketNumber}`} className="dash-item-link">
                          <div className="dash-item-info">
                            <span className="dash-item-num">{ticket.ticketNumber}</span>
                            <span className="dash-item-summary">{ticket.summary}</span>
                          </div>
                          <div className="dash-item-badge">
                            <span className="tok-badge status-resolved">Resolved</span>
                          </div>
                          <div className="dash-item-date">{fmtDate(ticket.updatedAt)}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
};

export default RequesterDashboard;
