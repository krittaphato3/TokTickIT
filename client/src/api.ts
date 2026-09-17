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
  sha256?: string | null;
  removeReason?: string | null;
  removeNote?: string | null;
}

export type AttachmentEventType = 'UPLOAD' | 'REMOVE' | 'RESTORE' | 'DOWNLOAD';

export interface AttachmentEventFile {
  id: number | null;
  name: string;
  size: number;
  mime: string;
  sha: string | null;
}

export interface AttachmentEvent {
  id: number;
  type: AttachmentEventType | string;
  at: string;
  createdAt: string;
  by: string;
  actorName: string;
  file: AttachmentEventFile;
  reason?: string | null;
  note?: string | null;
  ref?: number | null;
}

export interface RemoveAttachmentOptions {
  reasonCode?: string;
  note?: string;
}

export interface TicketDetail extends Ticket {
  requester: { id: number; name: string; email: string };
  attachments: AttachmentMeta[];
  // Lab 3 BR-05 — problem-appears-resolved signal timestamp (null = none).
  appearsResolvedAt?: string | null;
}

// Lab 3 §7 — Public Comments (FR-08/BR-14). Append-only thread shared by
// requester, IT staff, and admin. Author and createdAt are server-derived;
// bodies are plain text the UI renders escaped.
export interface PublicComment {
  id: number;
  body: string;
  author: { id: number; name: string; role: string };
  appearsResolved: boolean;
  createdAt: string;
}

export const MAX_COMMENT_LENGTH = 2000;

export async function getTicketComments(ticketNumber: string): Promise<PublicComment[]> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/comments`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as PublicComment[];
}

export interface CreateCommentInput {
  body: string;
  // BR-05: requester-only signal; the server ignores it for staff/admin and
  // rejects a second active signal with 409.
  appearsResolved?: boolean;
}

export async function createTicketComment(
  ticketNumber: string,
  input: CreateCommentInput,
): Promise<PublicComment> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders({}, true),
    },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as PublicComment;
}

// ---------------------------------------------------------------------------
// Lab 3 §5 — IT Staff Ticket Queue (api-spec §5.1). Cross-ticket read surface
// for IT_STAFF/ADMINISTRATOR sessions; the server rejects REQUESTER with 403
// (BR-20). Query params mirror the documented contract exactly; nothing is
// sent for absent filters. Internal Notes never appear in queue rows.
// ---------------------------------------------------------------------------

// The full Lab 3 status axis (ui-spec §6.1 filter options; the DB's interim
// PENDING value is legacy and never sent by this client).
export type StaffTicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED';

export type StaffSortField = 'createdAt' | 'updatedAt' | 'priority' | 'number';

export interface StaffQueueParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: StaffTicketStatus;
  categoryId?: number;
  reqPriority?: Priority;
  itPriority?: Priority;
  ownerId?: number;
  assigned?: boolean;
  sort?: StaffSortField;
  order?: SortDir;
}

export interface StaffQueueTicket {
  id: number;
  ticketNumber: string;
  title: string;
  status: StaffTicketStatus;
  priority: Priority;
  itPriority: Priority | null;
  owner: { id: number; name: string; email: string } | null;
  requester: { id: number; name: string; email: string };
  category: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface StaffQueueMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface StaffQueueResult {
  data: StaffQueueTicket[];
  meta: StaffQueueMeta;
}

export async function getStaffTickets(
  params: StaffQueueParams,
): Promise<StaffQueueResult> {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize));
  if (params.q !== undefined && params.q !== '') search.set('q', params.q);
  if (params.status !== undefined) search.set('status', params.status);
  if (params.categoryId !== undefined) search.set('categoryId', String(params.categoryId));
  if (params.reqPriority !== undefined) search.set('reqPriority', params.reqPriority);
  if (params.itPriority !== undefined) search.set('itPriority', params.itPriority);
  if (params.ownerId !== undefined) search.set('ownerId', String(params.ownerId));
  if (params.assigned !== undefined) search.set('assigned', String(params.assigned));
  if (params.sort !== undefined) search.set('sort', params.sort);
  if (params.order !== undefined) search.set('order', params.order);

  const qs = search.toString();
  const url = `${API_URL}/api/staff/tickets${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as StaffQueueResult;
}

