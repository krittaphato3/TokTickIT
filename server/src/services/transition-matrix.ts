// Lab 4 (L4-3) — the ONE source of ticket lifecycle transitions (BR-09).
//
// Pure module: no Prisma, no HTTP, no environment. The API, the UI-facing
// `allowedTransitions` and the tests all read this table, so a rule can never
// exist in two places. The UI is forbidden from duplicating it (FR-04): it
// renders whatever `allowedTransitions` the server computed here.
//
// Anything that is *not* a transition rule (field validation, version
// conflicts, persistence) lives in the services that call into this module.

export const TICKET_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

// BR-09/BR-08 — permitted targets per current status. Cancelled is terminal in
// Lab 4 (it was reopenable in Lab 3) and no status may transition to itself
// (a self-transition is rejected as a no-op, not as an illegal target).
export const TRANSITION_TARGETS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
};

// Roles that may drive the lifecycle at all. Admin performs every IT Staff
// ticket operation (D-01/BR-15); a Requester has no status changes whatsoever
// (BR-08), and an unauthenticated caller never reaches the service layer.
export const WORKFLOW_ROLES: readonly string[] = ['IT_STAFF', 'ADMINISTRATOR'];

export const GATE_REASONS = ['NO_ACTIONS', 'OPEN_FOLLOW_UP', 'MISSING_SUMMARY'] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export const RESOLVE_STATUS: TicketStatus = 'RESOLVED';
export const MAX_RESOLUTION_SUMMARY_LENGTH = 2000;

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

// A fresh copy every call: callers may sort or filter what they receive.
export function transitionTargets(from: TicketStatus): TicketStatus[] {
  return [...(TRANSITION_TARGETS[from] ?? [])];
}

export function isPermitted(from: TicketStatus, to: TicketStatus): boolean {
  return (TRANSITION_TARGETS[from] ?? []).includes(to);
}

// FR-04 — the server-computed list handed to the client. Requesters and any
// other role get nothing, so hiding the control is the truth, not a guess.
export function allowedTransitions(from: TicketStatus, role: string): TicketStatus[] {
  if (!WORKFLOW_ROLES.includes(role)) return [];
  return transitionTargets(from);
}

// Transitions whose UI asks for an explicit confirmation before submitting.
// This is presentation metadata: it never decides whether a transition is
// permitted (the matrix does).
const CANCELLED_PROMPT = 'Cancel this ticket?';
const RESOLVE_PROMPT = 'Mark this ticket resolved?';
const CLOSE_PROMPT = 'Close this ticket?';
const REOPEN_PROMPT = 'Reopen this ticket? Add a reason comment below.';

export function confirmPrompt(from: TicketStatus, to: TicketStatus): string | null {
  if (!isPermitted(from, to)) return null;
  if (to === 'CANCELLED') return CANCELLED_PROMPT;
  if (to === 'RESOLVED') return RESOLVE_PROMPT;
  if (to === 'CLOSED') return CLOSE_PROMPT;
  if (to === 'REOPENED') return REOPEN_PROMPT;
  return null;
}

// A reopen from a resolved/closed ticket is recorded as a reason comment in the
// ticket thread; the API requires that reason in the same request.
export function requiresReason(from: TicketStatus, to: TicketStatus): boolean {
  return to === 'REOPENED' && (from === 'RESOLVED' || from === 'CLOSED');
}

export interface ResolutionInput {
  actionCount: number;
  openFollowUpCount: number;
  summary: unknown;
}

// BR-10 — every unsatisfied condition is reported together, in the documented
// order, so the dialog can render one row per reason in a stable sequence.
export function evaluateResolutionGate(input: ResolutionInput): GateReason[] {
  const reasons: GateReason[] = [];
  if (input.actionCount < 1) reasons.push('NO_ACTIONS');
  if (input.openFollowUpCount > 0) reasons.push('OPEN_FOLLOW_UP');
  const summary = input.summary;
  if (typeof summary !== 'string' || summary.trim().length === 0) reasons.push('MISSING_SUMMARY');
  return reasons;
}

// Friendly labels used by error messages and by the UI option list.
export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

export function permittedTargetsMessage(from: TicketStatus): string {
  return `Permitted targets from ${from}: ${transitionTargets(from).join(', ')}`;
}
