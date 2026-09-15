import { Router } from 'express';
import { requireAuth, requireStaffRole } from '../middleware/auth.js';
import {
  listQueueOwnersHandler,
  listStaffTicketsHandler,
} from '../controllers/staff-queue.controller.js';

// Lab 3 §5 — IT Staff Ticket Queue router. Every /api/staff/* endpoint is
// double-gated server-side: session (requireAuth → 401 without one, 403 for
// inactive accounts) then role. Hidden UI links never substitute for these
// checks (BR-20).
//
// Role scoping per the §12 matrix + §1.5 masking rule:
// - Queue list and owners list: REQUESTER → 403 (the queue surface itself is
//   not a secret; IT_STAFF and ADMINISTRATOR pass per AD-02).
// - Everything else under /api/staff (e.g. the future internal-notes and
//   ticket-detail paths): NOT registered yet, so any caller — requester
//   included — falls through to Express's default 404. A requester probing
//   /api/staff/tickets/:number/internal-notes must see exactly that absent-
//   route 404 with no note content and no role hint (api-spec §8: "Requester
//   calls return 404 … indistinguishable from a missing ticket, never 403").
//   A blanket role 403 here would leak that the staff surface exists.
//   requireStaffRole is therefore attached PER ROUTE — a mounted sub-router
//   with router-level .use() would gate every /api/staff/* path.
export const staffRouter = Router();

staffRouter.use(requireAuth);

// API §5.1 — GET /api/staff/tickets (search/filter/sort/pagination).
staffRouter.get('/tickets', requireStaffRole, listStaffTicketsHandler);

// Owner filter source (§6.1 filter card): active IT Staff + Administrator
// users only (BR-12). Powers the Owner select; claim/reassign reuse it later.
staffRouter.get('/owners', requireStaffRole, listQueueOwnersHandler);
