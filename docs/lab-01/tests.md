# Lab 1 Tests

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| Test ID | Test File | Tool | Test Description | Status |
|---|---|---|---|---|
| API-01 | server/tests/lab-01/api/health.test.ts | Supertest | Health endpoint returns 200 and expected JSON | Passing |
| API-02 | server/tests/lab-01/api/categories.test.ts | Supertest | Categories endpoint returns the four seeded categories | Passing |
| UI-01 | client/tests/lab-01/ui/app.test.tsx | Vitest | TokTickIT heading renders | Passing |
| UI-02 | client/tests/lab-01/ui/app.test.tsx | Vitest | Loading state changes to category list | Passing |
| UI-03 | client/tests/lab-01/ui/app.test.tsx | Vitest | API failure displays a useful error message | Passing |
