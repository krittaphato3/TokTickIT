import { Router } from 'express';
import {
  createActionHandler,
  listActionsHandler,
  patchActionHandler,
  requireAuthCoded,
} from '../controllers/actions.controller.js';

// Lab 4 §2 — Actions Taken router, mounted on /api/tickets in app.ts BEFORE
// the legacy ticketsRouter. requireAuthCoded is attached PER ROUTE (never
// router-level .use()): the coded 401 must fire only for the three Lab 4
// paths, while every other /api/tickets/* path falls through untouched to the
// legacy router (A-07: old surfaces keep byte-identical bodies). No DELETE
// route exists (BR-19) — DELETE falls through to Express's default 404.
export const actionsRouter = Router();

actionsRouter.get('/:ticketNumber/actions', requireAuthCoded, listActionsHandler);
actionsRouter.post('/:ticketNumber/actions', requireAuthCoded, createActionHandler);
actionsRouter.patch('/:ticketNumber/actions/:actionId', requireAuthCoded, patchActionHandler);
