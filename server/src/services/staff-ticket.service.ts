import type { PrismaClient, User } from '@prisma/client';
import { HttpError } from './ticket.service.js';
import { ensureTicketNumberFormat } from './attachment.service.js';

// ---------------------------------------------------------------------------
// Lab 3 §6 — IT Staff ticket operations (FR-07, BR-12/13/15, §12 matrix).
//
// Authorization is layered:
//   1. Router: requireAuth (401 without a session; inactive → 403 + destroy)
//      then requireStaffRole per route — REQUESTER never reaches these
//      handlers (403 "IT Staff access required"); ADMIN reaches read routes
//      but is refused on every write (403 view-only per AD-02).
//   2. Service: writes re-derive the staff gate from the session user, so a
//      missing router guard can never become an authorization hole (BR-20).
//
// All error messages follow api-spec §6 verbatim. Timestamps/actor fields are
// server-derived (BR-14/BR-16); no client value is trusted for identity.
// ---------------------------------------------------------------------------

export const STAFF_WRITE_REQUIRED = 'IT Staff role required for this operation';
export const OWNER_MESSAGE = 'Owner must be an active IT Staff or Administrator';
export const USER_NOT_FOUND = 'User not found';
export const ONLY_IT_STAFF_RESOLVE = 'Only IT Staff may resolve or close tickets';

// BR-15 — permitted transitions. Keys are the current status; values are the
// allowed target statuses for IT_STAFF (ADMIN is view-only per AD-02).
export const STAFF_TRANSITIONS: Record<string, string[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS'],
  CANCELLED: ['REOPENED'],
};

// BR-15 confirmations: transitions that require the client to assert the
// chosen action via `confirm: true`. Keys are "<FROM>-><TO>".
export const CONFIRM_REQUIRED: Record<string, string> = {
  'NEW->CANCELLED': 'Cancel this ticket?',
  'OPEN->CANCELLED': 'Cancel this ticket?',
  'IN_PROGRESS->CANCELLED': 'Cancel this ticket?',
  'WAITING_FOR_REQUESTER->CANCELLED': 'Cancel this ticket?',
  'IN_PROGRESS->RESOLVED': 'Mark this ticket resolved?',
  'WAITING_FOR_REQUESTER->RESOLVED': 'Mark this ticket resolved?',
  'RESOLVED->CLOSED': 'Close this ticket?',
  'RESOLVED->REOPENED': 'Reopen this ticket? Add a reason comment below.',
  'CLOSED->REOPENED': 'Reopen this ticket? Add a reason comment below.',
  'CANCELLED->REOPENED': 'Reopen this ticket? Add a reason comment below.',
};

// BR-15: reopening from RESOLVED/CLOSED/CANCELLED requires a reason comment
// (staff route). The comment is flagged in the thread so it reads as an
// operation record, not a conversation entry.
const REOPEN_TARGETS = ['RESOLVED', 'CLOSED', 'CANCELLED'];

function requireItStaffWrite(user: User): void {
  if (user.role !== 'IT_STAFF') {
    // Administrators are view-only on the staff ticket surface (AD-02/§12);
    // requesters never get here from the router, but re-check defensively.
    throw new HttpError(403, STAFF_WRITE_REQUIRED);
  }
}

// §6.1 — staff detail read. Staff/admin may read any ticket by number;
// a well-formed but absent number is a real (unmasked) 404 (api-spec §1.5).
export async function getStaffTicketDetail(prisma: PrismaClient, ticketNumber: string) {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    include: {
      category: true,
      relatedSystem: true,
      requester: true,
      owner: true,
      attachments: true,
      _count: { select: { publicComments: true, internalNotes: true } },
    },
  });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    itPriority: ticket.itPriority,
    owner: ticket.owner
      ? {
          id: ticket.owner.id,
          name: ticket.owner.name,
          email: ticket.owner.email,
          role: ticket.owner.role,
          isActive: ticket.owner.isActive,
        }
      : null,
    requester: {
      id: ticket.requester.id,
      name: ticket.requester.name,
      email: ticket.requester.email,
    },
    category: { id: ticket.category.id, name: ticket.category.name },
    relatedSystem: ticket.relatedSystem
      ? { id: ticket.relatedSystem.id, name: ticket.relatedSystem.name }
      : null,
    appearsResolvedAt: ticket.appearsResolvedAt,
    attachments: ticket.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
      removedAt: a.removedAt,
    })),
    commentCount: ticket._count.publicComments,
    internalNoteCount: ticket._count.internalNotes,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export interface OwnerChangeResult {
  id: number;
  ticketNumber: string;
  status: string;
  owner: { id: number; name: string; email: string } | null;
  itPriority: string | null;
  itPriorityCopied: boolean;
  updatedAt: Date;
}

