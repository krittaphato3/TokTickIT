import { useState } from 'react';
import { useDevRequester } from '../devRequesterContext';

// Development Requester selection / Profile page (mockup AccountSelection_Demo).
// Replaces the old in-header <select>: the user picks a requester here and
// Continue applies it to the whole app (X-Dev-Requester-Id on restricted API
// calls). It is the landing guard when no requester is active.
export default function RequesterSelection({ onComplete }: { onComplete: () => void }) {
  const { requesters, status, activeRequester, selectRequester, retry } =
    useDevRequester();
  const [selectedId, setSelectedId] = useState<string>(
    activeRequester ? String(activeRequester.id) : '',
  );

  const canContinue = selectedId !== '';

  function handleContinue() {
    if (!canContinue) return;
    selectRequester(Number(selectedId));
    onComplete();
  }

  return (
    <main className="tok-selection-page">
      <div className="tok-selection-shell">
        <nav className="tok-breadcrumb" aria-label="Breadcrumb">
          <span className="current">Development Requester Selection</span>
        </nav>

        <section className="tok-card tok-selection-card">
          <div className="tok-selection-icon" aria-hidden="true">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B7A46"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="7.5" r="3.5" />
              <path d="M3.5 20c0-3.6 2.9-6.5 6.5-6.5 1.4 0 2.7.4 3.8 1.2" />
            </svg>
          </div>

          <h1 className="tok-selection-title">Select Development Requester</h1>
          <p className="tok-selection-subtitle">
            Choose a development requester to simulate the current requester context for
            Lab 2.
            <br />
            This is for testing only and is not a login screen.
          </p>

          <hr className="tok-selection-divider" />

        {status === 'loading' && (
          <div role="status" className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span className="tok-spinner" aria-hidden="true" />
            Loading development requesters…
          </div>
        )}

        {status === 'error' && (
          <div className="tok-alert error" role="alert" style={{ display: 'flex' }}>
            <span aria-hidden="true">!</span>
            <span>
              Could not load development requesters.{' '}
              <button type="button" className="tok-browse" onClick={retry}>
                Try again
              </button>
            </span>
          </div>
        )}

        {status === 'ready' && requesters.length === 0 && (
          <p className="text-muted" role="status">
            No active development requesters found. Seed the database.
          </p>
        )}

        {status === 'ready' && requesters.length > 0 && (
          <>
            <label className="tok-label" htmlFor="selection-select">
              Development Requester <span className="tok-req" style={{ color: 'var(--tok-error)' }} aria-hidden="true">*</span>
            </label>
            <select
              id="selection-select"
              className="tok-select"
              aria-required="true"
              aria-label="Development Requester"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="" disabled>
                — Select a requester —
              </option>
              {requesters.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name} ({r.email})
                </option>
              ))}
            </select>

            <div className="tok-selection-callout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <span>Only active development requesters are shown.</span>
            </div>

            <div className="tok-selection-note">
              <span>
                <strong>Authentication coming in Lab 3</strong>
                <br />
                In Lab 3, this selection will be replaced with secure authentication so you can
                access the system with your own account.
              </span>
            </div>

            <div className="tok-selection-footer">
              <button type="button" className="tok-btn secondary" onClick={onComplete}>
                Cancel
              </button>
              <button type="button" className="tok-btn primary" onClick={handleContinue} disabled={!canContinue}>
                → Continue
              </button>
            </div>
          </>
        )}
        </section>
      </div>
    </main>
  );
}