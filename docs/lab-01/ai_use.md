# Lab 1 AI Use and Reflection

I used ZCODE Harness + VSCODE. Model: [Deepseek V4 Flash 0731]. Thinking level: [Max].

Selected Key Prompts:

| Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|
| Plan Lab 1 | {provided the Issues and file directory structural} Read the enclosed TokTickIT Lab 1 requirements. Summarize the four GitHub Issues, their dependencies, required outputs, and required automated tests. Propose an implementation order, but do not write code yet. | My Reflection: I provided the file which contain Issues and Directory Structural as provided in the PDF while instructed it to sumarize parts and clear instruct that need to be use later on and important, i think its a crucial step for its not to step on the boundaries we set, especially when i have so many skills, MCP and subagents |
| Set Up Full-Stack Project | Setup the TokTickIT project tech stack as given in Lab 1 using React, TypeScript, Vite, and Bootstrap for the frontend, and Node.js, Express, and TypeScript for the backend. Configure PostgreSQL and Prisma. Use the required folder structure. Do not add functionality beyond the Issue 1 Scope. | My Reflection: as i instructed it to code, as i already set the boundaries i make the AI Agents code as requirement, and make slightly adjustment later manually like adding the .gitignore and .env.example |
| Implement Health Check | Add GET /api/health to the existing Express backend. It must return HTTP 200 with { status: "ok", service: "TokTickIT API" }. Add a Supertest test under server/tests/lab-01/api/. Update the React Check System button to call the real endpoint, show a loading state, and display System Status: Online/Offline with an error message. Do not add categories. | My Reflection: I told it to add reply and requirement that needed to satisfy the instruction of the issue 2, as well as supertest and update the react button to call endpoint as it needed for checking, and also testing on http://localhost:4000/api/health as well to get the required return |
| | | My Reflection: ... |
| Implement Category Feature | Create the Prisma Category model (id, unique name, createdAt) and a migration that creates the table. Add an idempotent seed that inserts Account and Access, Hardware, Software, and Network, and must be safe to run more than once without duplicates. Wire up the standard npx prisma db seed command. Do not add any API route. | My Reflection: ... |
| | | My Reflection: ... |