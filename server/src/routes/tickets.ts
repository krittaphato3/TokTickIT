import { Router } from 'express';
import { createTicketHandler } from '../controllers/tickets.controller.js';

export const ticketsRouter = Router();

// API-01..06, API-23, API-24 — POST /api/tickets (create ticket).
// The X-Dev-Requester-Id header is resolved and validated by the handler.
ticketsRouter.post('/', createTicketHandler);