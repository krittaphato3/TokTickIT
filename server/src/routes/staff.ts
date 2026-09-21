import { Router } from 'express';
import { requireAuth, requireStaffRole } from '../middleware/auth.js';
import {
  listQueueOwnersHandler,
  listStaffTicketsHandler,
} from '../controllers/staff-queue.controller.js';
import {
  changeTicketOwnerHandler,
  changeTicketStatusHandler,
  getStaffTicketDetailHandler,
  setItPriorityHandler,
} from '../controllers/staff-ticket.controller.js';
import {
  createInternalNoteHandler,
  listInternalNotesHandler,
} from '../controllers/internal-note.controller.js';
import {
  createCommentHandler,
  listCommentsHandler,
} from '../controllers/comments.controller.js';
import { getStaffTicketDownloadHandler } from '../controllers/staff-attachments.controller.js';

// Lab 3 §5/§6/§7/§8 — IT Staff surface router. Every /api/staff/* endpoint is
// double-gated server-side: session (requireAuth → 401 without one, 403 for
// inactive accounts) then role. Hidden UI links never substitute for these
// checks (BR-20).
//
// Role scoping per the §12 matrix + §1.5 masking rule:
// - Queue list, owners list, ticket detail, comment aliases: REQUESTER → 403
//   (the staff surface itself is not a secret; IT_STAFF and ADMINISTRATOR
//   pass per AD-02 — ADMIN is view-only on writes below).
// - Owner / it-priority / status writes: requireStaffRole (read gate) PLUS
//   an in-service IT_STAFF-only re-check → ADMIN gets 403 (view-only) and
//   REQUESTER is already refused at the router.
// - Internal notes: NOT role-gated at the router. Requesters must receive
//   the masked 404 "Not found" (§1.5) — indistinguishable from a missing
//   ticket — never a 403 that would leak that the staff note surface exists.
//   The handlers throw the masked error; staff/admin pass through.
// - requireStaffRole is attached PER ROUTE — a mounted sub-router with
//   router-level .use() would gate every /api/staff/* path including notes.
export const staffRouter = Router();

staffRouter.use(requireAuth);

// API §5.1 — GET /api/staff/tickets (search/filter/sort/pagination).
staffRouter.get('/tickets', requireStaffRole, listStaffTicketsHandler);

// Owner filter source (§6.1 filter card): active IT Staff + Administrator
// users only (BR-12). Powers the queue Owner select and claim/reassign.
staffRouter.get('/owners', requireStaffRole, listQueueOwnersHandler);

// §6.1 — staff ticket detail (IT_STAFF + ADMIN read; requester 403).
staffRouter.get('/tickets/:ticketNumber', requireStaffRole, getStaffTicketDetailHandler);

// §7.1/§7.2 aliases — public comments via the staff surface (§12: staff and
// admin read/post on any ticket; requester 403 on the staff path, the
// requester-facing /api/tickets/:number/comments route remains canonical).
staffRouter.get('/tickets/:ticketNumber/comments', requireStaffRole, listCommentsHandler);
staffRouter.post('/tickets/:ticketNumber/comments', requireStaffRole, createCommentHandler);

// §8 — internal notes (IT_STAFF + ADMIN; requester masked 404 in-handler).
staffRouter.get('/tickets/:ticketNumber/internal-notes', listInternalNotesHandler);
staffRouter.post('/tickets/:ticketNumber/internal-notes', createInternalNoteHandler);

// §6.2/§6.3/§6.4 — staff-only writes. requireStaffRole refuses REQUESTER
// (403) up front; the service re-checks IT_STAFF-only so ADMIN writes fail
// closed (403 view-only per AD-02) even if a router gate were dropped.
staffRouter.patch('/tickets/:ticketNumber/owner', requireStaffRole, changeTicketOwnerHandler);
staffRouter.patch('/tickets/:ticketNumber/it-priority', requireStaffRole, setItPriorityHandler);
staffRouter.patch('/tickets/:ticketNumber/status', requireStaffRole, changeTicketStatusHandler);

// §7.3 — staff attachment download (read-only viewer per ui-spec §7.3).
// Staff/admin may download any ticket's attachment; requesters keep using
// the requester-scoped /api/tickets/:number/attachments/... route.
staffRouter.get(
  '/tickets/:ticketNumber/attachments/:attachmentId/download',
  requireStaffRole,
  getStaffTicketDownloadHandler,
);
