import cors from 'cors';
import express from 'express';
import { getPrisma } from './prisma.js';
import { ticketsRouter } from './routes/tickets.js';
import { authRouter } from './routes/auth.js';
import { cookiesMiddleware } from './middleware/cookies.js';
import {
  mustChangePasswordGate,
  optionalAuth,
  sessionWriteCsrf,
} from './middleware/auth.js';
import { HttpError } from './services/ticket.service.js';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookiesMiddleware);
// Lab 3 (AD-01): attach the session identity when a valid cookie is present.
// Public routes ignore it; protected routes enforce it via requireAuth.
app.use(optionalAuth);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' });
});

app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await getPrisma().category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: 'Unable to load categories from the database' });
  }
});

// Lab 3: REMOVED — the Development Requester selector it served is gone
// (BR-03/AC-03, ui-spec §2.3). Identity is the authenticated session user;
// admins list users via GET /api/users (§9, later issue). The route now
// falls through to Express's default 404.

app.get('/api/related-systems', async (_req, res) => {
  try {
    const systems = await getPrisma().relatedSystem.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    res.status(200).json(systems);
  } catch {
    res
      .status(500)
      .json({ error: 'Unable to load related systems from the database' });
  }
});

app.use('/api/auth', authRouter);

// Lab 3 (BR-02): sessions flagged mustChangePassword can only reach the auth
// allowlist; every other /api/* call below gets 403 password_change_required.
// Unauthenticated callers pass through here and are rejected with 401 by each
// router's requireAuth.
app.use(mustChangePasswordGate);
// Lab 3 (AD-01): state-changing requests need a valid X-CSRF-Token, except
// the login and /api/auth/* paths handled by their own guards.
app.use(sessionWriteCsrf);

app.use('/api/tickets', ticketsRouter);

// Error-handling middleware — registered last as a 4-arg handler. Translates
// HttpError (status + optional details) and JSON body-parse failures into the
// documented envelope; everything else is a safe generic 500 with no stack
// trace in the response body.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof HttpError) {
      const code = (err as unknown as { code?: string }).code;
      res
        .status(err.status)
        .json({
          error: err.message,
          ...(err.details ? { details: err.details } : {}),
          ...(code ? { code } : {}),
        });
      return;
    }

    if (
      err instanceof SyntaxError &&
      (err as { type?: string }).type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds the 5 MB limit' });
      return;
    }

    console.error(err);
    res.status(500).json({
      error: 'An unexpected error occurred. Please try again.',
    });
  },
);

export default app;
