import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  createTicketHandler,
  deleteAttachmentHandler,
  downloadAttachmentHandler,
  getTicketDetailHandler,
  listAttachmentEventsHandler,
  listTicketsHandler,
  restoreAttachmentHandler,
  uploadAttachmentHandler,
} from '../controllers/tickets.controller.js';
import {
  createCommentHandler,
  listCommentsHandler,
  requesterStatusChangeHandler,
} from '../controllers/comments.controller.js';

export const ticketsRouter = Router();

// Lab 3 (BR-03/BR-20): every /api/tickets* endpoint requires a session.
// No session -> 401 { error: 'Not authenticated' } via requireAuth (which
// also rejects inactive accounts with 403 and destroys their session).
// The mustChangePassword gate (403 password_change_required) and CSRF checks
// for writes run globally in app.ts before this router. Requester identity is
// derived server-side from req.auth.user in the handlers; the legacy
// X-Dev-Requester-Id header is never trusted.
ticketsRouter.use(requireAuth);

// Memory storage so we can validate before writing to disk; limit 5 MB.
// File-type is validated in the handler to return 415.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// API-01..06, API-23, API-24 — POST /api/tickets (create ticket as self).
ticketsRouter.post('/', createTicketHandler);

// API-07..11, API-20 — GET /api/tickets (paginated list of my tickets).
ticketsRouter.get('/', listTicketsHandler);

// Detail — GET /api/tickets/:ticketNumber (owner-checked, includes ownerName)
ticketsRouter.get('/:ticketNumber', getTicketDetailHandler);

// Attachments — POST /api/tickets/:ticketNumber/attachments (multipart field "file")
ticketsRouter.post('/:ticketNumber/attachments', upload.single('file'), uploadAttachmentHandler);

// Download — GET /api/tickets/:ticketNumber/attachments/:attachmentId/download
ticketsRouter.get('/:ticketNumber/attachments/:attachmentId/download', downloadAttachmentHandler);

// Soft-remove — DELETE /api/tickets/:ticketNumber/attachments/:attachmentId
ticketsRouter.delete('/:ticketNumber/attachments/:attachmentId', deleteAttachmentHandler);

// Restore — POST /api/tickets/:ticketNumber/attachments/:attachmentId/restore
ticketsRouter.post('/:ticketNumber/attachments/:attachmentId/restore', restoreAttachmentHandler);

// Audit ledger — GET /api/tickets/:ticketNumber/events (newest-first)
ticketsRouter.get('/:ticketNumber/events', listAttachmentEventsHandler);

// Lab 3 §7 — Public Comments (BR-04/BR-14). Requester: own ticket only
// (masked 404 otherwise); staff/admin: any ticket via the alias routes.
// Append-only: no PATCH/DELETE routes exist for comments.
ticketsRouter.get('/:ticketNumber/comments', listCommentsHandler);
ticketsRouter.post('/:ticketNumber/comments', createCommentHandler);

// Lab 3 §7.3 — requester-limited status change: REOPENED from RESOLVED/CLOSED
// on the requester's own ticket only (BR-05 exception). Requester attempts to
// set RESOLVED/CLOSED return 403 "Only IT Staff may resolve or close tickets".
ticketsRouter.patch('/:ticketNumber/status', requesterStatusChangeHandler);
