import { useDevRequester } from './devRequesterContext';

// ui-spec §9 — Development Requester selector in the top-right of the app
// shell. FR-13: switching re-issues API calls with the new requester identity
// via the X-Dev-Requester-Id header (handled by callers). BR-03: it must be
// visibly labeled "Testing only — not real authentication".
function SelectorOptions() {
  const { requesters, activeRequester, status, selectRequester, retry } =
    useDevRequester();

  if (status === 'loading') {
    return (
      <span className="tt-selector-status" role="status">
        Loading requesters…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="tt-selector-error" role="alert">
        Could not load requesters.{' '}
        <button type="button" className="btn btn-link btn-sm p-0" onClick={retry}>
          Try again
        </button>
      </span>
    );
  }

  return (
    <select
      id="dev-requester-select"
      className="form-select form-select-sm tt-selector-select"
      value={activeRequester?.id ?? ''}
      onChange={(event) => selectRequester(Number(event.target.value))}
    >
      {requesters.map((requester) => (
        <option key={requester.id} value={requester.id}>
          {requester.name}
        </option>
      ))}
    </select>
  );
}

export default function RequesterSelector() {
  return (
    <div className="d-flex align-items-center gap-2 tt-selector">
      <label htmlFor="dev-requester-select" className="tt-selector-label">
        Development Requester
      </label>
      <SelectorOptions />
      <span className="tt-selector-caption">Testing only — not real authentication</span>
    </div>
  );
}