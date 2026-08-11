import { PrismaClient } from '@prisma/client';

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that do not touch the database free of
// database side effects. Used by the category list route (Issue 4).
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
