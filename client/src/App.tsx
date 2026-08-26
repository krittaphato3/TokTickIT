import { useEffect, useState } from 'react';
import type { Category } from './api';
import { checkSystem } from './api';
import { DevRequesterProvider } from './DevRequesterProvider';
import RequesterSelector from './RequesterSelector';
import ProfileHeader from './ProfileHeader';
import CreateTicketPage from './components/CreateTicketPage';
import MyTicketsPage from './components/MyTicketsPage';
import { useDevRequester } from './devRequesterContext';

// UI states: idle, loading, success, error.
type UiState = 'idle' | 'loading' | 'success' | 'error';

// Hash-based routing keeps the shell dependency-free while giving every
// screen a shareable URL: #/new-ticket, #/tickets, #/tickets/<number>.
export type Route =
  | { name: 'home' }
  | { name: 'new-ticket' }
  | { name: 'tickets' }
  | { name: 'ticket-detail'; ticketNumber: string };

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/new-ticket' || path === '/new-ticket/') {
    return { name: 'new-ticket' };
  }
  if (path === '/tickets' || path === '/tickets/') {
    return { name: 'tickets' };
  }
  const detail = path.match(/^\/tickets\/(TTK-\d{4}-\d{6})$/);
  if (detail) {
    return { name: 'ticket-detail', ticketNumber: detail[1] };
  }
  return { name: 'home' };
}

// Shared top navbar (mockup header + ui-spec §9).
function AppHeader({
  active,
  onNavigate,
}: {
  active: 'new' | 'my-tickets';
  onNavigate: (hash: string) => void;
}) {
  return (
    <header className="tok-navbar">
      <a
        className="tok-brand"
        href="#/tickets"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('#/tickets');
        }}
      >
        <span className="tok-brand-badge" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
            <path d="M13 5v2" />
            <path d="M13 17v2" />
            <path d="M13 11v2" />
          </svg>
        </span>
        TokTickIT
      </a>
      <nav className="tok-nav" aria-label="Primary">
        <a
          href="#/new-ticket"
          className={active === 'new' ? 'active' : ''}
          aria-current={active === 'new' ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onNavigate('#/new-ticket');
          }}
        >
          New Ticket
        </a>
        <a
          href="#/tickets"
          className={active === 'my-tickets' ? 'active' : ''}
          aria-current={active === 'my-tickets' ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onNavigate('#/tickets');
          }}
        >
          My Tickets
        </a>
      </nav>
      <RequesterSelector />
      <ProfileHeader onClear={() => onNavigate('#/tickets')} />
    </header>
  );
}

// Lab 1 foundation screen — kept as the landing view so the original
// check-system demo and its tests remain valid.
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

function TicketDetail({ ticketNumber }: { ticketNumber: string }) {
  return (
    <main className="tok-main">
      <nav className="tok-breadcrumb" aria-label="Breadcrumb">
        <a href="#/tickets">My Tickets</a>
        <span className="sep">/</span>
        <span className="current">{ticketNumber}</span>
      </nav>
      <h1 className="tok-page-title">Ticket Detail</h1>
      <p>
        Official number:{' '}
        <strong className="tt-ticket-number">{ticketNumber}</strong>
      </p>
      <p className="text-muted">
        Full read-only detail arrives with Issues #17/#18.
      </p>
      <a className="btn btn-link px-0" href="#/tickets">
        Back to My Tickets
      </a>
    </main>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  // Keying the list screen by active requester remounts it on switch, so
  // search/filters/sort/pagination reset to defaults and the first fetch uses
  // the new identity only (ui-spec §9 / BR-05).
  const { activeRequester } = useDevRequester();

  function navigate(hash: string) {
    setRoute(parseRoute(hash));
    window.location.hash = hash;
  }

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleCreated(ticketNumber: string) {
    // ui-spec §6 Success: navigate to the new ticket's detail view.
    navigate(`#/tickets/${ticketNumber}`);
  }

  const activeNav =
    route.name === 'new-ticket' ? 'new' : 'my-tickets';

  return (
    <div className="tt-app">
      <AppHeader active={activeNav} onNavigate={navigate} />
      {route.name === 'home' && <HomeScreen />}
      {route.name === 'new-ticket' && (
        <CreateTicketPage onCreated={handleCreated} />
      )}
      {route.name === 'tickets' && (
        <MyTicketsPage
          key={activeRequester?.id ?? 'none'}
          onNavigate={navigate}
        />
      )}
      {route.name === 'ticket-detail' && (
        <TicketDetail ticketNumber={route.ticketNumber} />
      )}
    </div>
  );
}

function App() {
  return (
    <DevRequesterProvider>
      <Shell />
    </DevRequesterProvider>
  );
}

export default App;