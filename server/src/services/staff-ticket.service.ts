import type { PrismaClient, User } from '@prisma/client';
import { HttpError } from './ticket.service.js';
import { ensureTicketNumberFormat } from './attachment.service.js';
import {
  MAX_RESOLUTION_SUMMARY_LENGTH,
  RESOLVE_STATUS,
  TICKET_STATUSES,
  allowedTransitions,
  confirmPrompt,
  evaluateResolutionGate,
  isPermitted,
  isTicketStatus,
  permittedTargetsMessage,
  requiresReason,
  type GateReason,
  type TicketStatus,
} from './transition-matrix.js';
import {
  assertExpectedVersion,
  parseExpectedVersion,
  validationFailure,
} from './optimistic-lock.js';

// ---------------------------------------------------------------------------
// Lab 3 §6 — IT Staff ticket operations (FR-07, BR-12/13/15, §12 matrix).
//
// Authorization is layered:
//   1. Router: requireAuth (401 without a session; inactive → 403 + destroy)
//      then requireStaffRole per route — REQUESTER never reaches these
//      handlers (403 "IT Staff access required"); IT_STAFF and ADMINISTRATOR
//      pass (D-01: Admin performs every IT Staff ticket operation).
//   2. Service: writes re-derive the staff gate from the session user, so a
//      missing router guard can never become an authorization hole (BR-20).
//
// All error messages follow api-spec §6 verbatim. Timestamps/actor fields are
// server-derived (BR-14/BR-16); no client value is trusted for identity.
// ---------------------------------------------------------------------------

export const STAFF_WRITE_REQUIRED = 'IT Staff role required for this operation';
// Lab 4 (L4-3, BR-09/D-06): the transition matrix, the confirmation metadata
// and the resolution gate live in ONE pure module (transition-matrix.ts); this
// service only validates input, enforces authorization and persists. Optimistic
// locking lives in optimistic-lock.ts and is shared with the Actions Taken
// PATCHes (D-04).
export const OWNER_MESSAGE = 'Owner must be an active IT Staff or Administrator';
export const USER_NOT_FOUND = 'User not found';

function requireItStaffWrite(user: User): void {
  // Lab 4 D-01 (BR-15): an active Admin performs every IT Staff ticket
  // operation. This supersedes the Lab 3 AD-02 view-only rule; requesters
  // never get here from the router, but are re-checked defensively.
  if (user.role !== 'IT_STAFF' && user.role !== 'ADMINISTRATOR') {
    throw new HttpError(403, STAFF_WRITE_REQUIRED);
  }
}

// §6.1 — staff detail read. Staff/admin may read any ticket by number;
// a well-formed but absent number is a real (unmasked) 404 (api-spec §1.5).
// `role` is the session role and only ever feeds the server-computed
// `allowedTransitions` list (BR-09/FR-04).
export async function getStaffTicketDetail(
  prisma: PrismaClient,
  ticketNumber: string,
  role: string,
) {
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
    // Lab 4 api-spec §3.1 — optimistic-concurrency version, the resolution
    // lifecycle columns and the server-computed transition list. The UI renders
    // only these targets and never re-implements the matrix (FR-04).
    version: ticket.version,
    allowedTransitions: allowedTransitions(ticket.status as TicketStatus, role),
    resolvedAt: ticket.resolvedAt,
    resolutionSummary: ticket.resolutionSummary,
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
  version: number;
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
  rawExpectedVersion: unknown,
): Promise<OwnerChangeResult> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  const expectedVersion = parseExpectedVersion(rawExpectedVersion);

  if (rawOwnerId !== null && (typeof rawOwnerId !== 'number' || !Number.isInteger(rawOwnerId))) {
    throw new HttpError(
      400,
      'Validation failed',
      [{ field: 'ownerId', message: 'ownerId is required (integer or null)' }],
      'VALIDATION',
    );
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  // D-04/BR-07 — stale writes change nothing and report the stored version.
  assertExpectedVersion(ticket.version, expectedVersion);

  if (rawOwnerId === null) {
    const cleared = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { ownerId: null, ownerName: null, version: { increment: 1 } },
      include: { owner: true },
    });
    return {
      id: cleared.id,
      ticketNumber: cleared.ticketNumber,
      status: cleared.status,
      owner: null,
      itPriority: cleared.itPriority,
      itPriorityCopied: false,
      version: cleared.version,
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
      version: { increment: 1 },
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
    version: updated.version,
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
  rawExpectedVersion: unknown,
): Promise<{
  id: number;
  ticketNumber: string;
  priority: string;
  itPriority: string | null;
  version: number;
  updatedAt: Date;
}> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  const expectedVersion = parseExpectedVersion(rawExpectedVersion);

  const VALID = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (
    typeof rawItPriority !== 'string' ||
    !(VALID as readonly string[]).includes(rawItPriority)
  ) {
    throw new HttpError(
      400,
      'Validation failed',
      [{ field: 'itPriority', message: 'itPriority must be one of LOW, MEDIUM, HIGH, CRITICAL' }],
      'VALIDATION',
    );
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  assertExpectedVersion(ticket.version, expectedVersion);

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      itPriority: rawItPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      version: { increment: 1 },
    },
  });
  return {
    id: updated.id,
    ticketNumber: updated.ticketNumber,
    priority: updated.priority,
    itPriority: updated.itPriority,
    version: updated.version,
    updatedAt: updated.updatedAt,
  };
}

