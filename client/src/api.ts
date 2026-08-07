// Single place that knows where the TokTickIT API lives and the shapes it
// returns. Resource functions (health, categories) will be added here in
// Issues 2 and 4; the UI must never hard-code URLs.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export default API_URL;
