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
  categories: Array<{ id: number; name: string }>;
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface CreateTicketInput {
  title: string;
  description?: string;
  categoryId: number;
  priority: Priority;
  relatedSystemId: number;
}

// The create/list/detail response shape (api-spec §3.1). Only the fields the
// UI consumes are declared; unknown extra fields are ignored.
export interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: 'NEW';
  priority: Priority;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
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

// Issue #14 — lookup data for the Create Ticket form.
export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`);
  if (!response.ok) {
    throw new Error(`Categories request failed with status ${response.status}`);
  }
  return (await response.json()) as Category[];
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`);
  if (!response.ok) {
    throw new Error(
      `Related systems request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as RelatedSystem[];
}

// Issue #14 — create a ticket for the active Development Requester.
// requesterId travels in the X-Dev-Requester-Id header (BR-06); the server
// assigns ticketNumber, status, and timestamps (FR-02/FR-03).
// Non-2xx: throws ApiError carrying the documented { error, details? } body.
export class ApiError extends Error {
  status: number;
  body: { error?: string; details?: { field: string; message: string }[] };

  constructor(
    status: number,
    body: { error?: string; details?: { field: string; message: string }[] },
  ) {
    super(body.error ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function createTicket(
  input: CreateTicketInput,
  requesterId: number,
): Promise<Ticket> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-Requester-Id': String(requesterId),
    },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as Ticket;
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