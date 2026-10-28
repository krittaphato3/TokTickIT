import React, { useCallback, useEffect, useState } from 'react';
import { getStaffDashboard, type StaffDashboardData, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import '../styles/dashboard.css';

const STATUS_TEXT: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
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

export const StaffDashboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaffDashboard();
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
          <button
            type="button"
            className="tok-btn secondary"
            onClick={() => void loadData()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const userId = user?.id ?? 0;
  const displayName = user?.name ? user.name.split(' ')[0] : 'Staff';

  return (
    <main className="dash-page">
      {/* Header with greeting and refresh */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title" aria-label="Dashboard">
            Welcome back, {displayName}!
          </h1>
          <p className="dash-subtitle">
            Here's what's happening with your queue today. <span className="text-muted" style={{ fontSize: '0.875rem' }}>(Service desk overview)</span>
          </p>
        </div>
        <button
          type="button"
          className="tok-btn secondary small dash-refresh-btn"
          onClick={() => void loadData()}
          aria-label="Refresh dashboard"
        >
          <span aria-hidden="true" style={{ marginRight: 6 }}>↻</span> Refresh
        </button>
      </div>

      {/* Primary 5-Card Operational Row (Matches Handout 8.1) */}
      <section className="dash-metric-grid-5" aria-label="Queue status highlights">
        <a
          href="#/staff/queue?status=NEW"
          className="dash-metric-card"
          aria-label={`New: ${data.countsByStatus.NEW ?? 0}`}
        >
          <span className="dash-metric-label">New</span>
          <span className="dash-metric-value">{data.countsByStatus.NEW ?? 0}</span>
          <span className="dash-metric-view-all">View all →</span>
        </a>

        <a
          href="#/staff/queue?status=OPEN"
          className="dash-metric-card"
          aria-label={`Open: ${data.countsByStatus.OPEN ?? 0}`}
        >
          <span className="dash-metric-label">Open</span>
          <span className="dash-metric-value">{data.countsByStatus.OPEN ?? 0}</span>
          <span className="dash-metric-view-all">View all →</span>
        </a>

        <a
          href="#/staff/queue?status=IN_PROGRESS"
          className="dash-metric-card"
          aria-label={`In progress: ${data.countsByStatus.IN_PROGRESS ?? 0}`}
        >
          <span className="dash-metric-label">In Progress</span>
          <span className="dash-metric-value">{data.countsByStatus.IN_PROGRESS ?? 0}</span>
          <span className="dash-metric-view-all">View all →</span>
        </a>

        <a
          href="#/staff/queue?status=WAITING_FOR_REQUESTER"
          className="dash-metric-card"
          aria-label={`Waiting for requester: ${data.countsByStatus.WAITING_FOR_REQUESTER ?? 0}`}
        >
          <span className="dash-metric-label">Waiting for Requester</span>
          <span className="dash-metric-value">{data.countsByStatus.WAITING_FOR_REQUESTER ?? 0}</span>
          <span className="dash-metric-view-all">View all →</span>
        </a>

        <a
          href={`#/staff/queue?ownerId=${userId}&active=true`}
          className="dash-metric-card"
          aria-label={`My active tickets: ${data.myActiveOwnedCount}`}
        >
          <span className="dash-metric-label">My Assigned</span>
          <span className="dash-metric-value">{data.myActiveOwnedCount}</span>
          <span className="dash-metric-view-all">View queue →</span>
        </a>
      </section>

      {/* Secondary Operational & Priority Workload */}
      <h2 className="dash-section-title">Active Workload & Priorities</h2>
      <section className="dash-metric-grid" aria-label="Active workload">
        <a
          href="#/staff/queue?assigned=false&active=true"
          className="dash-metric-card accent-warning"
          aria-label={`Unassigned active: ${data.unassignedActiveCount}`}
        >
          <span className="dash-metric-label">Unassigned Active</span>
          <span className="dash-metric-value">{data.unassignedActiveCount}</span>
        </a>

        <a
          href="#/staff/queue?itPriority=CRITICAL&active=true"
          className="dash-metric-card accent-danger"
          aria-label={`Critical: ${data.countsByItPriority.CRITICAL ?? 0}`}
        >
          <span className="dash-metric-label">Critical (Active)</span>
          <span className="dash-metric-value">{data.countsByItPriority.CRITICAL ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?itPriority=HIGH&active=true"
          className="dash-metric-card accent-warning"
          aria-label={`High: ${data.countsByItPriority.HIGH ?? 0}`}
        >
          <span className="dash-metric-label">High (Active)</span>
          <span className="dash-metric-value">{data.countsByItPriority.HIGH ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?itPriority=MEDIUM&active=true"
          className="dash-metric-card"
          aria-label={`Medium: ${data.countsByItPriority.MEDIUM ?? 0}`}
        >
          <span className="dash-metric-label">Medium (Active)</span>
          <span className="dash-metric-value">{data.countsByItPriority.MEDIUM ?? 0}</span>
        </a>
      </section>

      {/* Two-Column Layout (Matches Handout 8.1) */}
      <div className="dash-two-col">
        {/* Left Column: Recent Tickets and Actions */}
        <div className="dash-main-col">
          <div className="dash-list-card">
            <div className="dash-list-card-header">
              <h2 className="dash-list-card-title">My Recent Tickets</h2>
              <a href="#/staff/queue" className="dash-view-all-link">View all</a>
            </div>

            {data.recentlyUpdated.length === 0 ? (
              <p className="dash-empty-note">No recently updated active tickets.</p>
            ) : (
              <ul className="dash-items-list">
                {data.recentlyUpdated.map((ticket) => (
                  <li key={ticket.id}>
                    <a href={`#/tickets/${ticket.ticketNumber}`} className="dash-item-link">
                      <div className="dash-item-info">
                        <span className="dash-item-num">{ticket.ticketNumber}</span>
                        <span className="dash-item-summary">{ticket.summary}</span>
                        {ticket.owner && (
                          <span className="dash-item-owner">Owner: {ticket.owner.name}</span>
                        )}
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

          {/* My Recent Actions */}
          <div className="dash-list-card" style={{ marginTop: '20px' }}>
            <div className="dash-list-card-header">
              <h2 className="dash-list-card-title">My Recent Actions</h2>
            </div>

            {data.myRecentActions.length === 0 ? (
              <p className="dash-empty-note">You haven't recorded any actions yet.</p>
            ) : (
              <ul className="dash-items-list">
                {data.myRecentActions.map((action) => (
                  <li key={action.id}>
                    <a href={`#/tickets/${action.ticketNumber}`} className="dash-item-link">
                      <div className="dash-item-info">
                        <span className="dash-item-num">{action.ticketNumber}</span>
                        <span className="dash-item-summary">{action.description}</span>
                      </div>
                      <div className="dash-item-date">{fmtDate(action.actionAt)}</div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Quick Actions & Admin Directory */}
        <div className="dash-side-col">
          <div className="dash-quick-actions-card">
            <h2 className="dash-quick-actions-title">Quick Actions</h2>
            <div className="dash-quick-actions-grid-3">
              <a href="#/new" className="dash-action-box" aria-label="Create Ticket">
                <div className="dash-action-icon-circle green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
                <span className="dash-action-box-label">Create Ticket</span>
              </a>

              <a href="#/staff/queue" className="dash-action-box" aria-label="Search Tickets">
                <div className="dash-action-icon-circle blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <span className="dash-action-box-label">Search Tickets</span>
              </a>

              <a href={`#/staff/queue?ownerId=${userId}&active=true`} className="dash-action-box" aria-label="My Queue">
                <div className="dash-action-icon-circle teal">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                </div>
                <span className="dash-action-box-label">My Queue</span>
              </a>
            </div>
          </div>

          {/* Admin User Counts (AC-17) */}
          {data.userCounts && (
            <div className="dash-list-card" style={{ marginTop: '20px' }}>
              <div className="dash-list-card-header">
                <h3 className="dash-list-card-title" style={{ margin: 0, border: 0 }}>
                  User Directory
                </h3>
                <a href="#/admin/users" className="tok-btn secondary small" aria-label="Manage Users">
                  Manage →
                </a>
              </div>
              <div className="dash-user-counts">
                <span className="dash-user-badge">
                  <strong>Active:</strong> {data.userCounts.active}
                </span>
                <span className="dash-user-badge">
                  <strong>Inactive:</strong> {data.userCounts.inactive}
                </span>
                <span className="dash-user-badge">
                  <strong>Requesters:</strong> {data.userCounts.requester}
                </span>
                <span className="dash-user-badge">
                  <strong>IT Staff:</strong> {data.userCounts.itStaff}
                </span>
                <span className="dash-user-badge">
                  <strong>Admins:</strong> {data.userCounts.administrator}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default StaffDashboard;
