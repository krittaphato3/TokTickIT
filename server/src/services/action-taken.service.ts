import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { HttpError, resolveSessionRequester } from './ticket.service.js';
import { ensureTicketNumberFormat } from './attachment.service.js';

// ---------------------------------------------------------------------------
// Lab 4 — Actions Taken (api-spec §2, FR-01/FR-02/FR-07, BR-01..BR-07).
//
// Authorization shape (BR-14, D-01):
//  - List: owning Requester (masked 404 otherwise), IT Staff, Admin.
//  - Create/update: active IT Staff or Admin only; a Requester on their own
//    ticket gets 403, on a foreign ticket the masked 404.
//  - performedById is always the session user; a client-supplied value is
//    ignored, never validated, never stored (BR-04).
// There is no DELETE path (BR-19) and actions are never re-parented (BR-01).
// ---------------------------------------------------------------------------

export const ACTIONS_WRITE_FORBIDDEN = 'Only IT Staff may record actions';
export const ACTION_NOT_FOUND = 'Action not found';
export const STALE_ACTION_MESSAGE = 'This record was changed by someone else';

export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_RESULT_LENGTH = 2000;
export const MAX_FOLLOW_UP_NOTE_LENGTH = 1000;
export const MAX_ATTACHMENT_NOTES_LENGTH = 500;
export const MAX_ACTION_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const MIN_CLIENT_REQUEST_ID_LENGTH = 8;
export const MAX_CLIENT_REQUEST_ID_LENGTH = 64;

export interface ActionPerformerDto {
  id: number;
  name: string;
  role: string;
}

export interface ActionTakenDto {
  id: number;
  ticketId: number;
  actionAt: Date;
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  performedBy: ActionPerformerDto;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

// Requester-scoped ticket resolution with the §1.5 masking rule: absent and
// foreign-owned tickets are an identical 404 so cross-requester probing is
// impossible. Staff/admin resolve any ticket by number.
export async function resolveActionsTicket(
  prisma: PrismaClient,
  user: SessionUser,
  ticketNumber: string,
) {
  ensureTicketNumberFormat(ticketNumber);
  const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
  if (!ticket) throw new HttpError(404, 'Ticket not found', undefined, 'NOT_FOUND');
  if (user.role === 'REQUESTER') {
    const requester = await resolveSessionRequester(prisma, user);
    if (ticket.requesterId !== requester.id) {
      throw new HttpError(404, 'Ticket not found', undefined, 'NOT_FOUND');
    }
  }
  return ticket;
}

export function requireActionsWrite(user: SessionUser): void {
  if (user.role !== 'IT_STAFF' && user.role !== 'ADMINISTRATOR') {
    throw new HttpError(403, ACTIONS_WRITE_FORBIDDEN, undefined, 'FORBIDDEN');
  }
}

type ActionRow = {
  id: number;
  ticketId: number;
  actionAt: Date;
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  performedBy: { id: number; name: string; role: string };
};

export function toActionDto(row: ActionRow): ActionTakenDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    actionAt: row.actionAt,
    description: row.description,
    result: row.result,
    followUpRequired: row.followUpRequired,
    followUpNote: row.followUpNote,
    attachmentNotes: row.attachmentNotes,
    performedBy: { id: row.performedBy.id, name: row.performedBy.name, role: row.performedBy.role },
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fail(field: string, message: string): never {
  throw new HttpError(400, 'Validation failed', [{ field, message }], 'VALIDATION');
}

function parseActionAt(raw: unknown, ticketCreatedAt: Date): Date {
  if (raw === undefined || raw === null) return new Date();
  const parsed = new Date(raw as string);
  if (typeof raw !== 'string' || Number.isNaN(parsed.getTime())) {
    fail('actionAt', 'actionAt must be a valid date-time');
  }
  if (parsed.getTime() - Date.now() > MAX_ACTION_FUTURE_SKEW_MS) {
    fail('actionAt', 'actionAt must not be more than 5 minutes in the future');
  }
  if (parsed.getTime() < ticketCreatedAt.getTime()) {
    fail('actionAt', 'actionAt must not be earlier than the ticket creation time');
  }
  return parsed;
}

function parseRequiredText(
  raw: unknown,
  field: 'description' | 'result',
  max: number,
): string {
  const label = field === 'description' ? 'Description' : 'Result';
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    fail(field, `${label} is required`);
  }
  if ((raw as string).trim().length > max) {
    fail(field, `${label} must be at most ${max} characters`);
  }
  return (raw as string).trim();
}

