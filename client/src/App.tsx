import { useEffect, useRef, useState } from 'react';
import { AuthProvider, roleHome, useAuth } from './auth/AuthContext';
import type { AuthUser } from './auth/AuthContext';
import ChangePasswordPage from './components/ChangePasswordPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import CreateTicketPage from './components/CreateTicketPage';
import LoginPage from './components/LoginPage';
import ProfilePage from './components/ProfilePage';
import MyTicketsPage from './components/MyTicketsPage';
import TicketDetailPage from './components/TicketDetailPage';
import StaffTicketQueue from './components/StaffTicketQueue';
import StaffTicketDetail from './components/StaffTicketDetail';
import HomeScreen from './components/HomeScreen';

// UI states: idle, loading, success, error.

// Hash-based routing: #/login, #/change-password, #/my, #/new,
// #/tickets/:number, #/staff/queue, #/admin/users. Legacy Lab 2 hashes
// (#/tickets, #/new-ticket, #/select-requester) redirect to canonical routes.
export type Route =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'forgot-password' }
  | { name: 'change-password'; first: boolean }
  | { name: 'profile' }
  | { name: 'my' }
  | { name: 'new' }
  | { name: 'tickets-legacy' }
  | { name: 'new-ticket-legacy' }
  | { name: 'select-requester-legacy' }
  | { name: 'ticket-detail'; ticketNumber: string }
  | { name: 'staff-ticket-detail'; ticketNumber: string }
  | { name: 'staff-queue' }
  | { name: 'admin-users' }
  | { name: 'not-found' };

function parseRoute(hash: string): Route {
  const [pathPart, queryPart] = hash.replace(/^#/, '').split('?');
  const path = pathPart;
  if (path === '/login' || path === '/login/') return { name: 'login' };
  if (path === '/forgot-password' || path === '/forgot-password/') {
    return { name: 'forgot-password' };
  }
  if (path === '/change-password' || path === '/change-password/') {
    const first = new URLSearchParams(queryPart ?? '').get('first') === '1';
    return { name: 'change-password', first };
  }
  if (path === '/profile' || path === '/profile/') return { name: 'profile' };
  if (path === '/my' || path === '/my/') return { name: 'my' };
  if (path === '/new' || path === '/new/') return { name: 'new' };
  if (path === '/tickets' || path === '/tickets/') return { name: 'tickets-legacy' };
  if (path === '/new-ticket' || path === '/new-ticket/') return { name: 'new-ticket-legacy' };
  if (path === '/select-requester' || path === '/select-requester/') {
    return { name: 'select-requester-legacy' };
  }
  if (path === '/staff/queue' || path === '/staff/queue/') return { name: 'staff-queue' };
  const staffDetail = path.match(/^\/staff\/tickets\/(TTK-\d{4}-\d{6})$/);
  if (staffDetail) return { name: 'staff-ticket-detail', ticketNumber: staffDetail[1] };
  if (path === '/admin/users' || path === '/admin/users/') return { name: 'admin-users' };
  const detail = path.match(/^\/tickets\/(TTK-\d{4}-\d{6})$/);
  if (detail) return { name: 'ticket-detail', ticketNumber: detail[1] };
  if (path === '' || path === '/') return { name: 'home' };
  return { name: 'not-found' };
}

function NavLink({ href, active, label, onNavigate }: { href: string; active: boolean; label: string; onNavigate: (h: string) => void }) {
  return (
    <a
      href={href}
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(href);
      }}
    >
      {label}
    </a>
  );
}

function headerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function headerRoleBadge(role: string): string {
  if (role === 'IT_STAFF') return 'IT STAFF';
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'ADMIN';
  return 'REQUESTER';
}

