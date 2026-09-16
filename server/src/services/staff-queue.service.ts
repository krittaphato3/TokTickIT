import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { HttpError, buildSearchFilter } from './ticket.service.js';

// Lab 3 §5 — IT Staff Ticket Queue (api-spec §5.1). Cross-ticket read surface
// for IT_STAFF and ADMINISTRATOR (authorization matrix §12). Read-only: this
// issue ships no operational edits. Internal Notes are never included in queue
// rows (BR-04) — the row shape is exactly the api-spec §5.1 projection.

// BR-15 status axis. Legacy interim note: the DB enum still carries the Lab 2
// PENDING value until the data-migration issue repoints it to
// WAITING_FOR_REQUESTER; PENDING rows simply never match a queue status filter
// value from the Lab 3 set.
export const STAFF_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const;

const QUEUE_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'number'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

const MIN_PAGE = 1;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function parseIntegerParam(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined) return null;
  return /^-?\d+$/.test(raw) ? Number(raw) : 'invalid';
}

export interface StaffQueueParams {
  page: number;
  pageSize: number;
  status?: string;
  categoryId?: number;
  reqPriority?: string;
  itPriority?: string;
  ownerId?: number;
  assigned?: boolean;
  sort: string;
  order: string;
  q?: string;
}

// Validates the queue query params per api-spec §5.1. Every violation is a
// 400 whose message names the offending field (no details array — one rule,
// one message, exactly as documented).
export function validateStaffQueueParams(query: Record<string, unknown>): StaffQueueParams {
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
    throw new HttpError(400, 'pageSize must be between 1 and 100');
  }
  const pageSize = pageSizeResult ?? DEFAULT_PAGE_SIZE;

  const rawStatus = query.status as string | undefined;
  let status: string | undefined;
  if (rawStatus !== undefined && rawStatus !== '') {
    if (!(STAFF_STATUSES as readonly string[]).includes(rawStatus)) {
      throw new HttpError(
        400,
        `status must be one of ${STAFF_STATUSES.join(', ')}`,
      );
    }
    status = rawStatus;
  }

  const rawReqPriority = query.reqPriority as string | undefined;
  let reqPriority: string | undefined;
  if (rawReqPriority !== undefined && rawReqPriority !== '') {
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(rawReqPriority)) {
      throw new HttpError(
        400,
        'reqPriority must be one of LOW, MEDIUM, HIGH, CRITICAL',
      );
    }
    reqPriority = rawReqPriority;
  }

  const rawItPriority = query.itPriority as string | undefined;
  let itPriority: string | undefined;
  if (rawItPriority !== undefined && rawItPriority !== '') {
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(rawItPriority)) {
      throw new HttpError(
        400,
        'itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL',
      );
    }
    itPriority = rawItPriority;
  }

  let categoryId: number | undefined;
  const rawCategoryId = query.categoryId as string | undefined;
  if (rawCategoryId !== undefined && rawCategoryId !== '') {
    const parsed = parseIntegerParam(rawCategoryId);
    if (parsed === 'invalid') {
      throw new HttpError(400, 'categoryId must be an integer');
    }
    categoryId = parsed as number;
  }

  let ownerId: number | undefined;
  const rawOwnerId = query.ownerId as string | undefined;
  if (rawOwnerId !== undefined && rawOwnerId !== '') {
    const parsed = parseIntegerParam(rawOwnerId);
    if (parsed === 'invalid') {
      throw new HttpError(400, 'ownerId must be an integer');
    }
    ownerId = parsed as number;
  }

  let assigned: boolean | undefined;
  const rawAssigned = query.assigned as string | undefined;
  if (rawAssigned !== undefined && rawAssigned !== '') {
    if (rawAssigned === 'true') assigned = true;
    else if (rawAssigned === 'false') assigned = false;
    else throw new HttpError(400, 'assigned must be true or false');
  }

  // Contradictory pairing per api-spec §5.1: a concrete owner and
  // assigned=false cannot both apply.
  if (ownerId !== undefined && assigned === false) {
    throw new HttpError(
      400,
      'ownerId and assigned=false are contradictory; omit one',
    );
  }

  const rawSort = query.sort as string | undefined;
  let sort = 'createdAt';
  if (rawSort !== undefined && rawSort !== '') {
    if (!(QUEUE_SORT_FIELDS as readonly string[]).includes(rawSort)) {
      throw new HttpError(
        400,
        `sort must be one of ${QUEUE_SORT_FIELDS.join(', ')}`,
      );
    }
    sort = rawSort;
  }

  const rawOrder = query.order as string | undefined;
  let order = 'desc';
  if (rawOrder !== undefined && rawOrder !== '') {
    if (!(SORT_DIRECTIONS as readonly string[]).includes(rawOrder)) {
      throw new HttpError(400, 'order must be asc or desc');
    }
    order = rawOrder;
  }

  const q = typeof query.q === 'string' ? query.q : undefined;

  return {
    page,
    pageSize,
    status,
    categoryId,
    reqPriority,
    itPriority,
    ownerId,
    assigned,
    sort,
    order,
    q,
  };
}

