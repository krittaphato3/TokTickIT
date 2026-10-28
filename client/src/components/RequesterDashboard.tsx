import React, { useCallback, useEffect, useState } from 'react';
import { getRequesterDashboard, type RequesterDashboardData, ApiError } from '../api';
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
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const RequesterDashboard: React.FC = () => {
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
        <div className="tt-skeleton" role="status" aria-label="Loading dashboard" style={{ minHeight: '200px' }} />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="dash-page">
        <div className="dash-error-alert" role="alert">
          <span>{error ?? 'An unexpected error occurred.'}</span>
          <button type="button" className="tok-btn secondary" onClick={() => void loadData()}>
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

  return (
    <main className="dash-page">
      <div className="dash-header">
        <h1 className="dash-title">Dashboard</h1>
        <p className="dash-subtitle">Your tickets</p>

        <div className="dash-quick-actions">
          <a href="#/new" className="tok-btn primary">
            + New Ticket
          </a>
          <a href="#/my" className="tok-btn secondary">
            My Tickets
          </a>
        </div>
      </div>

      {isZeroState ? (
        <div className="tok-card" style={{ textAlign: 'center', padding: '40px 20px', margin: '20px 0' }}>
          <h2>No tickets yet</h2>
          <p className="tok-hint">You haven't submitted any IT support requests yet.</p>
          <a href="#/new" className="tok-btn primary" style={{ display: 'inline-block', marginTop: '12px' }}>
            Submit your first ticket
          </a>
        </div>
      ) : (
        <>
          {/* 4 Metric Cards */}
          <section className="dash-metric-grid" aria-label="Key ticket metrics">
            <a
              href="#/my?active=true"
              className="dash-metric-card accent-primary"
              aria-label={`Active tickets: ${data.activeCount}`}
            >
              <span className="dash-metric-label">Active Tickets</span>
              <span className="dash-metric-value">{data.activeCount}</span>
            </a>

            <a
              href="#/my?status=WAITING_FOR_REQUESTER"
              className="dash-metric-card accent-warning"
              aria-label={`Waiting for you: ${data.waitingForRequesterCount}`}
            >
              <span className="dash-metric-label">Waiting for You</span>
              <span className="dash-metric-value">{data.waitingForRequesterCount}</span>
            </a>

            <a
              href="#/my?status=RESOLVED"
              className="dash-metric-card accent-success"
              aria-label={`Resolved: ${data.resolvedCount}`}
            >
              <span className="dash-metric-label">Resolved</span>
              <span className="dash-metric-value">{data.resolvedCount}</span>
            </a>

            <a
              href="#/my?status=CLOSED"
              className="dash-metric-card"
              aria-label={`Closed: ${data.closedCount}`}
            >
              <span className="dash-metric-label">Closed</span>
              <span className="dash-metric-value">{data.closedCount}</span>
            </a>
          </section>

          {/* 2 List Cards */}
          <section className="dash-list-grid">
            <div className="dash-list-card">
              <h2 className="dash-list-card-title">Recently Updated</h2>
              {data.recentlyUpdated.length === 0 ? (
                <p className="dash-empty-note">No recently updated tickets.</p>
              ) : (
                <ul className="dash-items-list" aria-label="Recently updated tickets">
                  {data.recentlyUpdated.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#/tickets/${t.ticketNumber}`}
                        className="dash-item-link"
                        aria-label={`${t.ticketNumber}: ${t.summary}`}
                      >
                        <div className="dash-item-main">
                          <div className="dash-item-top">
                            <span className="dash-item-num">{t.ticketNumber}</span>
                            <span className="td-badge td-b-status">
                              {STATUS_TEXT[t.status] ?? t.status}
                            </span>
                          </div>
                          <span className="dash-item-summary">{t.summary}</span>
                          <span className="dash-item-meta">{fmtDate(t.updatedAt)}</span>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dash-list-card">
              <h2 className="dash-list-card-title">Recently Resolved</h2>
              {data.recentlyResolved.length === 0 ? (
                <p className="dash-empty-note">No resolved tickets yet.</p>
              ) : (
                <ul className="dash-items-list" aria-label="Recently resolved tickets">
                  {data.recentlyResolved.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#/tickets/${t.ticketNumber}`}
                        className="dash-item-link"
                        aria-label={`${t.ticketNumber}: ${t.summary}`}
                      >
                        <div className="dash-item-main">
                          <div className="dash-item-top">
                            <span className="dash-item-num">{t.ticketNumber}</span>
                            <span className="td-badge td-b-status">Resolved</span>
                          </div>
                          <span className="dash-item-summary">{t.summary}</span>
                          <span className="dash-item-meta">{fmtDate(t.updatedAt)}</span>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default RequesterDashboard;
