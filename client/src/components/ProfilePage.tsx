import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AuthUser } from '../api';
import { roleHome, useAuth } from '../auth/AuthContext';

// Profile page (#/profile) — shared by ALL account types (Requester, IT Staff,
// Administrator). The page is an account reference hub for now: identity card +
// read-only account details + a Change password shortcut. Account management
// (profile editing, sessions, preferences) ships in a later increment.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: AuthUser['role']): string {
  if (role === 'IT_STAFF') return 'IT Staff';
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'Administrator';
  return 'Requester';
}

function roleBadgeStyle(role: AuthUser['role']): CSSProperties {
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') {
    return { background: 'var(--tok-primary)', color: '#fff' };
  }
  if (role === 'IT_STAFF') {
    return { background: 'var(--tok-info-soft, #E9F0FB)', color: 'var(--tok-info, #1D5FBF)' };
  }
  return { background: 'var(--tok-primary-soft)', color: 'var(--tok-primary)' };
}

export default function ProfilePage({
  onNavigate,
  onLogout,
}: {
  onNavigate: (hash: string) => void;
  onLogout: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null; // Shell only renders this page when authenticated.

  const home = roleHome(user.role);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="tok-main tok-profile-page">
      <nav className="tok-breadcrumb" aria-label="Breadcrumb">
        <a
          href={home}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(home);
          }}
        >
          <span aria-hidden="true">⌂</span> Home
        </a>
        <span className="sep" aria-hidden="true">›</span>
        <span className="current">Profile</span>
      </nav>

      <div className="tok-card tok-profile-card">
        {/* Identity card — the avatar is a reference visual only; initials are
            derived from the account name, no picture upload here yet. */}
        <div className="tok-profile-hero">
          <span className="tok-profile-avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <div className="tok-profile-id">
            <h1 className="tok-profile-name">{user.name}</h1>
            <p className="tok-profile-email">{user.email}</p>
            <span className="tok-profile-role" style={roleBadgeStyle(user.role)}>
              {roleLabel(user.role)}
            </span>
          </div>
        </div>
        <p className="tok-profile-note">
          This is your account reference. Password and account management arrive
          in a later update — the picture above is for reference only.
        </p>

        <hr className="tok-divider" />

        <h2 className="tok-section-label">
          Account details
          <span className="tok-section-note">read-only</span>
        </h2>
        <dl className="tok-profile-grid">
          <div className="tok-profile-row">
            <dt>Account ID</dt>
            <dd className="tok-profile-mono">#{user.id}</dd>
          </div>
          <div className="tok-profile-row">
            <dt>Account type</dt>
            <dd>{roleLabel(user.role)}</dd>
          </div>
          <div className="tok-profile-row">
            <dt>Status</dt>
            <dd>
              <span className={user.isActive ? 'tok-profile-status ok' : 'tok-profile-status bad'}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>
          <div className="tok-profile-row">
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>

        <hr className="tok-divider" />

        <h2 className="tok-section-label">Manage your account</h2>
        <div className="tok-profile-manage">
          <button
            type="button"
            className="tok-profile-action"
            onClick={() => onNavigate('#/change-password')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="tok-profile-action-text">
              <strong>Change password</strong>
              <span>Set a new password for your account.</span>
            </span>
          </button>
          <button type="button" className="tok-profile-action" disabled aria-disabled="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            <span className="tok-profile-action-text">
              <strong>Account settings</strong>
              <span>Manage your account details — coming in a later update.</span>
            </span>
          </button>
        </div>

        <div className="tok-profile-signout">
          <button
            type="button"
            className="tok-btn secondary"
            style={{ minHeight: 44 }}
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={handleSignOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </main>
  );
}