// §6.4 — staff status change governed by the BR-09 matrix (the one pure module
// in transition-matrix.ts), the BR-10 resolution gate and D-04 optimistic
// locking, inside one transaction:
//   - update status, version and the resolution lifecycle columns,
//   - append the audit-visible system comment (actor, from → to, timestamp),
//   - append the reason comment for REOPENED transitions.
export interface StatusChangeResult {
  id: number;
  ticketNumber: string;
  status: string;
  version: number;
  resolvedAt: Date | null;
  updatedAt: Date;
  comment: { id: number; body: string } | null;
}

export async function changeTicketStatus(
  prisma: PrismaClient,
  actor: User,
  ticketNumber: string,
  body: Record<string, unknown>,
): Promise<StatusChangeResult> {
  requireItStaffWrite(actor);
  ensureTicketNumberFormat(ticketNumber);

  const rawStatus = body?.status;
  if (!isTicketStatus(rawStatus)) {
    validationFailure('status', `status must be one of ${TICKET_STATUSES.join(', ')}`);
  }
  const target = rawStatus;
  const expectedVersion = parseExpectedVersion(body?.expectedVersion);

  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) {
    throw new HttpError(404, `Ticket ${ticketNumber} does not exist`);
  }
  const current = ticket.status as TicketStatus;

  // D-04/BR-07 — concurrency is the precondition of reading the rest of the
  // request: a stale client is told to reload (409 + currentVersion) instead of
  // being handed gate reasons computed from a snapshot that is already out of
  // date, and no stored column is touched until this passes.
  assertExpectedVersion(ticket.version, expectedVersion);

  // ANY -> same status is a no-op, reported as validation (api-spec §3.2).
  if (target === current) {
    throw new HttpError(400, `Ticket is already in status ${current}`, undefined, 'VALIDATION');
  }

  // BR-09 — the matrix is never bypassable by calling the API directly, and the
  // rejection names the permitted set so a client can realign.
  if (!isPermitted(current, target)) {
    throw new HttpError(
      422,
      `Illegal status transition from ${current} to ${target}`,
      [{ field: 'status', message: permittedTargetsMessage(current) }],
      'INVALID_TRANSITION',
    );
  }

  const prompt = confirmPrompt(current, target);
  if (prompt !== null && body?.confirm !== true) {
    throw new HttpError(
      400,
      'Validation failed',
      [
        {
          field: 'confirm',
          message: `Confirmation required to move from ${current} to ${target}`,
        },
      ],
      'VALIDATION',
    );
  }

  // FR-05/BR-10 — the gate applies only to *new* transitions into Resolved, and
  // it reports every unsatisfied condition together.
  let summary: string | null = null;
  if (target === RESOLVE_STATUS) {
    const rawSummary = body?.resolutionSummary;
    if (typeof rawSummary === 'string' && rawSummary.trim().length > MAX_RESOLUTION_SUMMARY_LENGTH) {
      validationFailure(
        'resolutionSummary',
        `resolutionSummary must be at most ${MAX_RESOLUTION_SUMMARY_LENGTH} characters`,
      );
    }
    summary = typeof rawSummary === 'string' ? rawSummary.trim() : null;

    const [actionCount, openFollowUpCount] = await Promise.all([
      prisma.actionTaken.count({ where: { ticketId: ticket.id } }),
      prisma.actionTaken.count({ where: { ticketId: ticket.id, followUpRequired: true } }),
    ]);
    const reasons: GateReason[] = evaluateResolutionGate({ actionCount, openFollowUpCount, summary });
    if (reasons.length > 0) {
      throw new HttpError(
        422,
        'Resolution requirements are not met',
        reasons.map((reason) => ({ field: 'reasons', message: reason })),
        'RESOLUTION_GATE',
      );
    }
  }

  // Reopening a resolved or closed ticket records why in the ticket thread; the
  // reason arrives with the transition so the audit entry is never anonymous.
  let reason: string | null = null;
  if (requiresReason(current, target)) {
    const rawReason = body?.reason;
    if (typeof rawReason !== 'string' || rawReason.trim().length === 0) {
      validationFailure('reason', `A reason comment is required to reopen from ${current}`);
    }
    if ((rawReason as string).trim().length > 2000) {
      validationFailure('reason', 'Reason must be at most 2000 characters');
    }
    reason = (rawReason as string).trim();
  }

  // BR-15/BR-12: Resolved and Closed require a live owner. Reopening and
  // cancelling stay available on a dead-owner ticket.
  if ((target === 'RESOLVED' || target === 'CLOSED') && ticket.ownerId !== null) {
    const owner = await prisma.user.findUnique({ where: { id: ticket.ownerId } });
    if (!owner || !owner.isActive) {
      throw new HttpError(409, 'Ticket owner is deactivated. Reassign the ticket before resolving or closing it.');
    }
  }

  const timestamp = new Date();
  const systemBody = `Status changed from ${current} to ${target} by ${actor.name} at ${timestamp.toISOString()}.`;
  const reopenBody = reason !== null ? `Reopened by ${actor.name}: ${reason}` : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: target as never,
        version: { increment: 1 },
        // BR-10/§3.2 — the first successful transition into Resolved stamps
        // resolvedAt and stores the summary; reopening clears only resolvedAt
        // and keeps the summary as history.
        ...(target === RESOLVE_STATUS
          ? { resolvedAt: timestamp, resolutionSummary: summary }
          : {}),
        ...(target === 'REOPENED' ? { resolvedAt: null } : {}),
        // FR-10 one-active-signal-per-episode (Lab 3): a staff status change out
        // of RESOLVED/CLOSED clears the stale requester signal.
        ...(current === 'RESOLVED' || current === 'CLOSED' ? { appearsResolvedAt: null } : {}),
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
    version: updated.row.version,
    resolvedAt: updated.row.resolvedAt,
    updatedAt: updated.row.updatedAt,
    comment: { id: updated.comment.id, body: updated.comment.body },
  };
}
