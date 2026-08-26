import { createContext, useContext } from 'react';
import type { Requester } from './api';

export type DevRequesterStatus = 'loading' | 'ready' | 'error';

export interface DevRequesterState {
  requesters: Requester[];
  activeRequester: Requester | null;
  status: DevRequesterStatus;
  selectRequester: (id: number) => void;
  // Clears the active requester (profile "Change requester" action) and any
  // persisted selection, returning the UI to the unselected state.
  clearRequester: () => void;
  retry: () => void;
}

export const DevRequesterContext = createContext<DevRequesterState | null>(null);

export function useDevRequester(): DevRequesterState {
  const context = useContext(DevRequesterContext);
  if (!context) {
    throw new Error('useDevRequester must be used inside a DevRequesterProvider');
  }
  return context;
}