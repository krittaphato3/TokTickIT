import { Router } from 'express';
import { requireAuth, requireAdminRole } from '../middleware/auth.js';
import {
  createUserHandler,
  listUsersHandler,
  setUserInitialPasswordHandler,
  updateUserHandler,
} from '../controllers/users.controller.js';

// Lab 3 §9 — Administrator User Management router. Every /api/users/* endpoint
// is double-gated server-side: session (requireAuth → 401 without one, 403 for
// inactive accounts) then role (requireAdminRole → 403 "Administrator access
// required" for REQUESTER and IT_STAFF). Hidden UI links never substitute for
// these checks (BR-20). requireAdminRole is attached PER ROUTE — a mounted
// sub-router with router-level .use() would also gate future non-admin paths.
// Writes additionally pass the app-level CSRF middleware. There is no
// DELETE /api/users/:id — deactivation replaces deletion (BR-18).
export const usersRouter = Router();

usersRouter.use(requireAuth);

// §9.1 — list + search + role filter (ADMIN only).
usersRouter.get('/', requireAdminRole, listUsersHandler);

// §9.2 — create user (ADMIN only; CSRF enforced app-wide for writes).
usersRouter.post('/', requireAdminRole, createUserHandler);

// §9.3 — update name/email/role/activation (ADMIN only + safety guards).
usersRouter.patch('/:id', requireAdminRole, updateUserHandler);

// §9.4 — issue new initial password (ADMIN only; sets mustChangePassword).
usersRouter.post('/:id/set-initial-password', requireAdminRole, setUserInitialPasswordHandler);

export default usersRouter;
