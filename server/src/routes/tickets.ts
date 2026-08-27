import { Router } from 'express';
import {
  createTicketHandler,
  getTicketDetailHandler,
  listTicketsHandler,
} from '../controllers/tickets.controller.js';

export const ticketsRouter = Router();

// API-01..06, API-23, API-24 — POST /api/tickets (create ticket).
// The X-Dev-Requester-Id header is resolved and validated by the handler.
ticketsRouter.post('/', createTicketHandler);

// API-07..11, API-20 — GET /api/tickets (paginated list of my tickets).
ticketsRouter.get('/', listTicketsHandler);

// Detail — GET /api/tickets/:ticketNumber (owner-checked, includes ownerName)
ticketsRouter.get('/:ticketNumber', getTicketDetailHandler);