// Priority ordering never sorts by the enum label: effective rank is
// itPriority ?? requested priority (BR-19), Critical 4 > High 3 > Medium 2 >
// Low 1. Written as raw SQL so the COALESCE lives next to the data.
function priorityRankSql(): Prisma.Sql {
  return Prisma.sql`CASE COALESCE(t."itPriority", t."priority")
      WHEN 'LOW' THEN 1
      WHEN 'MEDIUM' THEN 2
      WHEN 'HIGH' THEN 3
      WHEN 'CRITICAL' THEN 4
      ELSE 0
    END`;
}

// GET /api/staff/tickets. All supplied criteria AND-combine; the page-id
// query and the count query share identical WHERE fragments so rows and
// totalItems can never diverge (same pattern as the requester list).
export async function listStaffTickets(
  prisma: PrismaClient,
  query: Record<string, unknown>,
) {
  const params = validateStaffQueueParams(query);

  // Existence checks for reference filters (client errors, not empty sets).
  if (params.categoryId !== undefined) {
    const exists = await prisma.category.findUnique({
      where: { id: params.categoryId },
    });
    if (!exists) {
      throw new HttpError(
        400,
        'categoryId does not reference an existing category',
      );
    }
  }
  if (params.ownerId !== undefined) {
    const owner = await prisma.user.findUnique({ where: { id: params.ownerId } });
    if (
      !owner ||
      !owner.isActive ||
      !(owner.role === 'IT_STAFF' || owner.role === 'ADMINISTRATOR')
    ) {
      throw new HttpError(
        400,
        'ownerId does not reference an active IT Staff or Administrator',
      );
    }
  }

  const searchCondition = buildSearchFilter(params.q) ?? Prisma.empty;
  const statusCondition =
    params.status === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."status"::text = ${params.status}`;
  const categoryCondition =
    params.categoryId === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."categoryId" = ${params.categoryId}`;
  const reqPriorityCondition =
    params.reqPriority === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."priority"::text = ${params.reqPriority}`;
  const itPriorityCondition =
    params.itPriority === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."itPriority"::text = ${params.itPriority}`;
  const ownerCondition =
    params.ownerId === undefined
      ? Prisma.empty
      : Prisma.sql` AND t."ownerId" = ${params.ownerId}`;
  const assignedCondition =
    params.assigned === undefined
      ? Prisma.empty
      : params.assigned
        ? Prisma.sql` AND t."ownerId" IS NOT NULL`
        : Prisma.sql` AND t."ownerId" IS NULL`;

  const rankColumn =
    params.sort === 'priority'
      ? priorityRankSql()
      : params.sort === 'number'
        ? Prisma.sql`t."ticketNumber"`
        : params.sort === 'updatedAt'
          ? Prisma.sql`t."updatedAt"`
          : Prisma.sql`t."createdAt"`;
  const directionSql = params.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const [pageIds, totalItems] = await prisma
    .$transaction([
      prisma.$queryRaw<{ id: number }[]>`
        SELECT t.id
        FROM "Ticket" AS t
        WHERE TRUE${searchCondition}${statusCondition}${categoryCondition}${reqPriorityCondition}${itPriorityCondition}${ownerCondition}${assignedCondition}
        ORDER BY ${rankColumn} ${directionSql}, t."createdAt" DESC, t.id DESC
        LIMIT ${params.pageSize}
        OFFSET ${(params.page - 1) * params.pageSize}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Ticket" AS t
        WHERE TRUE${searchCondition}${statusCondition}${categoryCondition}${reqPriorityCondition}${itPriorityCondition}${ownerCondition}${assignedCondition}
      `,
    ])
    .then(
      ([rows, counted]) =>
        [rows.map((row) => row.id), Number(counted[0].count)] as const,
    );

  const tickets =
    pageIds.length === 0
      ? []
      : (
          await prisma.ticket.findMany({
            where: { id: { in: pageIds } },
            include: { owner: true, requester: true, category: true },
          })
        ).sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));

  const totalPages = Math.ceil(totalItems / params.pageSize);

  return {
    data: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      itPriority: t.itPriority,
      owner: t.owner
        ? { id: t.owner.id, name: t.owner.name, email: t.owner.email }
        : null,
      requester: { id: t.requester.id, name: t.requester.name, email: t.requester.email },
      category: { id: t.category.id, name: t.category.name },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1 && totalItems > 0,
    },
  };
}

// GET /api/staff/owners — eligible owners for the queue Owner filter and the
// later claim/reassign flows: active IT_STAFF and ADMINISTRATOR users only
// (BR-12). Requesters and inactive users are never listed.
export async function listQueueOwners(prisma: PrismaClient) {
  const owners = await prisma.user.findMany({
    where: { role: { in: ['IT_STAFF', 'ADMINISTRATOR'] }, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });
  return owners;
}
