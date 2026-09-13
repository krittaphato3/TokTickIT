import { useEffect, useState } from 'react';
import { AuthProvider, roleHome, useAuth } from './auth/AuthContext';
import type { AuthUser } from './auth/AuthContext';
import ChangePasswordPage from './components/ChangePasswordPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import CreateTicketPage from './components/CreateTicketPage';
import LoginPage from './components/LoginPage';
import ProfilePage from './components/ProfilePage';
import MyTicketsPage from './components/MyTicketsPage';
import TicketDetailPage from './components/TicketDetailPage';
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

function AppHeader({
  user,
  minimal,
  activeRoute,
  onNavigate,
}: {
  user: AuthUser;
  minimal: boolean;
  activeRoute: string;
  onNavigate: (hash: string) => void;
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
        {/* Right cluster — single "Profile" entry for ALL account types.
            Mirrors the approved mockup (AccountSelection_Demo): green person
            icon + "Profile" label + caret. Navigates to the Profile page
            (#/profile); it does NOT open a dropdown or sign out. */}
        <div className="ms-auto d-flex align-items-center flex-shrink-0">
          <a
            className="tok-profile-btn"
            href="#/profile"
            title="Profile"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('#/profile');
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            <span>Profile</span>
            <span className="tok-profile-caret" aria-hidden="true">▾</span>
          </a>
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
          <LoginPage notice={signedOut ? 'You have been signed out.' : null} />
        )}
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
        <AppHeader user={user} minimal activeRoute="change-password" onNavigate={navigate} />
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
      <AppHeader user={user} minimal={false} activeRoute={activeNav} onNavigate={navigate} />
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
