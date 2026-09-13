import { useEffect, useState } from 'react';
import type { Category } from './api';
import { checkSystem } from './api';
import { AuthProvider, roleHome, useAuth } from './auth/AuthContext';
import type { AuthUser } from './auth/AuthContext';
import { DevRequesterProvider } from './DevRequesterProvider';
import ChangePasswordPage from './components/ChangePasswordPage';
import CreateTicketPage from './components/CreateTicketPage';
import LoginPage from './components/LoginPage';
import MyTicketsPage from './components/MyTicketsPage';
import TicketDetailPage from './components/TicketDetailPage';

// UI states: idle, loading, success, error.
type UiState = 'idle' | 'loading' | 'success' | 'error';

// Hash-based routing: #/login, #/change-password, #/my, #/new,
// #/tickets/:number, #/staff/queue, #/admin/users. Legacy Lab 2 hashes
// (#/tickets, #/new-ticket, #/select-requester) redirect to canonical routes.
export type Route =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'change-password'; first: boolean }
  | { name: 'my' }
  | { name: 'new' }
  | { name: 'tickets-legacy' }
  | { name: 'new-ticket-legacy' }
  | { name: 'select-requester-legacy' }
  | { name: 'ticket-detail'; ticketNumber: string }
  | { name: 'staff-queue' }
  | { name: 'admin-users' }
  | { name: 'not-found' };

function parseRoute(hash: string): Route {
  const [pathPart, queryPart] = hash.replace(/^#/, '').split('?');
  const path = pathPart;
  if (path === '/login' || path === '/login/') return { name: 'login' };
  if (path === '/change-password' || path === '/change-password/') {
    const first = new URLSearchParams(queryPart ?? '').get('first') === '1';
    return { name: 'change-password', first };
  }
  if (path === '/my' || path === '/my/') return { name: 'my' };
  if (path === '/new' || path === '/new/') return { name: 'new' };
  if (path === '/tickets' || path === '/tickets/') return { name: 'tickets-legacy' };
  if (path === '/new-ticket' || path === '/new-ticket/') return { name: 'new-ticket-legacy' };
  if (path === '/select-requester' || path === '/select-requester/') {
    return { name: 'select-requester-legacy' };
  }
  if (path === '/staff/queue' || path === '/staff/queue/') return { name: 'staff-queue' };
  if (path === '/admin/users' || path === '/admin/users/') return { name: 'admin-users' };
  const detail = path.match(/^\/tickets\/(TTK-\d{4}-\d{6})$/);
  if (detail) return { name: 'ticket-detail', ticketNumber: detail[1] };
  if (path === '' || path === '/') return { name: 'home' };
  return { name: 'not-found' };
}

function roleBadgeStyle(role: AuthUser['role']): React.CSSProperties {
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') {
    return { background: 'var(--tok-primary)', color: '#fff' };
  }
  if (role === 'IT_STAFF') {
    return { background: 'var(--tok-info-soft, #E9F0FB)', color: 'var(--tok-info, #1D5FBF)' };
  }
  return { background: 'var(--tok-primary-soft)', color: 'var(--tok-primary)' };
}

