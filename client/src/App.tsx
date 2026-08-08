import { useState } from 'react';
import type { Category } from './api';
import { checkSystem } from './api';

// UI states: idle, loading, success, error.
type UiState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [state, setState] = useState<UiState>('idle');
  const [categories] = useState<Category[]>([]);
  void categories;

  async function handleCheck() {
    setState('loading');
    try {
      await checkSystem();
      setState('success');
    } catch {
      setState('error');
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: 640 }}>
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
        {state === 'success' && <p className="mb-0">System Status: Online</p>}
        {state === 'error' && (
          <>
            <p className="mb-0">System Status: Offline</p>
            <p role="alert" className="mb-0 text-danger">
              Unable to connect to TokTickIT API
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default App;