import type { PrismaClient } from '@prisma/client';
import { HttpError, resolveSessionRequester } from './ticket.service.js';

// ---------------------------------------------------------------------------
// Lab 4 — Role Dashboards (api-spec §4, FR-08/FR-09/FR-10, BR-12/BR-13/BR-16).
// ---------------------------------------------------------------------------

export interface DashboardUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const ACTIVE_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'REOPENED',
] as const;

export const ALL_STAFF_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const;

export const IT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export async function getRequesterDashboard(
  prisma: PrismaClient,
  user: DashboardUser,
  query: Record<string, unknown>,
) {
  if (Object.keys(query).length > 0) {
    throw new HttpError(400, 'Unknown query parameters', undefined, 'VALIDATION');
  }
  if (user.role !== 'REQUESTER') {
    throw new HttpError(403, 'Only requesters may access the requester dashboard', undefined, 'FORBIDDEN');
  }

  // Resolve linked requester using shared session requester resolver
  const requester = await resolveSessionRequester(prisma, {
    ...user,
    isActive: true,
  });

  const requesterId = requester.id;

  const [activeCount, waitingCount, resolvedCount, closedCount, recentlyUpdated, recentlyResolved] =
    await Promise.all([
      prisma.ticket.count({
        where: {
          requesterId,
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      prisma.ticket.count({
        where: {
          requesterId,
          status: 'WAITING_FOR_REQUESTER',
        },
      }),
      prisma.ticket.count({
        where: {
          requesterId,
          status: 'RESOLVED',
        },
      }),
      prisma.ticket.count({
        where: {
          requesterId,
          status: 'CLOSED',
        },
      }),
      prisma.ticket.findMany({
        where: { requesterId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.ticket.findMany({
        where: { requesterId, status: 'RESOLVED' },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      }),
    ]);

  return {
    activeCount,
    waitingForRequesterCount: waitingCount,
    resolvedCount,
    closedCount,
    recentlyUpdated: recentlyUpdated.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.title,
      status: t.status,
      updatedAt: t.updatedAt.toISOString(),
    })),
    recentlyResolved: recentlyResolved.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.title,
      status: t.status,
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

export async function getStaffDashboard(
  prisma: PrismaClient,
  user: DashboardUser,
  query: Record<string, unknown>,
) {
  if (Object.keys(query).length > 0) {
    throw new HttpError(400, 'Unknown query parameters', undefined, 'VALIDATION');
  }
  if (user.role !== 'IT_STAFF' && user.role !== 'ADMINISTRATOR' && user.role !== 'ADMIN') {
    throw new HttpError(403, 'Only staff and administrators may access the staff dashboard', undefined, 'FORBIDDEN');
  }

  // 1. countsByStatus over all tickets
  const statusGroups = await prisma.ticket.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  const countsByStatus: Record<string, number> = {};
  for (const s of ALL_STAFF_STATUSES) {
    countsByStatus[s] = 0;
  }
  for (const g of statusGroups) {
    if (g.status in countsByStatus) {
      countsByStatus[g.status] = g._count.status;
    }
  }

  // 2. unassignedActiveCount & myActiveOwnedCount
  const [unassignedActiveCount, myActiveOwnedCount] = await Promise.all([
    prisma.ticket.count({
      where: {
        ownerId: null,
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),
    prisma.ticket.count({
      where: {
        ownerId: user.id,
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),
  ]);

  // 3. countsByItPriority over active tickets that have itPriority set
  const priorityGroups = await prisma.ticket.groupBy({
    by: ['itPriority'],
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      itPriority: { not: null },
    },
    _count: { itPriority: true },
  });
  const countsByItPriority: Record<string, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const g of priorityGroups) {
    if (g.itPriority && g.itPriority in countsByItPriority) {
      countsByItPriority[g.itPriority] = g._count.itPriority;
    }
  }

  // 4. recentlyUpdated: Active tickets, all owners, latest 5 by updatedAt descending
  const recentlyUpdated = await prisma.ticket.findMany({
    where: { status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 5,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      owner: { select: { id: true, name: true } },
      updatedAt: true,
    },
  });

  // 5. myRecentActions: Actions with performedById = session user, latest 5 by createdAt descending
  const myRecentActions = await prisma.actionTaken.findMany({
    where: { performedById: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 5,
    select: {
      id: true,
      ticketId: true,
      ticket: { select: { ticketNumber: true } },
      description: true,
      actionAt: true,
    },
  });

  const responsePayload: Record<string, unknown> = {
    countsByStatus,
    unassignedActiveCount,
    myActiveOwnedCount,
    countsByItPriority,
    recentlyUpdated: recentlyUpdated.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.title,
      status: t.status,
      owner: t.owner ? { id: t.owner.id, name: t.owner.name } : null,
      updatedAt: t.updatedAt.toISOString(),
    })),
    myRecentActions: myRecentActions.map((a) => ({
      id: a.id,
      ticketId: a.ticketId,
      ticketNumber: a.ticket.ticketNumber,
      description:
        a.description.length > 120 ? `${a.description.slice(0, 120)}…` : a.description,
      actionAt: a.actionAt.toISOString(),
    })),
  };

  // 6. userCounts: Admin only (AC-17)
  if (user.role === 'ADMINISTRATOR' || user.role === 'ADMIN') {
    const [requester, itStaff, administrator, active, inactive] = await Promise.all([
      prisma.user.count({ where: { role: 'REQUESTER' } }),
      prisma.user.count({ where: { role: 'IT_STAFF' } }),
      prisma.user.count({ where: { role: 'ADMINISTRATOR' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
    ]);
    responsePayload.userCounts = {
      requester,
      itStaff,
      administrator,
      active,
      inactive,
    };
  }

  return responsePayload;
}
