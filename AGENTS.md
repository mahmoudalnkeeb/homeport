# Agent instructions

## Goal
Make the smallest correct change that fits the existing architecture. Optimize total task cost (context read + generated code + retries), not line count alone.

## Before editing
1. Read this file and the nearest `AGENTS.md` only.
2. Inspect the target file and directly related files. Search for symbols; do not scan the whole repository.
3. Check `package.json` scripts before choosing commands.
4. Read `docs/architecture.md` only when the change affects module boundaries or shared infrastructure.
5. Do not read `node_modules`, build output, coverage, or lockfiles in full.

## Context and token efficiency
- Use targeted search (`rg`) and bounded file reads. Never dump the repository tree or large files without a concrete need.
- Do not reread files already present in the current context unless they may have changed.
- Prefer one focused implementation over speculative alternatives.
- Reuse existing utilities and established patterns; do not create a second way to solve the same problem.
- Do not add dependencies for functionality already available in Node.js or NestJS.
- Do not add abstractions, wrappers, base classes, factories, generic repositories, or barrel files without a demonstrated second use case.
- Avoid generated documentation and tests that merely restate the implementation.
- Keep final responses concise: changed paths, behavior, commands run, and any unresolved issue.

## Architecture
- Organize code by business domain: `src/<domain>/` holds `<domain>.module.ts` (the `@Module` only), `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.dto.ts` and, when it owns tables, `<domain>.schema.ts`. Controllers never live in a module file.
- Keep controllers transport-only: take validated DTOs, call one service method, return its result. No business rules, no data shaping, no orchestration of several services.
- Put business rules in services or focused domain functions, not controllers.
- Keep modules explicit. Export providers only when another module consumes them.
- Avoid circular dependencies. Do not solve them with `forwardRef()` until the dependency direction has been reconsidered.
- Do not introduce CQRS, event buses, microservices, or DDD ceremony by default.
- Keep infrastructure replaceable only where a real boundary or requirement exists.

## TypeScript
- Strict mode stays enabled. Never use `any`; use `unknown` at untrusted boundaries and narrow it.
- Prefer inferred local types and explicit public function/DTO return types where they clarify contracts.
- Avoid redundant annotations, non-null assertions, type casts, and enums when a union or `as const` is sufficient.
- Use `import type` for type-only imports.
- Prefer `async`/`await` when it improves readability. Do not wrap a returned promise in an unnecessary `async` function.
- Use early returns when they simplify control flow.
- Keep functions focused. Do not split short, cohesive logic into many one-line helpers.
- No code comments. Express intent through names, types and tests; put explanations in docs. Tool directives (`@ts-expect-error`, lint-disable) are the only exception.

## Validation and API contracts
- HTTP input is validated by class-validator DTOs (`<domain>.dto.ts`) through the global `ValidationPipe` (whitelist + forbidNonWhitelisted). Every `@Body()`, `@Query()` and `@Param()` takes a DTO class. A request DTO `implements` its interface from `@homeport/contracts`.
- List query DTOs extend `PaginationQueryDto`.
- Every JSON handler declares `@Serialize(ResponseDto)` or `@EmptyResponse()`. Response DTOs `@Expose()` only the fields clients may see, so DB rows can be returned without leaking internals.
- Responses are always `{ data }`, `{ data, meta }` for lists, or `{ error: { status, code, message, details? } }`. `ResponseInterceptor` and `HttpErrorFilter` produce them; never build an envelope by hand.
- A service returning a list returns `Paginated` (`Paginated.of` for DB queries, `Paginated.slice` for in-memory lists, `Paginated.all` for short fixed lists). Returning a bare array from a handler is an error.
- Use `AppError(status, code, message)` when the client needs a specific `ErrorCode`; otherwise plain Nest exceptions.
- Zod stays for non-HTTP input only: environment variables (`config/env.ts`) and the host agent's response (`hostMetricsSchema`).
- Never trust TypeScript types to validate runtime data.
- Never trust TypeScript types to validate runtime data.

