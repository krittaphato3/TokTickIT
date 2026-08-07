import { useState } from 'react';
import type { Category } from './api';

// UI states: idle, loading, success, error. Issue 2 wires the health call and
// Issue 4 renders the category list; this issue ships the UI shell only.
type UiState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [state, setState] = useState<UiState>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  void categories;
  void setCategories;

  async function handleCheck() {
    // TODO(Issue 2/4): call checkSystem(), then show Online + categories
    // or an Offline error message.
    setState('loading');
  }

  return (
    <main className="container py-5" style={{ maxWidth: 640 }}>
      <nav className="navbar bg-primary-subtle rounded mb-4">
        <span className="navbar-brand mb-0 h1">TokTickIT</span>
      </nav>
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

      {/* Status area: loading / Online + categories / Offline message land in Issues 2 and 4. */}
      <div aria-live="polite" role="status" />
    </main>
  );
}

export default App;
