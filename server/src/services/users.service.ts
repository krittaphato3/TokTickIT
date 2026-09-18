import type { PrismaClient, Prisma, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { HttpError } from './ticket.service.js';

// Lab 3 §9 — Administrator User Management (api-spec §9). One role per user is
// the DB enum itself (BR-18); email uniqueness is case-insensitive at the
// validation layer and enforced again by the DB unique constraint (BR-10).
// List responses and every response body NEVER include passwordHash — the
// service returns Prisma rows projected through a password-free shape.

// Lab 3 role axis. The enum value is ADMINISTRATOR; api-spec §9 documents the
// canonical wire value as "ADMIN" for the Administrator role.
export const USER_ROLES = ['REQUESTER', 'IT_STAFF', 'ADMIN'] as const;
export type UserListRole = (typeof USER_ROLES)[number];

const BCRYPT_COST = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MIN_INITIAL_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt input limit

export const ERR_EMAIL_EXISTS = 'Email already exists';
export const ERR_USER_NOT_FOUND = 'User not found';
export const ERR_SELF_DEACTIVATE = 'Cannot deactivate your own account';
export const ERR_LAST_ADMIN_DEACTIVATE = 'Cannot deactivate the last active Administrator';
export const ERR_LAST_ADMIN_REASSIGN = 'Cannot reassign the last active Administrator';

// §9.1 — response shape (never includes passwordHash).
export function toUserShape(user: User): {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === 'ADMINISTRATOR' ? 'ADMIN' : user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// §9.1 — `search` is a trimmed case-insensitive substring over name or email;
// empty/absent means no filter. `role` is optional and strictly validated.
// `page`/`pageSize` paginate server-side (page ≥ 1; pageSize 5–100, default 10).
// The client always sends pageSize=10 (stakeholder-fixed), but the API keeps
// the validated range so the contract stays explicit.
export function validateUserListParams(query: Record<string, unknown>): {
  search: string | null;
  role: UserListRole | null;
  page: number;
  pageSize: number;
} {
  const rawSearch = query.search as string | undefined;
  let search: string | null = null;
  if (rawSearch !== undefined && rawSearch !== '') {
    if (typeof rawSearch !== 'string') {
      throw new HttpError(400, 'Validation failed', [
        { field: 'search', message: 'search must be a string' },
      ]);
    }
    const trimmed = rawSearch.trim();
    search = trimmed.length > 0 ? trimmed : null;
  }

  const rawRole = query.role as string | undefined;
  let role: UserListRole | null = null;
  if (rawRole !== undefined && rawRole !== '') {
    if (!(USER_ROLES as readonly string[]).includes(rawRole)) {
      throw new HttpError(400, 'Validation failed', [
        {
          field: 'role',
          message: 'role must be one of REQUESTER, IT_STAFF, ADMIN',
        },
      ]);
    }
    role = rawRole as UserListRole;
  }

  // Pagination (stakeholder request): express delivers query values as
  // strings; anything non-integral or out of range is a 400, not a clamp,
  // so clients see their own mistakes.
  const rawPage = query.page as string | undefined;
  let page = 1;
  if (rawPage !== undefined && rawPage !== '') {
    const n = Number(rawPage);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, 'Validation failed', [
        { field: 'page', message: 'page must be a positive integer' },
      ]);
    }
    page = n;
  }

  const rawPageSize = query.pageSize as string | undefined;
  let pageSize = 10;
  if (rawPageSize !== undefined && rawPageSize !== '') {
    const n = Number(rawPageSize);
    if (!Number.isInteger(n) || n < 5 || n > 100) {
      throw new HttpError(400, 'Validation failed', [
        {
          field: 'pageSize',
          message: 'pageSize must be an integer between 5 and 100',
        },
      ]);
    }
    pageSize = n;
  }

  return { search, role, page, pageSize };
}

