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

// The create/list/detail response shape (api-spec §3.1/§3.2). Only the fields
// the UI consumes are declared; unknown extra fields are ignored.
export type TicketStatus = 'NEW' | 'OPEN' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: Priority;
  // Issue #30 — IT-side display fields (BR-20); null until IT staff set them.
  itPriority: Priority | null;
  ownerName: string | null;
  owner: { name: string } | null;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
}

// Issue #14 — lookup data for the Create Ticket form.
export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Categories request failed with status ${response.status}`);
  }
  return (await response.json()) as Category[];
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(
      `Related systems request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as RelatedSystem[];
}

// Lab 3 — create a ticket as the authenticated user (BR-03): identity is the
// server-side session; no requester id is ever sent from the client.
// The server assigns ticketNumber, status, and timestamps (FR-02/FR-03).
// Non-2xx: throws ApiError carrying the documented { error, details? } body.
export class ApiError extends Error {
  status: number;
  code?: string;
  body: {
    error?: string;
    code?: string;
    details?: { field: string; message: string }[];
  };

  constructor(
    status: number,
    body: {
      error?: string;
      code?: string;
      details?: { field: string; message: string }[];
    },
  ) {
    super(body.error ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
    this.code = body.code;
  }
}

// Lab 3 session auth (api-spec §1.1/§2/§3). CSRF token lives in module memory
// only — never localStorage. Authenticated requests send cookies via
// credentials:include.
let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function authHeaders(extra?: Record<string, string>, withCsrf = false): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (withCsrf && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
}

export type UserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMIN' | string;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface LoginResult {
  user: AuthUser;
  csrfToken: string;
}

export interface MeResult {
  user: AuthUser;
  csrfToken: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError(0, { error: 'Network error' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  const result = body as LoginResult;
  if (result.csrfToken) setCsrfToken(result.csrfToken);
  return result;
}

export async function me(): Promise<MeResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, { error: 'Network error' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  const result = body as MeResult;
  if (result.csrfToken) setCsrfToken(result.csrfToken);
  return result;
}

export async function logout(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({}, true),
    });
  } catch {
    throw new ApiError(0, { error: 'Network error' });
  }
  // Idempotent logout: treat 401 (already expired) as success per BR-08.
  if (response.status === 401) {
    setCsrfToken(null);
    return;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  setCsrfToken(null);
}

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export async function changePassword(input: ChangePasswordInput): Promise<{ user: AuthUser }> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }, true),
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError(0, { error: 'Network error' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as { user: AuthUser };
}

// Lab 3 forgot-password (ui-spec §3.4): credential-verified reset. No email is
// sent (the lab excludes email flows); the user proves ownership with the
// current/initial password and sets a new one in a single request. Unknown
// email / wrong password / inactive account all return the same safe 401 so
// account existence is never revealed.
export interface ForgotPasswordInput {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<{ changed: boolean; message?: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError(0, { error: 'Network error' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as { changed: boolean; message?: string };
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders({}, true),
    },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as Ticket;
}

// Issue #15/#16 — list the active Development Requester's tickets.
// Search/filter params are appended only when set; sort is always sent
// explicitly (the UI's default "newest first" maps to sortBy=createdAt
// &sortDir=desc, matching the server default). Page/pageSize are always sent.
export type SortBy =
  | 'createdAt'
  | 'updatedAt'
  | 'title'
  | 'priority'
  | 'ticketNumber';
export type SortDir = 'asc' | 'desc';

export interface TicketListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: number;
  priority?: Priority;
  itPriority?: Priority;
  status?: TicketStatus;
  sortBy?: SortBy;
  sortDir?: SortDir;
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface TicketListResult {
  data: Ticket[];
  meta: TicketListMeta;
}

export async function getTickets(
  params: TicketListParams,
): Promise<TicketListResult> {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.pageSize !== undefined)
    search.set('pageSize', String(params.pageSize));
  if (params.search !== undefined && params.search !== '')
    search.set('search', params.search);
  if (params.categoryId !== undefined)
    search.set('categoryId', String(params.categoryId));
  if (params.priority !== undefined) search.set('priority', params.priority);
  if (params.itPriority !== undefined)
    search.set('itPriority', params.itPriority);
  if (params.status !== undefined) search.set('status', params.status);
  if (params.sortBy !== undefined) search.set('sortBy', params.sortBy);
  if (params.sortDir !== undefined) search.set('sortDir', params.sortDir);

  const qs = search.toString();
  const url = `${API_URL}/api/tickets${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as TicketListResult;
}

// Issue 2 + Issue 4 — call the backend:
//   fetch `${API_URL}/api/health`; if not ok, throw.
//   then fetch `${API_URL}/api/categories`; if not ok, throw.
//   return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthResponse = await fetch(`${API_URL}/api/health`, {
    credentials: 'include',
  });
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}`);
  }

  const categoriesResponse = await fetch(`${API_URL}/api/categories`, {
    credentials: 'include',
  });
  if (!categoriesResponse.ok) {
    throw new Error(`Categories request failed with status ${categoriesResponse.status}`);
  }

  const categories = (await categoriesResponse.json()) as Category[];
  return { online: true, categories };
}

export interface AttachmentMeta {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
}

export interface TicketDetail extends Ticket {
  requester: { id: number; name: string; email: string };
  attachments: AttachmentMeta[];
}

export async function getTicketDetail(ticketNumber: string): Promise<TicketDetail> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as TicketDetail;
}

export async function uploadAttachment(ticketNumber: string, file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {
    ...authHeaders({}, true),
  };
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export async function deleteAttachment(ticketNumber: string, attachmentId: number): Promise<AttachmentMeta> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments/${attachmentId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export default API_URL;