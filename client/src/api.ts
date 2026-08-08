// Single place that knows where the TokTickIT API lives and the shapes it
// returns. Resource functions (health, categories) are added here in Issues 2
// and 4; the UI must never hard-code URLs.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 — call the backend:
//   fetch `${API_URL}/api/health`; if not ok, throw.
// Throwing on failure lets the UI show a single Offline/error state.
// (The categories fetch is added in Issue 4.)
export async function checkSystem(): Promise<SystemStatus> {
  const response = await fetch(`${API_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  await response.json();
  return { online: true, categories: [] };
}

export default API_URL;