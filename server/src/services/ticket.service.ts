import type { PrismaClient, Priority } from '@prisma/client';
import { Prisma } from '@prisma/client';

// HTTP error carrying a status code, a safe message, and optional field-level
// validation details. Thrown by route handlers/services and translated into a
// JSON error envelope by the app-level error middleware (Issue 4).
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const MEDIUM_PRIORITY = 'MEDIUM';
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;

// BR-09 — priority sorts by rank (Critical 4 > High 3 > Medium 2 > Low 1),
// not by the alphabetical order of the enum labels.
export const PRIORITY_RANK: Record<(typeof PRIORITIES)[number], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// In-memory comparator ordering tickets highest priority first
// (Critical > High > Medium > Low); the SQL layer orders by the CASE mapping
// of this same table (see listTickets).
export function compareByPriority(
  a: { priority: string },
  b: { priority: string },
): number {
  return (
    (PRIORITY_RANK[b.priority as (typeof PRIORITIES)[number]] ?? 0) -
    (PRIORITY_RANK[a.priority as (typeof PRIORITIES)[number]] ?? 0)
  );
}

const SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'priority'] as const;
type SortField = (typeof SORT_FIELDS)[number];
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

// UT-03 — normalizes the search query param: trim + lowercase, or null when
// absent/blank so the list query carries no search filter at all.
export function normalizeSearchTerm(term: string | null | undefined): string | null {
  if (typeof term !== 'string') return null;
  const trimmed = term.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// Prisma WHERE fragment for BR-07: case-insensitive substring over title OR
// description (Prisma contains is case-sensitive on PostgreSQL without
// mode: 'insensitive'). Returns null when there is no effective search term.
export function buildSearchFilter(term: string | null | undefined) {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return null;
  return {
    OR: [
      { title: { contains: normalized, mode: 'insensitive' as const } },
      { description: { contains: normalized, mode: 'insensitive' as const } },
    ],
  };
}

// Formats the next value of the dedicated ticket_number_seq into the
// labsheet ticket-number format: TTK-<current year>-<6 zero-padded digits>.
export function buildTicketNumber(sequenceValue: bigint | number): string {
  return `TTK-${new Date().getFullYear()}-${String(sequenceValue).padStart(
    6,
    '0',
  )}`;
}

// Resolves the Development Requester from the X-Dev-Requester-Id header.
// Missing/malformed -> 400; unknown id -> 401; inactive -> 403.
export async function resolveRequester(
  prisma: PrismaClient,
  header: string | undefined,
) {
  // Bound the id to Int32-safe digits so an oversized header is rejected as
  // malformed (400) instead of falling through to a generic 500 from Prisma.
  if (!header || !/^\d{1,9}$/.test(header)) {
    throw new HttpError(400, 'Missing or invalid X-Dev-Requester-Id header');
  }

  const requester = await prisma.requester.findUnique({
    where: { id: Number(header) },
  });

  if (!requester) {
    throw new HttpError(401, 'Unknown development requester');
  }

  if (!requester.isActive) {
    throw new HttpError(403, 'Requester account is inactive');
  }

  return requester;
}

// Validates the create-ticket body, then atomically verifies the referenced
// category/related system and creates the ticket inside a transaction. The
// requester id is asserted server-side (FR-14) and is never returned.
export async function createTicket(
  prisma: PrismaClient,
  requesterId: number,
  body: unknown,
) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid JSON body');
  }
  const data = body as Record<string, unknown>;
  const issues: { field: string; message: string }[] = [];

  // title — required, trimmed, 1..120 characters.
  const rawTitle = data.title;
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    issues.push({ field: 'title', message: 'Title is required' });
  } else if (title.length > MAX_TITLE_LENGTH) {
    issues.push({
      field: 'title',
      message: 'Title must be 120 characters or fewer',
    });
  }

  // description — optional; non-string values are rejected rather than
  // silently dropped (BR-11 server-side revalidation).
  const rawDescription = data.description;
  let description: string | null = null;
  if (rawDescription !== undefined && rawDescription !== null) {
    if (typeof rawDescription !== 'string') {
      issues.push({
        field: 'description',
        message: 'Description must be a string',
      });
    } else if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
      issues.push({
        field: 'description',
        message: 'Description must be 4000 characters or fewer',
      });
    } else {
      description = rawDescription;
    }
  }

  // categoryId — required, must be an integer.
  const rawCategoryId = data.categoryId;
  let categoryId: number | null = null;
  if (rawCategoryId === undefined || rawCategoryId === null) {
    issues.push({ field: 'categoryId', message: 'Category is required' });
  } else if (
    typeof rawCategoryId !== 'number' ||
    !Number.isInteger(rawCategoryId)
  ) {
    issues.push({ field: 'categoryId', message: 'Category must be an integer' });
  } else {
    categoryId = rawCategoryId;
  }

  // priority — optional; defaults to MEDIUM.
  const rawPriority = data.priority;
  let priority = MEDIUM_PRIORITY;
  if (rawPriority !== undefined && rawPriority !== null) {
    if (
      typeof rawPriority !== 'string' ||
      !(PRIORITIES as readonly string[]).includes(rawPriority)
    ) {
      issues.push({
        field: 'priority',
        message: 'Priority must be one of LOW, MEDIUM, HIGH, CRITICAL',
      });
    } else {
      priority = rawPriority;
    }
  }

  // relatedSystemId — required, must be an integer (labsheet 4.4 / 5.1 / 6;
  // every ticket references an existing related system).
  const rawSystemId = data.relatedSystemId;
  let relatedSystemId: number | null = null;
  if (rawSystemId === undefined || rawSystemId === null) {
    issues.push({
      field: 'relatedSystemId',
      message: 'Related system is required',
    });
  } else if (typeof rawSystemId !== 'number' || !Number.isInteger(rawSystemId)) {
    issues.push({
      field: 'relatedSystemId',
      message: 'Related system must be an integer',
    });
  } else {
    relatedSystemId = rawSystemId;
  }

  if (issues.length > 0) {
    throw new HttpError(400, 'Validation failed', issues);
  }

  return await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id: categoryId as number },
    });
    if (!category) {
      throw new HttpError(400, 'Validation failed', [
        { field: 'categoryId', message: 'Category does not exist' },
      ]);
    }

    const system = await tx.relatedSystem.findUnique({
      where: { id: relatedSystemId as number },
    });
    if (!system) {
      throw new HttpError(400, 'Validation failed', [
        {
          field: 'relatedSystemId',
          message: 'Related system does not exist',
        },
      ]);
    }

    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('ticket_number_seq')
    `;
    const ticketNumber = buildTicketNumber(nextval);

    const ticket = await tx.ticket.create({
      data: {
        ticketNumber,
        title,
        description,
        priority: priority as Priority,
        requesterId,
        categoryId: categoryId as number,
        relatedSystemId: relatedSystemId as number,
      },
      include: { category: true, relatedSystem: true },
    });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: { id: ticket.category.id, name: ticket.category.name },
      relatedSystem: ticket.relatedSystem
        ? { id: ticket.relatedSystem.id, name: ticket.relatedSystem.name }
        : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  });
}

const MIN_PAGE = 1;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;

function parseIntegerParam(
  raw: string | undefined,
): number | null | 'invalid' {
  if (raw === undefined) return null;
  return /^-?\d+$/.test(raw) ? Number(raw) : 'invalid';
}

// Validates the list query params per api-spec §3.2. Throws a plain HttpError
// (no details array — each rule has its own dedicated message).
export function validateListParams(query: Record<string, unknown>) {
  const pageResult = parseIntegerParam(query.page as string | undefined);
  if (pageResult === 'invalid' || (pageResult !== null && pageResult < MIN_PAGE)) {
    throw new HttpError(400, 'page must be an integer >= 1');
  }
  const page = pageResult ?? MIN_PAGE;

  const pageSizeResult = parseIntegerParam(query.pageSize as string | undefined);
  if (
    pageSizeResult === 'invalid' ||
    (pageSizeResult !== null &&
      (pageSizeResult < 1 || pageSizeResult > MAX_PAGE_SIZE))
  ) {
    throw new HttpError(400, 'pageSize must be between 1 and 50');
  }
  const pageSize = pageSizeResult ?? DEFAULT_PAGE_SIZE;

  const rawPriority = query.priority as string | undefined;
  let priority: Priority | undefined;
  if (rawPriority !== undefined && rawPriority !== '') {
    if (!(PRIORITIES as readonly string[]).includes(rawPriority)) {
      throw new HttpError(
        400,
        'priority must be one of LOW, MEDIUM, HIGH, CRITICAL',
      );
    }
    priority = rawPriority as Priority;
  }

  const rawSortBy = query.sortBy as string | undefined;
  if (rawSortBy !== undefined && !(SORT_FIELDS as readonly string[]).includes(rawSortBy)) {
    throw new HttpError(
      400,
      'sortBy must be one of createdAt, updatedAt, title, priority',
    );
  }

  const rawSortDir = query.sortDir as string | undefined;
  if (rawSortDir !== undefined && !(SORT_DIRECTIONS as readonly string[]).includes(rawSortDir)) {
    throw new HttpError(400, 'sortDir must be asc or desc');
  }

  return { page, pageSize };
}

// GET /api/tickets (api-spec §3.2). The base query is always scoped to the
// active requester (BR-06); search/category/priority combine with AND
// (BR-07/08); priority orders by rank with createdAt desc as tie-break
// (BR-09); pagination metadata is computed for the filtered set (BR-10).
export async function listTickets(
  prisma: PrismaClient,
  requesterId: number,
  query: Record<string, unknown>,
) {
  const { page, pageSize } = validateListParams(query);

  const categoryIdRaw = query.categoryId as string | undefined;
  let categoryIdFilter: number | null = null;
  if (categoryIdRaw !== undefined && categoryIdRaw !== '') {
    if (!/^-?\d+$/.test(categoryIdRaw)) {
      throw new HttpError(
        400,
        'categoryId does not reference an existing category',
      );
    }
    const id = Number(categoryIdRaw);
    // Existence is checked inside the same transaction-free flow; an unknown
    // category is a client error (400), not an empty result.
    const exists = await prisma.category.findUnique({ where: { id } });
    if (!exists) {
      throw new HttpError(
        400,
        'categoryId does not reference an existing category',
      );
    }
    categoryIdFilter = id;
  }

  const searchTerm = normalizeSearchTerm(query.search as string | undefined);
  // ILIKE patterns are escaped so % and _ in the term are literals (BR-07).
  const searchCondition =
    searchTerm === null
      ? Prisma.empty
      : Prisma.sql` AND (
          t."title" ILIKE ${`%${searchTerm.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}
          OR COALESCE(t."description", '') ILIKE ${`%${searchTerm.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}
        )`;

  const where = {
    requesterId,
    ...(buildSearchFilter(query.search as string | undefined) ?? {}),
    ...(categoryIdFilter !== null ? { categoryId: categoryIdFilter } : {}),
    ...(typeof query.priority === 'string' && query.priority !== ''
      ? { priority: query.priority as Priority }
      : {}),
  };

  // Filter conditions are composed as typed fragments because a literal NULL
  // parameter cannot be typed by PostgreSQL (42P18) and every value here has
  // already passed validateListParams / the category existence check.
  const categoryCondition =
    categoryIdFilter === null
      ? Prisma.empty
      : Prisma.sql` AND t."categoryId" = ${categoryIdFilter}`;
  const priorityValue =
    typeof query.priority === 'string' && query.priority !== ''
      ? query.priority
      : null;
  const priorityCondition =
    priorityValue === null
      ? Prisma.empty
      : Prisma.sql` AND t."priority"::text = ${priorityValue}`;

  const sortBy = ((query.sortBy as SortField | undefined) ?? 'createdAt') as SortField;
  const directionSql = query.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  // Priority never sorts by its enum label: a CASE expression maps it to the
  // BR-09 rank so Critical > High > Medium > Low in both directions. Every
  // ordering carries (created_at desc, id desc) tie-breakers so equal keys
  // stay deterministic across pages. Page ids come from one parameterized
  // query, then the rows are hydrated through Prisma with their
  // category/related-system relations.
  const rankColumn =
    sortBy === 'priority'
      ? Prisma.sql`CASE t."priority"
            WHEN 'LOW' THEN 1
            WHEN 'MEDIUM' THEN 2
            WHEN 'HIGH' THEN 3
            WHEN 'CRITICAL' THEN 4
            ELSE 0
          END`
      : sortBy === 'title'
        ? Prisma.sql`t."title"`
        : sortBy === 'updatedAt'
          ? Prisma.sql`t."updatedAt"`
          : Prisma.sql`t."createdAt"`;

  // The page-id selection and the count read one consistent snapshot; a
  // failure inside the transaction surfaces as the generic safe-500 (API-20).
  const [pageIds, totalItems] = await prisma.$transaction([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT t.id
      FROM "Ticket" AS t
      WHERE t."requesterId" = ${requesterId}${searchCondition}${categoryCondition}${priorityCondition}
      ORDER BY ${rankColumn} ${directionSql}, t."createdAt" DESC, t.id DESC
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,
    prisma.ticket.count({ where }),
  ]).then(([rows, count]) => [rows.map((row) => row.id), count] as const);

  const tickets =
    pageIds.length === 0
      ? []
      : (
          await prisma.ticket.findMany({
            where: { requesterId, id: { in: pageIds } },
            include: { category: true, relatedSystem: true },
          })
        ).sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    data: tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: { id: ticket.category.id, name: ticket.category.name },
      relatedSystem: ticket.relatedSystem
        ? { id: ticket.relatedSystem.id, name: ticket.relatedSystem.name }
        : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    })),
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1 && totalItems > 0,
    },
  };
}