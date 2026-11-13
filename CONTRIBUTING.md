# Contributing to Homeport

Thanks for helping. Bug reports, fixes, docs and new tools are all welcome. For anything bigger than a small fix, please open an issue first so we can agree on the approach before you spend time on it.

## Set up

You need Node.js 24.15+, pnpm 12 (run `corepack enable` once) and Docker. Windows, macOS and Linux all work, and every command below is the same in any shell.

```sh
git clone https://github.com/mahmoudalnkeeb/homeport.git
cd homeport
pnpm install
node scripts/setup-env.mjs
pnpm services:up
pnpm dev
```

`pnpm dev` runs the API on port 3000 in watch mode and the web app on <http://localhost:5173>. The first `admin` password is in `state/initial-admin-password.txt`.

## Before you open a pull request

```sh
pnpm typecheck
pnpm lint
pnpm test
```

All three must pass. Tests need no running services.

- Keep the change focused. Unrelated refactors and formatting go in their own pull requests.
- Add or update tests for any behaviour you change.
- Changing a `*.schema.ts`? Run `pnpm db:generate` and commit the generated migration. Never edit existing migrations.
- Changing the UI? Build it from `@homeport/ui` and follow [DESIGN.md](DESIGN.md). Check it in light and dark themes and at phone width.
- Update the docs when you change configuration, routes or behaviour users can see.
- Write commit messages in the imperative, with a type prefix: `feat: add playlist shuffle`, `fix: keep uploads inside the user's space`.

## Project layout

```text
apps/
  server/        @homeport/server  NestJS API; also serves the built web app
  web/           @homeport/web     Preact + Vite single-page app
  agent/         @homeport/agent   host metrics agent, runs natively on the host
packages/
  contracts/     @homeport/contracts     API types shared by server and web
  host-metrics/  @homeport/host-metrics  dependency-free CPU, memory and disk sampler
  ui/            @homeport/ui            design system: tokens, components, icons
docs/            configuration, API and host agent guides
```

Dependencies only point inward: `apps/*` use `packages/*`, and the apps never import each other.

[AGENTS.md](AGENTS.md) has the full coding conventions: module layout, validation, the response envelope, error handling and tests.

## Adding a tool

A tool is a server module plus a client page.

1. **Contracts**: add the tool's request and response types to `packages/contracts/src/index.ts`.
2. **Server**: in `apps/server/src/tools/<id>/`, add the module, controller, service and DTOs (plus a `*.schema.ts` if it stores data). Add `<id>.tool.ts`, which exports a `ToolDefinition`, and register it in `TOOLS` in `apps/server/src/tools/registry.ts`. Give the manifest a `summaryUrl` to feature the tool on the home pages.
3. **Client**: create `apps/web/src/tools/<id>/<Name>Page.tsx` (default export) and register it in `CLIENT_TOOLS` in `apps/web/src/tools/registry.ts`.

Navigation, tool cards and quick actions come from the server manifest. The tool appears once both halves are registered.

## Reporting bugs

Open an issue with what you did, what you expected, what happened instead, and your OS, browser and Homeport commit. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
