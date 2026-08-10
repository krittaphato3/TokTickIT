# Lab 1 Test Plan

All required test files are under tests/lab-01 folders.

| Test File | Tool | Test Description |
|---|---|---|
| server/tests/lab-01/api/health.test.ts | Supertest | Health endpoint returns 200 and expected JSON |
| server/tests/lab-01/api/categories.test.ts | Supertest | Categories endpoint returns the four seeded categories |
| client/tests/lab-01/ui/app.test.tsx | Vitest | TokTickIT heading renders |
| client/tests/lab-01/ui/app.test.tsx | Vitest | Loading state changes to category list |
| client/tests/lab-01/ui/app.test.tsx | Vitest | API failure displays a useful error message |

Note: the categories Supertest test reads the seeded database, so PostgreSQL must
be migrated and seeded before running the API tests:

```bash
docker compose up -d
cd server && npx prisma migrate dev && npx prisma db seed
```

Optional additional verification:

| Test File | Tool | Test Description |
|---|---|---|
| client/tests/lab-01/e2e/check-system.spec.ts | Playwright | Human-sequence Check System flow |

# Lab 1 Requirement Audit

| Requirement | Covered By | Evidence |
|---|---|---|
| Health endpoint works | API health test | Supertest output |
| Categories endpoint works | API categories test | Supertest output |
| UI renders app heading | UI heading test | Vitest output |
| UI loading and success behavior | UI success test | Vitest output |
| UI error behavior | UI failure test | Vitest output |
| Human user flow | Playwright check | Local Playwright run |