function buildListWhere(
  search: string | null,
  role: UserListRole | null,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (role) {
    where.role = role === 'ADMIN' ? 'ADMINISTRATOR' : role;
  }
  if (search) {
    // Case-insensitive substring over name OR email. `%`/`_`/`\` in the term
    // are escaped so the pattern matches literal text (BR-07 convention from
    // the ticket list).
    const pattern = `%${search.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    where.OR = [
      { name: { contains: pattern } },
      { email: { contains: pattern } },
    ];
  }
  return where;
}

// §9.1 — list users ordered by id ascending, paginated server-side.
// meta carries the paging math. Responses never include passwordHash.
export async function listUsers(
  prisma: PrismaClient,
  query: Record<string, unknown>,
): Promise<{
  data: ReturnType<typeof toUserShape>[];
  meta: {
    totalItems: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}> {
  const { search, role, page, pageSize } = validateUserListParams(query);
  const where = buildListWhere(search, role);
  const [users, totalItems] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    data: users.map(toUserShape),
    meta: {
      totalItems,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

interface UserWriteInput {
  name: string;
  email: string;
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  isActive: boolean;
}

function validateNameField(raw: unknown, issues: { field: string; message: string }[]): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    issues.push({ field: 'name', message: 'Name is required' });
    return undefined;
  }
  const name = raw.trim();
  if (name.length > MAX_NAME_LENGTH) {
    issues.push({ field: 'name', message: `Name must be at most ${MAX_NAME_LENGTH} characters` });
    return undefined;
  }
  return name;
}

function validateEmailField(
  raw: unknown,
  issues: { field: string; message: string }[],
): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    issues.push({ field: 'email', message: 'Email is required' });
    return undefined;
  }
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    issues.push({ field: 'email', message: 'Email must be a valid email address' });
    return undefined;
  }
  return email;
}

function validateRoleField(
  raw: unknown,
  issues: { field: string; message: string }[],
): 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR' | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    issues.push({ field: 'role', message: 'Role is required' });
    return undefined;
  }
  if (!(USER_ROLES as readonly string[]).includes(raw)) {
    issues.push({
      field: 'role',
      message: 'role must be one of REQUESTER, IT_STAFF, ADMIN',
    });
    return undefined;
  }
  return raw === 'ADMIN' ? 'ADMINISTRATOR' : (raw as 'REQUESTER' | 'IT_STAFF');
}

// §1.3 — admin-set initial password is length-only (8–72); full complexity is
// enforced at the user's own change-password call.
function validateInitialPasswordField(
  raw: unknown,
  issues: { field: string; message: string }[],
): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    issues.push({ field: 'initialPassword', message: 'Initial password is required' });
    return undefined;
  }
  if (raw.length < MIN_INITIAL_PASSWORD) {
    issues.push({
      field: 'initialPassword',
      message: 'Must be at least 8 characters',
    });
    return undefined;
  }
  if (raw.length > MAX_PASSWORD) {
    issues.push({
      field: 'initialPassword',
      message: 'Must be at most 72 characters',
    });
    return undefined;
  }
  return raw;
}

// §9.2 — create user. `isActive` defaults to true; created users always start
// with mustChangePassword=true (BR-18, local-lab behavior, no email is sent).
export async function createUser(
  prisma: PrismaClient,
  body: unknown,
): Promise<ReturnType<typeof toUserShape>> {
  const data = (typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body
    : {}) as Record<string, unknown>;

  const issues: { field: string; message: string }[] = [];
  const name = validateNameField(data.name, issues);
  const email = validateEmailField(data.email, issues);
  const role = validateRoleField(data.role, issues);
  const initialPassword = validateInitialPasswordField(data.initialPassword, issues);

  let isActive = true;
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== 'boolean') {
      issues.push({ field: 'isActive', message: 'isActive must be a boolean' });
    } else {
      isActive = data.isActive;
    }
  }

  if (issues.length > 0) throw new HttpError(400, 'Validation failed', issues);

  // Case-insensitive duplicate check (BR-10): exact email already stored
  // lowercase, so an equality lookup is the case-insensitive comparison.
  const existing = await prisma.user.findUnique({ where: { email: email as string } });
  if (existing) {
    throw new HttpError(409, ERR_EMAIL_EXISTS);
  }

  const passwordHash = await bcrypt.hash(initialPassword as string, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      name: name as string,
      email: email as string,
      role: role as UserWriteInput['role'],
      isActive,
      mustChangePassword: true,
      passwordHash,
    },
  });
  return toUserShape(user);
}

// §9.3 — partial update of name/email/role/isActive. `actorId` is the
// authenticated Administrator's id taken from the SERVER-SIDE session — never
// from the request body (BR-03 identity rule). Guards evaluated against fresh
// DB state so concurrent admin edits behave correctly:
//   - self-deactivation → 409 (the actor's own row cannot be deactivated);
//   - deactivating the sole remaining active Administrator → 409;
//   - re-roling the sole remaining active Administrator away from ADMIN → 409.
// Deactivation replaces deletion — no DELETE route exists in Lab 3 (BR-18).
export async function updateUser(
  prisma: PrismaClient,
  id: number,
  body: unknown,
  actorId: number,
): Promise<ReturnType<typeof toUserShape>> {
  const data = (typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body
    : {}) as Record<string, unknown>;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new HttpError(404, ERR_USER_NOT_FOUND);
  }

  const issues: { field: string; message: string }[] = [];
  let name: string | undefined;
  let email: string | undefined;
  let role: UserWriteInput['role'] | undefined;
  let isActive: boolean | undefined;

  if (data.name !== undefined) {
    name = validateNameField(data.name, issues);
  }
  if (data.email !== undefined) {
    email = validateEmailField(data.email, issues);
  }
  if (data.role !== undefined) {
    role = validateRoleField(data.role, issues);
  }
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== 'boolean') {
      issues.push({ field: 'isActive', message: 'isActive must be a boolean' });
    } else {
      isActive = data.isActive;
    }
  }

  if (issues.length > 0) throw new HttpError(400, 'Validation failed', issues);

  if (name === undefined && email === undefined && role === undefined && isActive === undefined) {
    throw new HttpError(400, 'Validation failed', [
      {
        field: 'body',
        message: 'At least one of name, email, role, isActive is required',
      },
    ]);
  }

  // Duplicate email excluding self (BR-10, case-insensitive).
  if (email !== undefined && email !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== target.id) {
      throw new HttpError(409, ERR_EMAIL_EXISTS);
    }
  }

  // Self-deactivation guard (BR-18): identity comes from the session actor,
  // so a client cannot spoof it by omitting or forging body fields.
  if (isActive === false && actorId === target.id) {
    throw new HttpError(409, ERR_SELF_DEACTIVATE);
  }

  const deactivatingTarget = isActive === false && target.isActive;

  if (deactivatingTarget || (role !== undefined && role !== 'ADMINISTRATOR' && target.role === 'ADMINISTRATOR')) {
    const activeAdminCount = await prisma.user.count({
      where: { role: 'ADMINISTRATOR', isActive: true },
    });
    const targetIsLastActiveAdmin =
      target.role === 'ADMINISTRATOR' && target.isActive && activeAdminCount === 1;

    if (deactivatingTarget && targetIsLastActiveAdmin) {
      throw new HttpError(409, ERR_LAST_ADMIN_DEACTIVATE);
    }
    if (
      role !== undefined &&
      role !== 'ADMINISTRATOR' &&
      target.role === 'ADMINISTRATOR' &&
      targetIsLastActiveAdmin
    ) {
      throw new HttpError(409, ERR_LAST_ADMIN_REASSIGN);
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });
  return toUserShape(updated);
}

// §9.4 — issue a new initial password: sets mustChangePassword=true so the
// target must change it at next login (BR-18). Self-reset is allowed; the
// response never includes any password material.
export async function setUserInitialPassword(
  prisma: PrismaClient,
  id: number,
  body: unknown,
): Promise<{ id: number; email: string; mustChangePassword: boolean; updatedAt: Date }> {
  const data = (typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body
    : {}) as Record<string, unknown>;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new HttpError(404, ERR_USER_NOT_FOUND);
  }

  const issues: { field: string; message: string }[] = [];
  const initialPassword = validateInitialPasswordField(data.initialPassword, issues);
  if (issues.length > 0) throw new HttpError(400, 'Validation failed', issues);

  const passwordHash = await bcrypt.hash(initialPassword as string, BCRYPT_COST);
  const updated = await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true },
  });
  return {
    id: updated.id,
    email: updated.email,
    mustChangePassword: updated.mustChangePassword,
    updatedAt: updated.updatedAt,
  };
}
