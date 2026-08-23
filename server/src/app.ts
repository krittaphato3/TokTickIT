import cors from 'cors';
import express from 'express';
import { getPrisma } from './prisma.js';
import { ticketsRouter } from './routes/tickets.js';
import { HttpError } from './services/ticket.service.js';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

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

app.get('/api/requesters', async (_req, res) => {
  try {
    const requesters = await getPrisma().requester.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: 'Unable to load requesters from the database' });
  }
});

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
      res
        .status(err.status)
        .json(
          err.details
            ? { error: err.message, details: err.details }
            : { error: err.message },
        );
      return;
    }

    if (
      err instanceof SyntaxError &&
      (err as { type?: string }).type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    console.error(err);
    res.status(500).json({
      error: 'An unexpected error occurred. Please try again.',
    });
  },
);

export default app;