// ---------------------------------------------------------------------------
// Lab 3 §6/§7/§8 — IT Staff Ticket Detail operations (api-spec §6). Server
// enforces every rule (BR-12/13/15, §12 matrix); these wrappers only shape
// the calls. IT Priority, Owner, and Status edits are IT_STAFF-only — an
// Administrator session receives 403 (view-only) from the server.
// ---------------------------------------------------------------------------

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: StaffTicketStatus;
  priority: Priority;
  itPriority: Priority | null;
  owner: { id: number; name: string; email: string; role: string; isActive: boolean } | null;
  requester: { id: number; name: string; email: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string } | null;
  appearsResolvedAt: string | null;
  attachments: Array<{
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    removedAt: string | null;
  }>;
  commentCount: number;
  internalNoteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerChangeResult {
  id: number;
  ticketNumber: string;
  status: StaffTicketStatus;
  owner: { id: number; name: string; email: string } | null;
  itPriority: Priority | null;
  itPriorityCopied: boolean;
  updatedAt: string;
}

export async function getStaffTicketDetail(ticketNumber: string): Promise<StaffTicketDetail> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as StaffTicketDetail;
}

export async function changeTicketOwner(
  ticketNumber: string,
  ownerId: number | null,
): Promise<OwnerChangeResult> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/owner`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ ownerId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as OwnerChangeResult;
}

export async function setItPriority(
  ticketNumber: string,
  itPriority: Priority,
): Promise<{ id: number; ticketNumber: string; priority: Priority; itPriority: Priority | null; updatedAt: string }> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/it-priority`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ itPriority }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as { id: number; ticketNumber: string; priority: Priority; itPriority: Priority | null; updatedAt: string };
}

export interface StatusChangeResult {
  id: number;
  ticketNumber: string;
  status: StaffTicketStatus;
  updatedAt: string;
  comment: { id: number; body: string } | null;
}

// BR-15: `confirm` is required for cancel/resolve/close transitions and
// `reason` for reopening from RESOLVED/CLOSED/CANCELLED. The server is the
// authority on both; the client only supplies what the UI collected.
export async function changeTicketStatus(
  ticketNumber: string,
  status: StaffTicketStatus,
  options?: { confirm?: boolean; reason?: string },
): Promise<StatusChangeResult> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ status, ...(options?.confirm ? { confirm: true } : {}), ...(options?.reason ? { reason: options.reason } : {}) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as StatusChangeResult;
}

// §8 — Internal Notes (FR-09/BR-04): IT_STAFF/ADMIN only; requesters get a
// masked 404 from the server and never render this surface (BR-20).
export interface InternalNote {
  id: number;
  body: string;
  author: { id: number; name: string; role: string };
  createdAt: string;
}

export async function getInternalNotes(ticketNumber: string): Promise<InternalNote[]> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/internal-notes`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as InternalNote[];
}

export async function createInternalNote(ticketNumber: string, body: string): Promise<InternalNote> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/internal-notes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ body }),
  });
  const bodyJson = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, bodyJson);
  return bodyJson as InternalNote;
}

// §7 staff aliases — identical shapes to the requester-facing comment API.
export async function getStaffTicketComments(ticketNumber: string): Promise<PublicComment[]> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/comments`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as PublicComment[];
}

export async function createStaffTicketComment(
  ticketNumber: string,
  body: string,
): Promise<PublicComment> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ body }),
  });
  const bodyJson = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, bodyJson);
  return bodyJson as PublicComment;
}

