import cors from 'cors';
import express from 'express';
import { getPrisma } from './prisma.js';

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

export default app;
