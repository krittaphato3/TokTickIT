import { Router } from 'express';
import multer from 'multer';
import {
  createTicketHandler,
  deleteAttachmentHandler,
  downloadAttachmentHandler,
  getTicketDetailHandler,
  listTicketsHandler,
  uploadAttachmentHandler,
} from '../controllers/tickets.controller.js';

export const ticketsRouter = Router();

// Memory storage so we can validate before writing to disk; limit 5 MB.
// File-type is validated in the handler to return 415.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// API-01..06, API-23, API-24 — POST /api/tickets (create ticket).
// The X-Dev-Requester-Id header is resolved and validated by the handler.
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