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
  requesterId: number,
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
    headers: { 'X-Dev-Requester-Id': String(requesterId) },
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

export interface AttachmentMeta {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
}

export interface TicketDetail extends Ticket {
  requester: Requester;
  attachments: AttachmentMeta[];
}

export async function getTicketDetail(ticketNumber: string, requesterId: number): Promise<TicketDetail> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}`, {
    headers: { 'X-Dev-Requester-Id': String(requesterId) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as TicketDetail;
}

export async function uploadAttachment(ticketNumber: string, file: File, requesterId: number): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments`, {
    method: 'POST',
    headers: { 'X-Dev-Requester-Id': String(requesterId) },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export async function deleteAttachment(ticketNumber: string, attachmentId: number, requesterId: number): Promise<AttachmentMeta> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: { 'X-Dev-Requester-Id': String(requesterId) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export default API_URL;