function parseFollowUp(body: Record<string, unknown>): { required: boolean; note: string | null } {
  const rawRequired = body.followUpRequired;
  if (rawRequired !== undefined && typeof rawRequired !== 'boolean') {
    fail('followUpRequired', 'followUpRequired must be a boolean');
  }
  const required = rawRequired === true;
  if (!required) return { required: false, note: null };
  const rawNote = body.followUpNote;
  if (typeof rawNote !== 'string' || rawNote.trim().length === 0) {
    fail('followUpNote', 'A follow-up note is required when follow-up is required');
  }
  if (rawNote.trim().length > MAX_FOLLOW_UP_NOTE_LENGTH) {
    fail('followUpNote', `Follow-up note must be at most ${MAX_FOLLOW_UP_NOTE_LENGTH} characters`);
  }
  return { required: true, note: rawNote.trim() };
}

function parseAttachmentNotes(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    fail('attachmentNotes', 'attachmentNotes must be a string');
  }
  const trimmed = (raw as string).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_ATTACHMENT_NOTES_LENGTH) {
    fail('attachmentNotes', `attachmentNotes must be at most ${MAX_ATTACHMENT_NOTES_LENGTH} characters`);
  }
  return trimmed;
}

function parseClientRequestId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    fail('clientRequestId', 'clientRequestId must be a string');
  }
  const trimmed = raw.trim();
  if (trimmed.length < MIN_CLIENT_REQUEST_ID_LENGTH || trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    fail('clientRequestId', `clientRequestId must be between ${MIN_CLIENT_REQUEST_ID_LENGTH} and ${MAX_CLIENT_REQUEST_ID_LENGTH} characters`);
  }
  return trimmed;
}

function parseExpectedVersion(raw: unknown): number {
  if (raw === undefined || raw === null) {
    fail('expectedVersion', 'expectedVersion is required');
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    fail('expectedVersion', 'expectedVersion must be an integer');
  }
  return raw as number;
}

export async function listActions(
  prisma: PrismaClient,
  ticketId: number,
): Promise<ActionTakenDto[]> {
  const rows = await prisma.actionTaken.findMany({
    where: { ticketId },
    orderBy: [{ actionAt: 'desc' }, { id: 'desc' }],
    include: { performedBy: { select: { id: true, name: true, role: true } } },
  });
  return rows.map(toActionDto);
}

export async function createAction(
  prisma: PrismaClient,
  ticket: { id: number; createdAt: Date },
  performer: SessionUser,
  body: unknown,
): Promise<{ action: ActionTakenDto; duplicate: boolean }> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid JSON body', undefined, 'VALIDATION');
  }
  const data = body as Record<string, unknown>;
  const actionAt = parseActionAt(data.actionAt, ticket.createdAt);
  const description = parseRequiredText(data.description, 'description', MAX_DESCRIPTION_LENGTH);
  const result = parseRequiredText(data.result, 'result', MAX_RESULT_LENGTH);
  const followUp = parseFollowUp(data);
  const attachmentNotes = parseAttachmentNotes(data.attachmentNotes);
  const clientRequestId = parseClientRequestId(data.clientRequestId);

  if (clientRequestId !== null) {
    const existing = await prisma.actionTaken.findUnique({
      where: {
        performedById_clientRequestId: { performedById: performer.id, clientRequestId },
      },
      include: { performedBy: { select: { id: true, name: true, role: true } } },
    });
    if (existing) return { action: toActionDto(existing), duplicate: true };
  }

  try {
    const created = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        performedById: performer.id,
        actionAt,
        description,
        result,
        followUpRequired: followUp.required,
        followUpNote: followUp.note,
        attachmentNotes,
        clientRequestId,
      },
      include: { performedBy: { select: { id: true, name: true, role: true } } },
    });
    return { action: toActionDto(created), duplicate: false };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      clientRequestId !== null
    ) {
      const existing = await prisma.actionTaken.findUnique({
        where: {
          performedById_clientRequestId: { performedById: performer.id, clientRequestId },
        },
        include: { performedBy: { select: { id: true, name: true, role: true } } },
      });
      if (existing) return { action: toActionDto(existing), duplicate: true };
    }
    throw err;
  }
}

