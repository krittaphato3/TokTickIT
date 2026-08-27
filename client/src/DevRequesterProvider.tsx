import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRequesters, type Requester } from './api';
import { DevRequesterContext, type DevRequesterStatus } from './devRequesterContext';

// FR-13 / BR-05 — the active Development Requester is a testing identity that
// travels per-request via X-Dev-Requester-Id (added by later API layers). The
// server keeps no session, so client-side persistence is for convenience only.
const STORAGE_KEY = 'toktickit.devRequesterId';

export function DevRequesterProvider({ children }: { children: ReactNode }) {
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [status, setStatus] = useState<DevRequesterStatus>('loading');
  const [activeId, setActiveId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const list = await getRequesters();
      setRequesters(list);
      setStatus('ready');
      // Keep a stored selection only if it still refers to an active
      // requester; otherwise fall back to the first active one.
      setActiveId((current) =>
        current !== null && list.some((r) => r.id === current)
          ? current
          : list[0]?.id ?? null,
      );
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeId !== null) {
      localStorage.setItem(STORAGE_KEY, String(activeId));
    } else if (activeId === null && localStorage.getItem(STORAGE_KEY)) {
      // A requester was explicitly cleared; drop the persisted selection.
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeId]);

  // BR-05/BR-03 — "Change requester": forget the selection so the app is
  // unauthenticated-but-usable; protected routes render the selection screen.
  const clearRequester = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeRequester = useMemo(
    () => requesters.find((r) => r.id === activeId) ?? null,
    [requesters, activeId],
  );

  const value = useMemo(
    () => ({
      requesters,
      activeRequester,
      status,
      selectRequester: setActiveId,
      clearRequester,
      retry: load,
    }),
    [requesters, activeRequester, status, load, clearRequester],
  );

  return (
    <DevRequesterContext.Provider value={value}>{children}</DevRequesterContext.Provider>
  );
}