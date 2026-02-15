# AGENTS

## Purpose

- Provide a quick reference for agentic coding in this repo.
- Capture build, lint, and test commands, including single test runs.
- Summarize code style and architecture conventions used here.

## Repo summary

- Stack: Next.js App Router, React 19, TypeScript, Hono, Better Auth, Drizzle ORM, Postgres, R2 (aws4fetch).
- Package manager: pnpm (see package.json packageManager).
- Use pnpm commands; avoid npm or yarn to prevent lockfile churn.
- pnpm-workspace.yaml is present; run commands at workspace root.
- Node version pinned in .node-version (22.14.0).
- Path alias: "@/" maps to repo root via tsconfig.
- Formatting and linting: Biome + ESLint + Prettier; pre-commit runs all three.
- No Cursor or Copilot instruction files found.

## Setup and local dev

- Install dependencies: `pnpm i` (CI uses pnpm/action-setup + corepack).
- Optional: `pnpm setup` to enable pnpm via corepack.
- Copy env: `cp .env.example .env` (CI does this).
- Start DB: `pnpm db:up` (docker compose, requires Docker).
- Stop DB: `pnpm db:down`.
- Run dev server: `pnpm dev` (runs db:up then next dev).
- Build for prod: `pnpm build`; run: `pnpm start`.
- DB tasks: `pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate`, `pnpm db:studio`.
- Compose file: compose.yml; testcontainers uses it for DB tests.

## Build, lint, format, test

### Build

- `pnpm build` (Next.js production build).
- `pnpm start` (serve the build).

### Lint and format

- `pnpm fmt` -> Prettier for md/yml + Biome format for code.
- `pnpm lint` -> Biome lint --write, ESLint --fix, Knip.
- CI lint: `npx biome check .` and `npx prettier --check './**/*.{md,yml}'`.
- If you add deps or entrypoints, update knip.config.ts as needed.

### Tests

- `pnpm test` -> `NODE_ENV=test vitest run` (uses jsdom).
- Single test file: `pnpm test -- server/routes/auth.test.ts`.
- Single test by name: `pnpm test -- -t "createSecureMessageWorkflow"`.
- Watch mode: `pnpm vitest` (not in scripts, but available).
- Test include glob: `./**/*.test.{ts,tsx}`.
- Tests that touch DB require Docker; see tests/vitest.helper.ts.

### CI and hooks

- GitHub Actions: .github/workflows/ci.yml runs lint + pnpm test.
- Lefthook pre-commit runs: Biome check --write, Prettier -w, ESLint --fix.
- Expect staged files to be auto-formatted by hooks.

## Code style and conventions

### Formatting

- Biome is the default formatter (see .vscode/settings.json).
- Indentation: tabs; quotes: double.
- Organize imports is enabled via Biome.
- Use Prettier only for md/yml; use Biome for TS/TSX/JS/JSON/CSS.
- Keep files ASCII unless a file already uses Unicode and needs it.

### Imports

- Order: external deps, internal alias (`@/...`), relative imports.
- Prefer type-only imports: `import type { Foo } from "..."`.
- If mixing value + type, use `import { foo, type Foo } from "..."`.
- Use the `@/` alias instead of deep relative paths.
- Keep import groups separated by a blank line.

### TypeScript and typing

- TS is strict; keep types explicit for public APIs, state, and IO.
- Favor `type` for object shapes; `interface` is also used for domain entities.
- Use Zod for input validation; prefer safeParse + typed output.
- Avoid `any`; use `unknown` plus narrowing when needed.
- Use `as const` for immutable return shapes (see tests helpers).
- Prefer `const` functions; use `export function` for components.

### Naming and structure

- Components: PascalCase exports in kebab-case files (e.g., components/site-header.tsx).
- Hooks and helpers: camelCase. Constants: UPPER_SNAKE_CASE.
- Server code lives in server/:
- routes/ for Hono endpoints.
- applications/usecases/ for business workflows.
- infrastructure/ for repositories and utils.
- objects/ for domain value objects.
- DB schema uses snake_case column names with camelCase fields.

### React and Next.js

- App Router in app/; server components by default.
- Add "use client" at top for components using hooks or browser APIs.
- Use next/link for navigation; avoid raw `<a>` for internal routes.
- Keep layout in app/layout.tsx; prefer composition via components/.
- Styling uses Tailwind v4 classes in className strings.
- Use simple loading and error state patterns (isLoading, error, data).
- Use client components for forms and session UI; server components for static content.

### Client data fetching patterns

- Use lib/api-client.ts (hono/client) for typed requests.
- Check response.ok before parsing; return or set error early.
- Parse JSON with try/catch or .catch(() => null) for error bodies.
- Use useEffect cleanup or ignore flags to avoid setting state after unmount.
- Use void for fire-and-forget async calls in handlers.

### API and Hono

- API entry: app/api/[[...route]]/route.ts uses hono/vercel handle.
- Hono app is created in server/create-app.ts and exported from server/hono-app.ts.
- Add new routes under server/routes and mount in server/hono-app.ts.
- Use Context from server/types for typed c.get and bindings.
- Client calls use lib/api-client.ts (hono/client typed by AppType).
- Auth routes should keep auth.handler(c.req.raw) catch-all at the end.

### Error handling and validation

- Use getUserOrThrow for auth-protected routes (throws HTTPException 401).
- Throw HTTPException or ValidationError for predictable JSON errors.
- createHonoApp has a global error handler that returns { error }.
- For env and config failures, fail fast with clear messages.
- Avoid swallowing errors; return explicit 4xx/5xx responses.

### Database and migrations

- DB client is in lib/db.ts and reads DATABASE_URL; throws if missing.
- Drizzle schema in db/schema.ts; keep relations in same file.
- Migrations live in db/migrations; use drizzle-kit via pnpm db:\* scripts.
- Use createDBUrl for composing test DB URLs.
- In tests, use tests/vitest.helper.ts for DB setup and truncation.

### Storage (R2)

- R2 client is attached per request in server/create-app.ts via AwsClient.
- File repository lives in server/infrastructure/repositories/file.
- Use createBlobFile and toUploadedFile from server/objects/file.

### Tests

- Use Vitest (globals enabled). Prefer describe/it with inline snapshots.
- Tests can use vi.hoisted for mocks and testcontainers for DB.
- Use tests/vitest.helper.ts setup() to bootstrap DB and auth mocks.
- Keep test data deterministic (fixed dates, ids).
- Name test files with .test.ts or .test.tsx.
- Top-level await is used in tests for setup() helpers.

### Environment

- env.ts validates env vars via Zod; config() is called in Next/Vitest configs.
- Required vars include BETTER*AUTH_URL, BETTER_AUTH_SECRET, DATABASE_URL, `R2*\*`.
- Use .env.example as the base; .env and .env.local are gitignored.
- For tests, .env.test supplies minimal R2 values.
- To bypass validation, set SKIP_ENV_VALIDATION=true (use sparingly).

## Notes for agents

- Avoid committing .env files or secrets.
- Prefer repo scripts over ad-hoc commands when possible.
- When adding new code, keep existing patterns and folder structure.
- Run lint/format/test before committing changes.
- Keep documentation updates in Markdown only (AGENTS.md, README.md).