// §6.2 — claim / assign / reassign / unassign in one endpoint. `ownerId` is
// an integer (set) or null (unassign). BR-12: only active IT_STAFF or
// ADMINISTRATOR users may own a ticket; BR-13: the first claim of an
// unassigned ticket copies the requested priority into a null itPriority.
export async function changeTicketOwner(
  prisma: PrismaClient,
  actor: User,
  ticketNumber: string,
  rawOwnerId: unknown,
): Promise<OwnerChangeResult> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  if (rawOwnerId !== null && (typeof rawOwnerId !== 'number' || !Number.isInteger(rawOwnerId))) {
    throw new HttpError(400, 'Validation failed', [
      { field: 'ownerId', message: 'ownerId is required (integer or null)' },
    ]);
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }

  if (rawOwnerId === null) {
    const cleared = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { ownerId: null, ownerName: null },
      include: { owner: true },
    });
    return {
      id: cleared.id,
      ticketNumber: cleared.ticketNumber,
      status: cleared.status,
      owner: null,
      itPriority: cleared.itPriority,
      itPriorityCopied: false,
      updatedAt: cleared.updatedAt,
    };
  }

  const candidate = await prisma.user.findUnique({ where: { id: rawOwnerId } });
  if (!candidate) {
    throw new HttpError(404, USER_NOT_FOUND);
  }
  if (
    !candidate.isActive ||
    (candidate.role !== 'IT_STAFF' && candidate.role !== 'ADMINISTRATOR')
  ) {
    throw new HttpError(409, OWNER_MESSAGE);
  }

  const itPriorityCopied = ticket.ownerId === null && ticket.itPriority === null;
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      ownerId: candidate.id,
      ownerName: candidate.name,
      ...(itPriorityCopied ? { itPriority: ticket.priority } : {}),
    },
    include: { owner: true },
  });
  return {
    id: updated.id,
    ticketNumber: updated.ticketNumber,
    status: updated.status,
    owner: updated.owner
      ? { id: updated.owner.id, name: updated.owner.name, email: updated.owner.email }
      : null,
    itPriority: updated.itPriority,
    itPriorityCopied,
    updatedAt: updated.updatedAt,
  };
}

// §6.3 — set IT Priority. Requested `priority` is immutable (BR-13); null is
// rejected (unassign flow clears ownership, never the IT priority).
export async function setItPriority(
  prisma: PrismaClient,
  actor: User,
  ticketNumber: string,
  rawItPriority: unknown,
): Promise<{ id: number; ticketNumber: string; priority: string; itPriority: string | null; updatedAt: Date }> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  const VALID = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (
    typeof rawItPriority !== 'string' ||
    !(VALID as readonly string[]).includes(rawItPriority)
  ) {
    throw new HttpError(400, 'Validation failed', [
      { field: 'itPriority', message: 'itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL' },
    ]);
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { itPriority: rawItPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' },
  });
  return {
    id: updated.id,
    ticketNumber: updated.ticketNumber,
    priority: updated.priority,
    itPriority: updated.itPriority,
    updatedAt: updated.updatedAt,
  };
}