## Errors, logging, and security
- Use Nest HTTP exceptions for expected HTTP failures. Do not catch an error only to rethrow it unchanged.
- Do not expose stack traces, secrets, tokens, SQL, or internal error details to clients.
- Use structured logs with stable event names and useful identifiers. Never log credentials, access tokens, or sensitive payloads.
- Read secrets from environment/configuration; never hardcode them or commit `.env`.
- Apply authorization at the relevant boundary; authentication alone is not authorization.
- Use the Drizzle query builder (parameterized). Raw SQL only through the `sql` template tag. Avoid logging full request bodies by default.

## Tests
- Add or update tests for changed behavior, not implementation details.
- Prefer focused unit tests for business rules and integration tests for database/HTTP behavior.
- Test success, invalid input, and important failure paths.
- Do not mock the unit under test. Mock only external boundaries.
- Run the narrowest relevant test first, then typecheck/lint/build as appropriate.
- Never claim a check passed unless it was actually run.

## Dependencies and generated files
- Do not add a package for a one-line utility.
- Before adding a dependency, verify it supports the project's Node.js and NestJS versions and explain why existing tools are insufficient.
- Keep all `@nestjs/*` packages on the same major version.
- Update the lockfile only when dependencies change. Never hand-edit it.
- Do not edit generated output in `dist/` or migrations in `apps/server/drizzle/`. Change a `*.schema.ts`, then run `pnpm db:generate`.
- Do not run broad formatting over unrelated files.

## Definition of done
- The change is minimal and consistent with nearby code.
- Runtime input is validated and errors are handled at the correct boundary.
- Relevant tests and static checks were run, or the reason they were not run is stated.
- No unrelated files, dependencies, or architecture were changed.

## This project
- pnpm monorepo: `apps/server` (NestJS 12 API), `apps/web` (Preact + Vite SPA), `apps/agent` (native host metrics agent), `packages/contracts` (shared API types, envelope and error codes), `packages/host-metrics` (sampler used by server and agent), `packages/ui` (design system). Run scripts from the root (`pnpm dev|build|test|typecheck|lint`).
- A tool is a server module in `apps/server/src/tools/<id>/` (registered in `TOOLS`) plus a client page in `apps/web/src/tools/<id>/` (registered in `CLIENT_TOOLS`); see README "Adding a tool".
- API shapes live only in `@homeport/contracts`. Server DTOs implement them; the web client types against them. Never redeclare them in an app.
- UI is built from `@homeport/ui` components; read `DESIGN.md` before UI work. Extend the package rather than restyling components inside a tool.
- HTTP runs on Nest's `NodeAdapter` (`@nestjs/platform-node`), not Express. Type `@Req()`/`@Res()` as `NodeRequest`/`NodeResponse`, import Multer interceptors and `MulterModule` from `@nestjs/platform-node`, and pass `new NodeAdapter()` to `createNestApplication()` in e2e tests. Express-only APIs (`res.download()`, `res.attachment()`, `req.accepts()`, `req.range()`) don't exist; use `res.sendFile()` with its `headers` option.
- All filesystem access goes through `FilesService.resolve()`; never join client paths to `DATA_DIR` directly.
- Auth: every route needs a session unless marked `@Public()`. Gate admin routes with `@RequirePermission(...)`, and file paths with `pathAccess()` from `@homeport/contracts`, the single rule both the server and the UI use. Roles and permissions live only in `ROLE_PERMISSIONS`.
- Database: Postgres via Drizzle. Each module owns its tables in its own `*.schema.ts` (users, sessions, activity); there is no central schema file. Inject the client with `@InjectDb()` and use the query builder. Migrations run at startup unless `DB_MIGRATE=false`.
- Tests use PGlite with the real migrations (`test/support.ts`); no Docker needed. End-to-end tests boot `AppModule` and override the `DB` provider.
- `STATE_DIR` holds only the initial admin password file and must never be inside `DATA_DIR`. Never log passwords, session tokens or temporary passwords.
- Server paths (`.env`, `DATA_DIR`, `WEB_DIST`) resolve from the repository root via `REPO_ROOT`, because package scripts run from `apps/server`.
- Host metrics: inside Docker Desktop/WSL the server sees a VM, so it reads the host agent first and labels any fallback via `SystemSnapshot.source`. Never present VM numbers as host numbers. The agent stays dependency-free and read-only.
