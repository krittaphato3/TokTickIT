// Single place that knows where the TokTickIT API lives and the shapes it
// returns. Resource functions (health, categories) are added here in Issues 2
// and 4; the UI must never hard-code URLs.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend:
//   fetch `${API_URL}/health`; if not ok, throw.
//   then fetch `${API_URL}/categories`; if not ok, throw.
//   return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  // TODO(Issue 2 & 4): implement the two fetch calls described above.
  throw new Error('checkSystem not implemented yet');
}

export default API_URL;