// BR-15 confirm + reason-comment validation for the staff status endpoint.
// Returns the parsed transition or throws the documented error.
function validateStatusInput(
  currentStatus: string,
  rawStatus: unknown,
  rawConfirm: unknown,
  rawReason: unknown,
): { target: string; confirm: boolean; reason: string | null } {
  if (typeof rawStatus !== 'string') {
    throw new HttpError(400, 'Validation failed', [
      { field: 'status', message: 'status must be a valid ticket status' },
    ]);
  }
  const target = rawStatus;
  if (target === currentStatus) {
    throw new HttpError(400, `Ticket is already in status ${currentStatus}`);
  }
  if (!(STAFF_TRANSITIONS[currentStatus] ?? []).includes(target)) {
    const allowed = (STAFF_TRANSITIONS[currentStatus] ?? []).join(', ');
    throw new HttpError(409, `Illegal status transition from ${currentStatus} to ${target}. Allowed: ${allowed}`);
  }
  const confirm = rawConfirm === true;
  const confirmationKey = `${currentStatus}->${target}`;
  if (CONFIRM_REQUIRED[confirmationKey] && !confirm) {
    throw new HttpError(400, 'Validation failed', [
      {
        field: 'confirm',
        message: `Confirmation required to move from ${currentStatus} to ${target}`,
      },
    ]);
  }
  let reason: string | null = null;
  if (REOPEN_TARGETS.includes(currentStatus) && target === 'REOPENED') {
    if (typeof rawReason !== 'string' || rawReason.trim().length === 0) {
      throw new HttpError(400, 'Validation failed', [
        {
          field: 'reason',
          message: `A reason comment is required to reopen from ${currentStatus}`,
        },
      ]);
    }
    reason = rawReason.trim();
    if (reason.length > 2000) {
      throw new HttpError(400, 'Validation failed', [
        { field: 'reason', message: 'Reason must be at most 2000 characters' },
      ]);
    }
  }
  return { target, confirm, reason };
}

// §6.4 — staff status change per the BR-15 matrix, inside one transaction:
//   - update status (+ clear a stale appearsResolved signal when a ticket
//     leaves the Resolved/Closed loop, per FR-10 one-active-signal rule),
//   - append the audit-visible system comment (actor, from → to, timestamp),
//   - append the reason comment for REOPENED transitions.
export async function changeTicketStatus(
  prisma: PrismaClient,
  actor: User,
  ticketNumber: string,
  rawStatus: unknown,
  rawConfirm: unknown,
  rawReason: unknown,
): Promise<{ id: number; ticketNumber: string; status: string; updatedAt: Date; comment: { id: number; body: string } | null }> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }

  const { target, confirm, reason } = validateStatusInput(
    ticket.status,
    rawStatus,
    rawConfirm,
    rawReason,
  );
  void confirm;

  // BR-15/BR-12: Resolved and Closed require a live owner. Reopening and
  // cancelling are the exceptions that stay available on a dead-owner ticket.
  if ((target === 'RESOLVED' || target === 'CLOSED') && ticket.ownerId !== null) {
    const owner = await prisma.user.findUnique({ where: { id: ticket.ownerId } });
    if (!owner || !owner.isActive) {
      throw new HttpError(409, 'Ticket owner is deactivated. Reassign the ticket before resolving or closing it.');
    }
  }

  const timestamp = new Date();
  const systemBody = `Status changed from ${ticket.status} to ${target} by ${actor.name} at ${timestamp.toISOString()}.`;
  const reopenBody =
    reason !== null
      ? `Reopened by ${actor.name}: ${reason}`
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: target as never,
        // FR-10 one-active-signal-per-episode: a staff status change out of
        // RESOLVED/CLOSED clears the stale requester signal so a fresh
        // appears-resolved episode can be recorded later.
        ...(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
          ? { appearsResolvedAt: null }
          : {}),
      },
    });
    const comment = await tx.publicComment.create({
      data: {
        ticketId: ticket.id,
        authorId: actor.id,
        body: reopenBody ? `${systemBody}\nReason: ${reopenBody}` : systemBody,
        appearsResolved: false,
      },
    });
    return { row, comment };
  });

  return {
    id: updated.row.id,
    ticketNumber: updated.row.ticketNumber,
    status: updated.row.status,
    updatedAt: updated.row.updatedAt,
    comment: { id: updated.comment.id, body: updated.comment.body },
  };
}
