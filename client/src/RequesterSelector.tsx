import { useDevRequester } from './devRequesterContext';

// ui-spec §9 / mockup header — the Development Requester selector. BR-03: it
// must be visibly labeled "Testing only — not real authentication". Switching
// re-issues API calls with the new requester identity via X-Dev-Requester-Id.
function SelectorOptions() {
  const { requesters, activeRequester, status, selectRequester, retry } =
    useDevRequester();

  if (status === 'loading') {
    return (
      <span className="tok-req-caption" role="status">
        Loading requesters…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="tok-req-caption" role="alert">
        Could not load requesters.{' '}
        <button type="button" className="tok-browse" onClick={retry}>
          Try again
        </button>
      </span>
    );
  }

  return (
    <select
      id="dev-requester-select"
      className="tok-req-select"
      aria-label="Development Requester"
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
    <div className="tok-req-wrap">
      <span className="tok-req-label" id="devReqLabel">
        Development
        <br />
        Requester
      </span>
      <SelectorOptions />
      <span className="tok-req-caption">
        Testing only — not real authentication
      </span>
    </div>
  );
}