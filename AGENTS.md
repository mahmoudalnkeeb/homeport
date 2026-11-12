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
- Avoid generated documentation, comments, and tests that merely restate the implementation.
- Keep final responses concise: changed paths, behavior, commands run, and any unresolved issue.

## Architecture
- Organize code by business domain when domains exist: `src/<domain>/<domain>.module.ts`, controller, service, schemas, and persistence code only when needed.
- Keep controllers transport-focused: parse input, call an application service, return its result.
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
- Do not add comments that repeat the code. Explain only non-obvious constraints or decisions.

## Validation and API contracts
- Use Standard Schema-compatible schemas (Zod by default) as the source of truth for runtime validation and inferred input types.
- Attach schemas to Nest route parameters with the NestJS 12 `schema` option and register `StandardSchemaValidationPipe` globally.
- Do not duplicate a schema as a class-validator DTO, interface, and manual validator.
- Validate all external input: HTTP, environment variables, queue messages, webhooks, and third-party responses.
- Keep response contracts explicit when they are consumed outside this service.
- Never trust TypeScript types to validate runtime data.

## Errors, logging, and security
- Use Nest HTTP exceptions for expected HTTP failures. Do not catch an error only to rethrow it unchanged.
- Do not expose stack traces, secrets, tokens, SQL, or internal error details to clients.
- Use structured logs with stable event names and useful identifiers. Never log credentials, access tokens, or sensitive payloads.
- Read secrets from environment/configuration; never hardcode them or commit `.env`.
- Apply authorization at the relevant boundary; authentication alone is not authorization.
- Use parameterized database queries. Avoid logging full request bodies by default.

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
- Do not edit generated output in `dist/`.
- Do not run broad formatting over unrelated files.

## Definition of done
- The change is minimal and consistent with nearby code.
- Runtime input is validated and errors are handled at the correct boundary.
- Relevant tests and static checks were run, or the reason they were not run is stated.
- No unrelated files, dependencies, or architecture were changed.

## This project
- Tools live in `src/tools/<id>/` and register via `TOOLS` in `src/tools/registry.ts`; see README "Adding a tool".
- Tool UIs are static files in `src/tools/<id>/ui/` (copied to `dist` by nest-cli assets) and must use the design system in `public/ds/` — read `DESIGN.md` before UI work.
- All filesystem access goes through `FilesService.resolve()`; never join client paths to `DATA_DIR` directly.