export function ensureActionIdFormat(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, 'Invalid identifier format', undefined, 'VALIDATION');
  }
  return Number(raw);
}

export async function patchAction(
  prisma: PrismaClient,
  ticket: { id: number; createdAt: Date },
  actionId: number,
  body: unknown,
): Promise<ActionTakenDto> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid JSON body', undefined, 'VALIDATION');
  }
  const data = body as Record<string, unknown>;
  const expectedVersion = parseExpectedVersion(data.expectedVersion);

  const current = await prisma.actionTaken.findFirst({ where: { id: actionId, ticketId: ticket.id } });
  if (!current) {
    throw new HttpError(404, ACTION_NOT_FOUND, undefined, 'NOT_FOUND');
  }
  if (current.version !== expectedVersion) {
    throw new HttpError(
      409,
      STALE_ACTION_MESSAGE,
      [{ field: 'expectedVersion', message: `Expected version ${expectedVersion}, stored version is ${current.version}` }],
      'CONFLICT',
      { currentVersion: current.version },
    );
  }

  const patch: {
    actionAt?: Date;
    description?: string;
    result?: string;
    followUpRequired?: boolean;
    followUpNote?: string | null;
    attachmentNotes?: string | null;
  } = {};
  if (data.actionAt !== undefined) patch.actionAt = parseActionAt(data.actionAt, ticket.createdAt);
  if (data.description !== undefined) {
    patch.description = parseRequiredText(data.description, 'description', MAX_DESCRIPTION_LENGTH);
  }
  if (data.result !== undefined) {
    patch.result = parseRequiredText(data.result, 'result', MAX_RESULT_LENGTH);
  }
  if (data.followUpRequired !== undefined || data.followUpNote !== undefined) {
    const nextRequired =
      data.followUpRequired === undefined ? current.followUpRequired : data.followUpRequired;
    if (data.followUpRequired !== undefined && typeof data.followUpRequired !== 'boolean') {
      fail('followUpRequired', 'followUpRequired must be a boolean');
    }
    if (nextRequired === false) {
      patch.followUpRequired = false;
      patch.followUpNote = null;
    } else {
      const rawNote = data.followUpNote;
      if (data.followUpNote === undefined && current.followUpRequired && current.followUpNote !== null) {
        patch.followUpRequired = true;
      } else {
        if (typeof rawNote !== 'string' || (rawNote as string).trim().length === 0) {
          fail('followUpNote', 'A follow-up note is required when follow-up is required');
        }
        if ((rawNote as string).trim().length > MAX_FOLLOW_UP_NOTE_LENGTH) {
          fail('followUpNote', `Follow-up note must be at most ${MAX_FOLLOW_UP_NOTE_LENGTH} characters`);
        }
        patch.followUpRequired = true;
        patch.followUpNote = (rawNote as string).trim();
      }
    }
  }
  if (data.attachmentNotes !== undefined) {
    patch.attachmentNotes = parseAttachmentNotes(data.attachmentNotes);
  }

  const updated = await prisma.actionTaken.update({
    where: { id: current.id },
    data: { ...patch, version: current.version + 1 },
    include: { performedBy: { select: { id: true, name: true, role: true } } },
  });
  return toActionDto(updated);
}
