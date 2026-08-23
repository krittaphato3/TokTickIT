FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests

# npm ci does not run Prisma's postinstall generator reliably; build the
# client explicitly so seed/build/start can import @prisma/client.
RUN npx prisma generate

# Generate the Prisma Client, apply every committed migration, seed reference
# data, then start the API in production mode. Doing migrations here keeps the
# flow one-command; re-running is idempotent (`prisma migrate deploy` no-ops).
CMD npx prisma migrate deploy && npm run prisma:seed && npm run build && npm start
