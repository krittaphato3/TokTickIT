import type { PrismaClient, Priority, Status } from '@prisma/client';
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

const SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'priority',
  'ticketNumber',
] as const;
type SortField = (typeof SORT_FIELDS)[number];
const SORT_DIRECTIONS = ['asc', 'desc'] as const;
// Issue #30 — extended status axis (BR-21). NEW is kept first so the create
// default remains the enum's origin; POST /api/tickets still writes NEW.
export const STATUSES = [
  'NEW',
  'OPEN',
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED',
] as const;

// UT-03 — normalizes the search query param: trim + lowercase, or null when
// absent/blank so the list query carries no search filter at all.
export function normalizeSearchTerm(term: string | null | undefined): string | null {
  if (typeof term !== 'string') return null;
  const trimmed = term.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// The trimmed term becomes an ILIKE pattern, so the SQL wildcards (% and _)
// and the backslash escape character itself are prefixed with "\" to match
// as literal text (BR-07). Both the page query and the count query use this
// exact pattern so rows and totalItems can never diverge.
export function buildIlikePattern(term: string | null | undefined): string | null {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return null;
  return `%${normalized.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// Prisma WHERE fragment for BR-07 (extended in Issue #30): case-insensitive
// substring over ticketNumber OR title OR description with the same wildcard
// escaping as the raw page query (Prisma's contains has no ESCAPE support, so
// the fragment is written as raw SQL). Returns null when there is no
// effective search term.
export function buildSearchFilter(
  term: string | null | undefined,
): Prisma.Sql | null {
  const pattern = buildIlikePattern(term);
  if (!pattern) return null;
  return Prisma.sql` AND (
    t."ticketNumber" ILIKE ${pattern}
    OR t."title" ILIKE ${pattern}
    OR COALESCE(t."description", '') ILIKE ${pattern}
  )`;
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
  requester: { id: number; name: string },
  body: unknown,
) {
  const requesterId = requester.id;
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
      include: { category: true, relatedSystem: true, requester: true },
    });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      itPriority: ticket.itPriority,
      ownerName: ticket.ownerName,
      owner: null,
      requester: { id: ticket.requester.id, name: ticket.requester.name, email: ticket.requester.email },
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

  // Issue #30 (BR-20) — IT Priority filter: exact enum match on the stored
  // itPriority; never falls back to the requested priority. Absent or empty
  // means "no filter".
  const rawItPriority = query.itPriority as string | undefined;
  let itPriority: Priority | undefined;
  if (rawItPriority !== undefined && rawItPriority !== '') {
    if (!(PRIORITIES as readonly string[]).includes(rawItPriority)) {
      throw new HttpError(
        400,
        'itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL',
      );
    }
    itPriority = rawItPriority as Priority;
  }

  // Issue #30 (BR-21) — extended status filter over the full Status enum.
  const rawStatus = query.status as string | undefined;
  let status: Status | undefined;
  if (rawStatus !== undefined && rawStatus !== '') {
    if (!(STATUSES as readonly string[]).includes(rawStatus)) {
      throw new HttpError(
        400,
        'status must be one of NEW, OPEN, PENDING, IN_PROGRESS, RESOLVED',
      );
    }
    status = rawStatus as Status;
  }

  const rawSortBy = query.sortBy as string | undefined;
  if (rawSortBy !== undefined && !(SORT_FIELDS as readonly string[]).includes(rawSortBy)) {
    throw new HttpError(
      400,
      'sortBy must be one of createdAt, updatedAt, title, priority, ticketNumber',
    );
  }

  const rawSortDir = query.sortDir as string | undefined;
  if (rawSortDir !== undefined && !(SORT_DIRECTIONS as readonly string[]).includes(rawSortDir)) {
    throw new HttpError(400, 'sortDir must be asc or desc');
  }

  return { page, pageSize, itPriority, status };
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
  const { page, pageSize, itPriority, status } = validateListParams(query);

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

  // One shared ILIKE condition for both the page query and the count, built
  // by buildSearchFilter with identical wildcard escaping (BR-07), so data
  // rows and totalItems always agree even for terms like "%" or "_".
  const searchCondition =
    buildSearchFilter(query.search as string | undefined) ?? Prisma.empty;

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

  // Issue #30 — v2 filters (BR-20/21). Exact enum matches that AND-combine
  // with search/category/priority; itPriority never falls back to the
  // requested priority.
  const itPriorityCondition =
    itPriority === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."itPriority"::text = ${itPriority}`;
  const statusCondition =
    status === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."status"::text = ${status}`;

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
        : sortBy === 'ticketNumber'
          ? Prisma.sql`t."ticketNumber"`
          : sortBy === 'updatedAt'
            ? Prisma.sql`t."updatedAt"`
            : Prisma.sql`t."createdAt"`;

  // The page-id selection and the count share the identical WHERE fragments
  // and read one consistent snapshot; a failure inside the transaction
  // surfaces as the generic safe-500 (API-20).
  const [pageIds, totalItems] = await prisma.$transaction([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT t.id
      FROM "Ticket" AS t
      WHERE t."requesterId" = ${requesterId}${searchCondition}${categoryCondition}${priorityCondition}${itPriorityCondition}${statusCondition}
      ORDER BY ${rankColumn} ${directionSql}, t."createdAt" DESC, t.id DESC
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Ticket" AS t
      WHERE t."requesterId" = ${requesterId}${searchCondition}${categoryCondition}${priorityCondition}${itPriorityCondition}${statusCondition}
    `,
  ]).then(
    ([rows, counted]) =>
      [rows.map((row) => row.id), Number(counted[0].count)] as const,
  );

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
      itPriority: ticket.itPriority,
      ownerName: ticket.ownerName,
      owner: ticket.ownerName ? { name: ticket.ownerName } : null,
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

export async function getTicketDetail(
  prisma: PrismaClient,
  requesterId: number,
  ticketNumber: string,
) {
  if (!/^TTK-\d{4}-\d{6}$/.test(ticketNumber)) {
    throw new HttpError(400, 'Invalid ticket number format');
  }
  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    include: { category: true, relatedSystem: true, requester: true, attachments: { where: { removedAt: null } } },
  });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  if (ticket.requesterId !== requesterId) {
    throw new HttpError(403, `Ticket ${ticketNumber} does not belong to this requester`);
  }
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    itPriority: ticket.itPriority,
    ownerName: ticket.ownerName,
    owner: ticket.ownerName ? { name: ticket.ownerName } : null,
    category: { id: ticket.category.id, name: ticket.category.name },
    requester: { id: ticket.requester.id, name: ticket.requester.name, email: ticket.requester.email },
    relatedSystem: ticket.relatedSystem
      ? { id: ticket.relatedSystem.id, name: ticket.relatedSystem.name }
      : null,
    attachments: ticket.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
      removedAt: a.removedAt,
    })),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}