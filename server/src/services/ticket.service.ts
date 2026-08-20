import type { PrismaClient, Priority } from '@prisma/client';

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

  // relatedSystemId — optional; null when omitted.
  const rawSystemId = data.relatedSystemId;
  let relatedSystemId: number | null = null;
  if (rawSystemId !== undefined && rawSystemId !== null) {
    if (typeof rawSystemId !== 'number' || !Number.isInteger(rawSystemId)) {
      issues.push({
        field: 'relatedSystemId',
        message: 'Related system must be an integer',
      });
    } else {
      relatedSystemId = rawSystemId;
    }
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

    if (relatedSystemId !== null) {
      const system = await tx.relatedSystem.findUnique({
        where: { id: relatedSystemId },
      });
      if (!system) {
        throw new HttpError(400, 'Validation failed', [
          {
            field: 'relatedSystemId',
            message: 'Related system does not exist',
          },
        ]);
      }
    }

    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('ticket_number_seq')
    `;
    const ticketNumber = `TTK-${new Date().getFullYear()}-${String(
      nextval,
    ).padStart(6, '0')}`;

    const ticket = await tx.ticket.create({
      data: {
        ticketNumber,
        title,
        description,
        priority: priority as Priority,
        requesterId,
        categoryId: categoryId as number,
        systemId: relatedSystemId,
      },
      include: { category: true, system: true },
    });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: { id: ticket.category.id, name: ticket.category.name },
      relatedSystem: ticket.system
        ? { id: ticket.system.id, name: ticket.system.name }
        : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  });
}