function AppHeader({
  user,
  minimal,
  activeRoute,
  onNavigate,
  onLogout,
}: {
  user: AuthUser;
  minimal: boolean;
  activeRoute: string;
  onNavigate: (hash: string) => void;
  onLogout?: () => Promise<void>;
}) {
  const home = roleHome(user.role);
  const isRequesterLike = user.role === 'REQUESTER';
  const isStaff = user.role === 'IT_STAFF';
  const isAdmin = user.role === 'ADMIN' || user.role === 'ADMINISTRATOR';
  // The dropdown is available in all authenticated modes including the
  // forced-change flow: minimal mode hides primary nav + the Profile menu
  // item (other routes are blocked by the gate), but Sign out stays
  // functional since POST /api/auth/logout is allowlisted during the gate.
  const showMenu = typeof onLogout === 'function';
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open ]);

  function focusMenuItem(index: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[data-menuitem]:not(:disabled)') ?? [],
    );
    if (items.length === 0) return;
    const next = items[((index % items.length) + items.length) % items.length];
    next?.focus();
  }

  function focusFirstMenuItem() {
    focusMenuItem(0);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[data-menuitem]:not(:disabled)') ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusMenuItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusMenuItem(current <= 0 ? items.length - 1 : current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusMenuItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusMenuItem(items.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  function goProfile() {
    setOpen(false);
    onNavigate('#/profile');
  }

  async function doSignOut() {
    if (signingOut || typeof onLogout !== 'function') return;
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      // Shell unmounts the header on logout; guard state writes in case the
      // component is still mounted (e.g. a failed request that kept session).
      setSigningOut(false);
      setOpen(false);
    }
  }

  const initials = headerInitials(user.name);
  const roleBadge = headerRoleBadge(user.role);

  return (
    <header className="tok-navbar">
      <div className="container-fluid px-3 px-md-4 d-flex align-items-center flex-nowrap" style={{ minHeight: 56, paddingTop: '.625rem', paddingBottom: '.625rem', gap: '1.25rem' }}>
        <div className="d-flex align-items-center gap-3 flex-nowrap">
          <a
            className="tok-brand"
            href={home}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(home);
            }}
          >
            <span className="tok-brand-badge" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
                <path d="M13 5v2" />
                <path d="M13 17v2" />
                <path d="M13 11v2" />
              </svg>
            </span>
            TokTickIT
          </a>
          {minimal ? null : (
            <nav className="tok-nav" aria-label="Primary">
              {(isRequesterLike || isStaff || isAdmin) && (isRequesterLike || (!isStaff && !isAdmin)) ? (
                <>
                  <NavLink href="#/my" active={activeRoute === 'my'} label="My Tickets" onNavigate={onNavigate} />
                  <NavLink href="#/new" active={activeRoute === 'new'} label="New Ticket" onNavigate={onNavigate} />
                </>
              ) : null}
              {isStaff ? (
                <NavLink href="#/staff/queue" active={activeRoute === 'staff-queue'} label="Ticket Queue" onNavigate={onNavigate} />
              ) : null}
              {isAdmin ? (
                <NavLink href="#/admin/users" active={activeRoute === 'admin-users'} label="User Management" onNavigate={onNavigate} />
              ) : null}
            </nav>
          )}
        </div>
        {/* Right cluster — account menu for ALL account types. Matches
            docs/mockups/Profile-Mockup.html: avatar pill + menu card with
            "View profile" (#/profile), disabled "Account settings" (Coming
            soon), and danger "Sign out" (onLogout). Minimal mode keeps the
            header + Sign out only. */}
        <div className="ms-auto d-flex align-items-center flex-shrink-0">
          {showMenu ? (
            <div className="tok-profile" ref={wrapRef}>
              <button
                ref={toggleRef}
                type="button"
                className="tok-profile-btn"
                title="Account"
                aria-label={`Profile menu — ${user.name}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls="tok-profile-menu"
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && !open) {
                    e.preventDefault();
                    setOpen(true);
                    requestAnimationFrame(() => focusFirstMenuItem());
                  }
                }}
              >
                <span className="tok-avatar tok-avatar--sm" aria-hidden="true">{initials}</span>
                <span className="tok-profile-trigger-name">{user.name}</span>
                <span className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Profile</span>
                <svg className="tok-profile-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {open ? (
                <div
                  ref={menuRef}
                  id="tok-profile-menu"
                  role="menu"
                  aria-label="Account"
                  className="tok-profile-menu"
                  onKeyDown={onMenuKeyDown}
                >
                  <div className="tok-menu-header">
                    <span className="tok-avatar tok-avatar--lg" aria-hidden="true">{initials}</span>
                    <div className="tok-menu-identity">
                      <p className="tok-menu-label">Signed in as</p>
                      <p className="tok-menu-name">{user.name}</p>
                      <p className="tok-menu-email" title={user.email}>{user.email}</p>
                    </div>
                    <span className="tok-menu-badge">{roleBadge}</span>
                  </div>
                  {minimal ? null : (
                    <>
                      <div className="tok-menu-group" role="none">
                        <button
                          type="button"
                          role="menuitem"
                          data-menuitem
                          className="tok-menu-item"
                          onClick={goProfile}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          <span>View profile</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          data-menuitem
                          className="tok-menu-item"
                          disabled
                          aria-disabled="true"
                          title="Coming soon"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                          <span>Account settings</span>
                        </button>
                      </div>
                      <div className="tok-menu-sep" role="none" />
                    </>
                  )}
                  <div className="tok-menu-group" role="none">
                    <button
                      type="button"
                      role="menuitem"
                      data-menuitem
                      className="tok-menu-item tok-menu-item--danger"
                      disabled={signingOut}
                      aria-busy={signingOut || undefined}
                      onClick={doSignOut}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                      <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                    </button>
                  </div>
                  <div className="tok-menu-footer">
                    <span aria-hidden="true"> </span>
                    <span>© 2025 TokTickit</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <span className="tok-profile-btn" aria-disabled="true" title="Profile">
              <span className="tok-avatar tok-avatar--sm" aria-hidden="true">{initials}</span>
              <span className="tok-profile-trigger-name">{user.name}</span>
              <svg className="tok-profile-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function UnauthHeader() {
  return (
    <header className="tok-navbar">
      <div className="container-fluid px-3 px-md-4 d-flex align-items-center" style={{ minHeight: 56, paddingTop: '.625rem', paddingBottom: '.625rem' }}>
        <span className="tok-brand" aria-label="TokTickIT">
          <span className="tok-brand-badge" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
              <path d="M13 5v2" />
              <path d="M13 17v2" />
              <path d="M13 11v2" />
            </svg>
          </span>
          TokTickIT
        </span>
      </div>
    </header>
  );
}

function Forbidden({ home, message }: { home: string; message: string }) {
  return (
    <main className="tok-main">
      <div className="tok-card" style={{ textAlign: 'center', maxWidth: 560, margin: '2rem auto' }}>
        <div aria-hidden="true" style={{ fontSize: '2rem' }}>🔒</div>
        <h1 className="h4 mt-2">Access restricted</h1>
        <p className="tok-hint">{message}</p>
        <a
          className="tok-btn secondary"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
          href={home}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = home.replace(/^#/, '');
          }}
        >
          Back to home
        </a>
      </div>
    </main>
  );
}

function NotFound({ home }: { home: string }) {
  return (
    <main className="tok-main">
      <div className="tok-card" style={{ textAlign: 'center', maxWidth: 560, margin: '2rem auto' }}>
        <h1 className="h4">Page not found</h1>
        <p className="tok-hint">The page you requested does not exist.</p>
        <a
          className="tok-btn secondary"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
          href={home}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = home.replace(/^#/, '');
          }}
        >
          Back to home
        </a>
      </div>
    </main>
  );
}

function AdminPlaceholder() {
  return (
    <main className="tok-main">
      <div className="tok-card" style={{ maxWidth: 640, margin: '2rem auto' }}>
        <h1 className="h4">User Management</h1>
        <p className="tok-hint">User management ships in the next issue. Your session is authenticated as Administrator.</p>
        <a href="#/change-password" onClick={(e) => { e.preventDefault(); window.location.hash = '/change-password'; }}>Change password</a>
      </div>
    </main>
  );
}

function SignOutToast({ onClose }: { onClose: () => void }) {
  return (
    <div className="tok-toast-stack">
      <div className="tok-toast tok-toast-success" role="status" aria-live="polite">
        <span className="tok-toast-icon" aria-hidden="true">
          ✓
        </span>
        <span className="tok-toast-text">You have been signed out.</span>
        <button
          type="button"
          className="tok-toast-close"
          aria-label="Dismiss notification"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, loading, logout } = useAuth();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [loggingOut, setLoggingOut] = useState(false);
  const [signedOutToast, setSignedOutToast] = useState(false);

  function navigate(hash: string) {
    setSignedOutToast(false);
    setRoute(parseRoute(hash));
    if (window.location.hash === hash) {
      setRoute(parseRoute(hash));
    } else {
      window.location.hash = hash;
    }
  }

  useEffect(() => {
    const onHashChange = () => {
      const next = parseRoute(window.location.hash);
      // Preserve the signed-out toast across the logout redirect to #/login
      // (the hash assignment in handleLogout would otherwise wipe it via this
      // listener); any other navigation clears it.
      setSignedOutToast((prev) => (prev && next.name === 'login' ? prev : false));
      setRoute(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Auto-dismiss the toast after ~4s so no stale notification lingers.
  useEffect(() => {
    if (!signedOutToast) return;
    const t = window.setTimeout(() => setSignedOutToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [signedOutToast]);

  // Legacy Lab 2 hash redirects (ui-spec §2.3).
  useEffect(() => {
    if (route.name === 'tickets-legacy') {
      window.location.hash = '/my';
    } else if (route.name === 'new-ticket-legacy') {
      window.location.hash = '/new';
    } else if (route.name === 'select-requester-legacy') {
      window.location.hash = user ? roleHome(user.role).replace(/^#/, '') : '/login';
    } else if (route.name === 'home') {
      window.location.hash = user ? roleHome(user.role).replace(/^#/, '') : '/login';
    }
  }, [route.name, user]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Even if the API call fails, session state is cleared client-side.
    } finally {
      setLoggingOut(false);
      setSignedOutToast(true);
      window.location.hash = '/login';
      setRoute({ name: 'login' });
    }
  }

  function handleCreated(ticketNumber: string) {
    navigate(`#/tickets/${ticketNumber}`);
  }

  if (loading) {
    return (
      <div className="tt-app">
        <UnauthHeader />
        <main className="tok-main" aria-busy="true" aria-live="polite">
          <div className="tt-skeleton" />
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  // Unauthenticated: every route except login redirects to login with ?next=.
  if (!user) {
    if (route.name !== 'login' && route.name !== 'forgot-password') {
      const current = window.location.hash.replace(/^#/, '');
      const isPublicish = current === '' || current === '/' || current.startsWith('/login') || current.startsWith('/forgot-password');
      if (!isPublicish && !window.location.hash.includes('next=')) {
        const target = `#/login?next=${encodeURIComponent(`#${current}`)}`;
        window.location.hash = target.replace(/^#/, '');
        return (
          <div className="tt-app">
            <UnauthHeader />
            <main className="tok-main" aria-busy="true" aria-live="polite"><p>Loading…</p></main>
          </div>
        );
      }
    }
    return (
      <div className="tt-app">
        <UnauthHeader />
        {route.name === 'forgot-password' ? (
          <ForgotPasswordPage />
        ) : (
          <LoginPage notice={null} />
        )}
        {signedOutToast && route.name !== 'forgot-password' ? (
          <SignOutToast onClose={() => setSignedOutToast(false)} />
        ) : null}
        <footer className="tok-app-footer">
          <span>TokTickIT — Real Auth + Staff/Admin</span>
          <span>Zen Green Theme · Lab 3</span>
        </footer>
      </div>
    );
  }

  // Authenticated but login route visited directly → role home (unless gated).
  if (route.name === 'login') {
    const home = user.mustChangePassword ? '#/change-password?first=1' : roleHome(user.role);
    window.location.hash = home.replace(/^#/, '');
    return (
      <div className="tt-app">
        <UnauthHeader />
        <main className="tok-main" aria-live="polite"><p>Loading…</p></main>
      </div>
    );
  }

  // mustChangePassword gate: only change-password + logout allowed (ui-spec §4.1).
  if (user.mustChangePassword && route.name !== 'change-password') {
    if (!window.location.hash.startsWith('#/change-password')) {
      window.location.hash = '/change-password?first=1';
    }
    return (
      <div className="tt-app">
        <AppHeader user={user} minimal activeRoute="change-password" onNavigate={navigate} onLogout={handleLogout} />
        <ChangePasswordPage first />
        <footer className="tok-app-footer">
          <span>TokTickIT — Real Auth + Staff/Admin</span>
          <span>Zen Green Theme · Lab 3</span>
        </footer>
      </div>
    );
  }

  const home = roleHome(user.role);
  const isStaff = user.role === 'IT_STAFF';
  const isAdmin = user.role === 'ADMIN' || user.role === 'ADMINISTRATOR';

  let body: React.ReactNode = null;
  let activeNav = '';
  if (route.name === 'change-password') {
    activeNav = 'change-password';
    body = <ChangePasswordPage first={route.first} />;
  } else if (route.name === 'profile') {
    activeNav = 'profile';
    body = <ProfilePage onNavigate={navigate} onLogout={handleLogout} />;
  } else if (route.name === 'my') {
    activeNav = 'my';
    body = <MyTicketsPage key={user.id} onNavigate={navigate} />;
  } else if (route.name === 'new') {
    activeNav = 'new';
    body = <CreateTicketPage onCreated={handleCreated} />;
  } else if (route.name === 'ticket-detail') {
    activeNav = 'my';
    body = <TicketDetailPage ticketNumber={route.ticketNumber} onBack={() => navigate('#/my')} />;
  } else if (route.name === 'staff-queue') {
    activeNav = 'staff-queue';
    // Server-side enforcement (BR-20): GET /api/staff/tickets rejects
    // requesters with 403 regardless of this client-side guard; the screen's
    // failure state surfaces that 403 if a requester session ever lands here.
    body = isStaff || isAdmin ? <StaffTicketQueue onNavigate={navigate} /> : <Forbidden home={home} message="You do not have access to the staff queue." />;
  } else if (route.name === 'staff-ticket-detail') {
    activeNav = 'staff-queue';
    // Server-side enforcement (BR-20): GET /api/staff/tickets/:number refuses
    // requesters with 403 regardless of this client-side guard; the screen's
    // forbidden state surfaces that 403 if a requester session lands here.
    body = isStaff || isAdmin ? (
      <StaffTicketDetail ticketNumber={route.ticketNumber} onBack={() => navigate('#/staff/queue')} />
    ) : (
      <Forbidden home={home} message="You do not have access to staff ticket operations." />
    );
  } else if (route.name === 'admin-users') {
    activeNav = 'admin-users';
    body = isAdmin ? <AdminPlaceholder /> : <Forbidden home={home} message="User management is restricted to administrators." />;
  } else if (route.name === 'not-found') {
    body = <NotFound home={home} />;
  } else {
    body = <HomeScreen />;
  }

  return (
    <div className="tt-app">
      <a href="#main-content" className="visually-hidden-focusable">Skip to content</a>
      {/* Forced-change users always get the minimal header (no nav, Profile
          menu item hidden) so the change-password flow cannot be bypassed —
          Sign out stays available via the account menu. */}
      <AppHeader user={user} minimal={user.mustChangePassword} activeRoute={activeNav} onNavigate={navigate} onLogout={handleLogout} />
      <div id="main-content">{body}</div>
      <footer className="tok-app-footer">
        <span>TokTickIT — Real Auth + Staff/Admin</span>
        <span>Zen Green Theme · Lab 3</span>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

export default App;
