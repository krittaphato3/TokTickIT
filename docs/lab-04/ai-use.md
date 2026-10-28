# AI Use and Reflection

LLM used: Antigravity / Gemini 3.8 Flash Medium (thought level: high)

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| Contract Spec Agent | Write the Sprint 4 engineering contract (specification, tests, ui-spec, api-spec, reviewer) from the handout digest and my default decisions; Lab 3 behavior is the base; every AC must map to a planned test. | [TODO: write your own reflection] |
| Actions Taken Foundation | Write failing API and migration tests first, then implement the ActionTaken schema, data-preserving migration, rollback SQL, idempotent seed and Actions Taken API per the contract. | [TODO: write your own reflection] |
| Ticket Workflow | Implement a single server-side transition matrix, the resolution gate, and expectedVersion conflict handling with API, unit, UI and E2E tests; the backend must reject UI-bypassing calls. | [TODO: write your own reflection] |
| Actions Taken UI | Add the Actions Taken area to Ticket Detail (staff create/edit, requester read-only) per ui-spec.md with validation, busy state, duplicate-submit protection and data preserved after failure. | [TODO: write your own reflection] |
| Dashboards | Implement backend-computed Requester and Staff dashboards with drill-down links and tests comparing every metric to independent DB queries. | [TODO: write your own reflection] |
| Final Hardening | Run an authorization sweep, axe accessibility, responsive and console-error checks and Labs 1-3 regression; fix findings; finalize README and tests.md from real results. | [TODO: write your own reflection] |
| Git/Kanban Protocol | Create branches and Issues, update the Project board, and wait for my PR/FIX/MERGE commands; never open or merge PRs on your own. | [TODO: write your own reflection] |
| Completion Audit | Audit the work against every acceptance criterion and planned test; report missing evidence, skipped tests and spec deviations. | [TODO: write your own reflection] |

Table rows summarize the prompts used; reflections are written by the student.