// §7.3 — staff attachment download (read-only viewer; ui-spec §7.3).
export async function downloadStaffAttachment(ticketNumber: string, attachmentId: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketNumber}/attachments/${attachmentId}/download`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body);
  }
  return await response.blob();
}

// Owner filter options: active IT Staff + Administrator users only (BR-12).
export interface QueueOwner {
  id: number;
  name: string;
  email: string;
}

export async function getQueueOwners(): Promise<QueueOwner[]> {
  const response = await fetch(`${API_URL}/api/staff/owners`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as QueueOwner[];
}

// ---------------------------------------------------------------------------
// Lab 3 §9 — Administrator User Management (api-spec §9). ADMIN-only surface;
// the server rejects REQUESTER/IT_STAFF with 403 and enforces every safety
// rule (duplicate email 409, self-deactivation 409, last-admin 409). These
// wrappers only shape the calls; responses never carry password material.
// ---------------------------------------------------------------------------

// Wire value for the Administrator role per api-spec §9 (DB enum:
// ADMINISTRATOR).
export type AdminUserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMIN';

export const ADMIN_USER_ROLES: AdminUserRole[] = ['REQUESTER', 'IT_STAFF', 'ADMIN'];

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminUserRole | string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResult {
  data: AdminUser[];
  meta: { totalItems: number };
}

export async function getAdminUsers(params: {
  search?: string;
  role?: AdminUserRole | '';
}): Promise<AdminUserListResult> {
  const search = new URLSearchParams();
  if (params.search !== undefined && params.search !== '') search.set('search', params.search);
  if (params.role !== undefined && params.role !== '') search.set('role', params.role);
  const qs = search.toString();
  const response = await fetch(`${API_URL}/api/users${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AdminUserListResult;
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  role: AdminUserRole;
  isActive: boolean;
  initialPassword: string;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/api/users`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AdminUser;
}

export interface UpdateAdminUserInput {
  name?: string;
  email?: string;
  role?: AdminUserRole;
  isActive?: boolean;
}

export async function updateAdminUser(id: number, input: UpdateAdminUserInput): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/api/users/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AdminUser;
}

export async function setUserInitialPassword(
  id: number,
  initialPassword: string,
): Promise<{ id: number; email: string; mustChangePassword: boolean; updatedAt: string }> {
  const response = await fetch(`${API_URL}/api/users/${id}/set-initial-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders({}, true) },
    body: JSON.stringify({ initialPassword }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as { id: number; email: string; mustChangePassword: boolean; updatedAt: string };
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

export async function deleteAttachment(
  ticketNumber: string,
  attachmentId: number,
  options?: RemoveAttachmentOptions,
): Promise<AttachmentMeta> {
  const hasBody =
    options !== undefined &&
    (options.reasonCode !== undefined || options.note !== undefined);
  const init: RequestInit = {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...authHeaders(hasBody ? { 'Content-Type': 'application/json' } : {}, true) },
  };
  if (hasBody) {
    const body: Record<string, string> = {};
    if (options?.reasonCode !== undefined) body.reasonCode = options.reasonCode;
    if (options?.note !== undefined) body.note = options.note;
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments/${attachmentId}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export async function restoreAttachment(ticketNumber: string, attachmentId: number): Promise<AttachmentMeta> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments/${attachmentId}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentMeta;
}

export async function getTicketEvents(ticketNumber: string): Promise<AttachmentEvent[]> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/events`, {
    credentials: 'include',
    headers: { ...authHeaders({}, true) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as AttachmentEvent[];
}

export async function downloadAttachment(ticketNumber: string, attachmentId: number): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/tickets/${ticketNumber}/attachments/${attachmentId}/download`, {
      credentials: 'include',
    });
  } catch {
    throw new Error('Download failed: network error');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Not authenticated — please sign in again.');
    if (response.status === 403) throw new Error('Not allowed to download this file.');
    let message = `Download failed with status ${response.status}`;
    try {
      const body = (await response.clone().json()) as { error?: string };
      if (body && typeof body.error === 'string' && body.error) message = body.error;
    } catch {
      // non-JSON error body — keep status message
    }
    throw new Error(message);
  }
  return await response.blob();
}

export default API_URL;