function roleLabel(role: AuthUser['role']): string {
  if (role === 'IT_STAFF') return 'IT Staff';
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'Administrator';
  return 'Requester';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

function AppHeader({
  user,
  minimal,
  activeRoute,
  onNavigate,
  onLogout,
  loggingOut,
}: {
  user: AuthUser;
  minimal: boolean;
  activeRoute: string;
  onNavigate: (hash: string) => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const home = roleHome(user.role);
  const isRequesterLike = user.role === 'REQUESTER';
  const isStaff = user.role === 'IT_STAFF';
  const isAdmin = user.role === 'ADMIN' || user.role === 'ADMINISTRATOR';
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
        <div className="ms-auto d-flex align-items-center flex-shrink-0" style={{ gap: '0.75rem' }}>
          <span
            aria-hidden="true"
            title={user.name}
            style={{
              width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: 'var(--tok-primary-soft)', color: 'var(--tok-primary)',
              fontWeight: 700, fontSize: '0.8125rem', flexShrink: 0,
            }}
          >
            {initials(user.name)}
          </span>
          <span
            style={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={user.name}
          >
            {user.name}
          </span>
          <span
            style={{
              ...roleBadgeStyle(user.role),
              borderRadius: 999, padding: '0.125rem 0.625rem', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
            }}
          >
            {roleLabel(user.role)}
          </span>
          <button
            type="button"
            className="tok-btn secondary d-none d-md-inline-flex"
            style={{ minHeight: 44 }}
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={onLogout}
          >
            {loggingOut ? 'Signing out…' : 'Logout'}
          </button>
          <button
            type="button"
            className="tok-btn secondary d-inline-flex d-md-none"
            style={{ minWidth: 44, minHeight: 44, padding: '0 0.625rem' }}
            disabled={loggingOut}
            aria-busy={loggingOut}
            aria-label="Log out"
            title="Log out"
            onClick={onLogout}
          >
            ⎋
          </button>
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

// Lab 1 foundation screen — kept so the original check-system demo stays valid.
function HomeScreen() {
  const [state, setState] = useState<UiState>('idle');
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheck() {
    setState('loading');
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState('success');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="tok-main">
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button
        type="button"
        className="btn btn-success"
        onClick={handleCheck}
        disabled={state === 'loading'}
        aria-busy={state === 'loading'}
      >
        {state === 'loading' ? 'Loading…' : 'Check System'}
      </button>

      <div aria-live="polite" role="status" className="tt-status">
        {state === 'success' && (
          <>
            <p className="mb-0">System Status: Online</p>
            <p className="mb-2 mt-3">Supported Request Categories:</p>
            <ul className="list-group">
              {categories.map((category) => (
                <li key={category.id} className="list-group-item">
                  {category.name}
                </li>
              ))}
            </ul>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="mb-0">System Status: Offline</p>
            <p role="alert" className="mb-0 text-danger">
              Unable to connect to TokTickIT API
            </p>
          </>
        )}
      </div>
    </div>
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

function StaffPlaceholder() {
  return (
    <main className="tok-main">
      <div className="tok-card" style={{ maxWidth: 640, margin: '2rem auto' }}>
        <h1 className="h4">Ticket Queue</h1>
        <p className="tok-hint">The staff queue ships in the next issue. Your session is authenticated as IT Staff.</p>
        <a href="#/change-password" onClick={(e) => { e.preventDefault(); window.location.hash = '/change-password'; }}>Change password</a>
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

function Shell() {
  const { user, loading, logout } = useAuth();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [loggingOut, setLoggingOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  function navigate(hash: string) {
    setSignedOut(false);
    setRoute(parseRoute(hash));
    if (window.location.hash === hash) {
      setRoute(parseRoute(hash));
    } else {
      window.location.hash = hash;
    }
  }

  useEffect(() => {
    const onHashChange = () => {
      setSignedOut(false);
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
      setSignedOut(true);
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
    if (route.name !== 'login') {
      const current = window.location.hash.replace(/^#/, '');
      const isPublicish = current === '' || current === '/' || current.startsWith('/login');
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
        <LoginPage notice={signedOut ? 'You have been signed out.' : null} />
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
        <AppHeader user={user} minimal activeRoute="change-password" onNavigate={navigate} onLogout={handleLogout} loggingOut={loggingOut} />
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
    body = isStaff || isAdmin ? <StaffPlaceholder /> : <Forbidden home={home} message="You do not have access to the staff queue." />;
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
      <AppHeader user={user} minimal={false} activeRoute={activeNav} onNavigate={navigate} onLogout={handleLogout} loggingOut={loggingOut} />
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
      <DevRequesterProvider>
        <Shell />
      </DevRequesterProvider>
    </AuthProvider>
  );
}

export default App;
