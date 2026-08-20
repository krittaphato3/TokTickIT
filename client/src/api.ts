// Single place that knows where the TokTickIT API lives and the shapes it
// returns. Resource functions (health, categories) are added here in Issues 2
// and 4; the UI must never hard-code URLs.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface Category {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 3 — call the backend; if not ok, throw.
// Throwing on failure lets the UI show a single Offline/error state.
export async function getRequesters(): Promise<Requester[]> {
  const response = await fetch(`${API_URL}/api/requesters`);
  if (!response.ok) {
    throw new Error(`Requesters request failed with status ${response.status}`);
  }
  return (await response.json()) as Requester[];
}

// Issue 2 + Issue 4 — call the backend:
//   fetch `${API_URL}/api/health`; if not ok, throw.
//   then fetch `${API_URL}/api/categories`; if not ok, throw.
//   return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthResponse = await fetch(`${API_URL}/api/health`);
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}`);
  }

  const categoriesResponse = await fetch(`${API_URL}/api/categories`);
  if (!categoriesResponse.ok) {
    throw new Error(`Categories request failed with status ${categoriesResponse.status}`);
  }

  const categories = (await categoriesResponse.json()) as Category[];
  return { online: true, categories };
}

export default API_URL;