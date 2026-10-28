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
          <button type="button" className="tok-btn secondary" onClick={() => void loadData()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const userId = user?.id ?? 0;

  return (
    <main className="dash-page">
      <div className="dash-header">
        <h1 className="dash-title">Dashboard</h1>
        <p className="dash-subtitle">Service desk overview</p>

        <div className="dash-quick-actions">
          <a href="#/staff/queue" className="tok-btn primary">
            Ticket Queue
          </a>
          {data.userCounts && (
            <a href="#/admin/users" className="tok-btn secondary">
              User Management
            </a>
          )}
        </div>
      </div>

      {/* Operational Active Metrics */}
      <h2 className="dash-section-title">Active Workload</h2>
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
          href={`#/staff/queue?ownerId=${userId}&active=true`}
          className="dash-metric-card accent-primary"
          aria-label={`My active tickets: ${data.myActiveOwnedCount}`}
        >
          <span className="dash-metric-label">My Active Tickets</span>
          <span className="dash-metric-value">{data.myActiveOwnedCount}</span>
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
      </section>

      {/* Status Breakdown Grid */}
      <h2 className="dash-section-title">Status Breakdown</h2>
      <section className="dash-metric-grid" aria-label="Tickets by status">
        <a
          href="#/staff/queue?status=NEW"
          className="dash-metric-card accent-info"
          aria-label={`New: ${data.countsByStatus.NEW ?? 0}`}
        >
          <span className="dash-metric-label">New</span>
          <span className="dash-metric-value">{data.countsByStatus.NEW ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=OPEN"
          className="dash-metric-card accent-info"
          aria-label={`Open: ${data.countsByStatus.OPEN ?? 0}`}
        >
          <span className="dash-metric-label">Open</span>
          <span className="dash-metric-value">{data.countsByStatus.OPEN ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=IN_PROGRESS"
          className="dash-metric-card accent-primary"
          aria-label={`In Progress: ${data.countsByStatus.IN_PROGRESS ?? 0}`}
        >
          <span className="dash-metric-label">In Progress</span>
          <span className="dash-metric-value">{data.countsByStatus.IN_PROGRESS ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=WAITING_FOR_REQUESTER"
          className="dash-metric-card accent-warning"
          aria-label={`Waiting for Requester: ${data.countsByStatus.WAITING_FOR_REQUESTER ?? 0}`}
        >
          <span className="dash-metric-label">Waiting for Requester</span>
          <span className="dash-metric-value">{data.countsByStatus.WAITING_FOR_REQUESTER ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=REOPENED"
          className="dash-metric-card accent-warning"
          aria-label={`Reopened: ${data.countsByStatus.REOPENED ?? 0}`}
        >
          <span className="dash-metric-label">Reopened</span>
          <span className="dash-metric-value">{data.countsByStatus.REOPENED ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=RESOLVED"
          className="dash-metric-card accent-success"
          aria-label={`Resolved: ${data.countsByStatus.RESOLVED ?? 0}`}
        >
          <span className="dash-metric-label">Resolved</span>
          <span className="dash-metric-value">{data.countsByStatus.RESOLVED ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=CLOSED"
          className="dash-metric-card"
          aria-label={`Closed: ${data.countsByStatus.CLOSED ?? 0}`}
        >
          <span className="dash-metric-label">Closed</span>
          <span className="dash-metric-value">{data.countsByStatus.CLOSED ?? 0}</span>
        </a>

        <a
          href="#/staff/queue?status=CANCELLED"
          className="dash-metric-card"
          aria-label={`Cancelled: ${data.countsByStatus.CANCELLED ?? 0}`}
        >
          <span className="dash-metric-label">Cancelled</span>
          <span className="dash-metric-value">{data.countsByStatus.CANCELLED ?? 0}</span>
        </a>
      </section>

      {/* Admin User Counts (AC-17) */}
      {data.userCounts && (
        <>
          <h2 className="dash-section-title">User Directory</h2>
          <section className="dash-list-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="dash-list-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="dash-list-card-title" style={{ margin: 0, border: 0 }}>
                  Active Users Overview
                </h3>
                <a href="#/admin/users" className="tok-btn secondary small" aria-label="Manage Users">
                  Manage Users →
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
          </section>
        </>
      )}

      {/* Recent Activity: Recently Updated & My Recent Actions */}
      <section className="dash-list-grid">
        <div className="dash-list-card">
          <h2 className="dash-list-card-title">Recently Updated (Active)</h2>
          {data.recentlyUpdated.length === 0 ? (
            <p className="dash-empty-note">No active tickets.</p>
          ) : (
            <ul className="dash-items-list" aria-label="Recently updated tickets">
              {data.recentlyUpdated.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#/staff/tickets/${t.ticketNumber}`}
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
                      <span className="dash-item-meta">
                        <span>Owner: {t.owner ? t.owner.name : 'Unassigned'}</span>
                        <span>•</span>
                        <span>{fmtDate(t.updatedAt)}</span>
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-list-card">
          <h2 className="dash-list-card-title">My Recent Actions</h2>
          {data.myRecentActions.length === 0 ? (
            <p className="dash-empty-note">No actions recorded by you yet.</p>
          ) : (
            <ul className="dash-items-list" aria-label="My recent actions">
              {data.myRecentActions.map((a) => (
                <li key={a.id}>
                  <a
                    href={`#/staff/tickets/${a.ticketNumber}`}
                    className="dash-item-link"
                    aria-label={`Action on ${a.ticketNumber}`}
                  >
                    <div className="dash-item-main">
                      <div className="dash-item-top">
                        <span className="dash-item-num">{a.ticketNumber}</span>
                      </div>
                      <span className="dash-item-summary">{a.description}</span>
                      <span className="dash-item-meta">{fmtDate(a.actionAt)}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
};

export default StaffDashboard;
