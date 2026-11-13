# Homelab

A modular homelab utility server for the home network: browse and stream files, write Markdown notes, and watch host health from one dashboard. Everyone signs in with their own account: admins run the server, and members get a shared library plus a private space.

It's a pnpm monorepo. A NestJS 12 API serves a Preact single-page app. Each tool is a pair: a Nest module on the server and a Preact module on the client. Both are built on a shared design system and shared API contracts.

## Layout

```text
apps/
  server/          @homelab/server: NestJS 12 API (+ serves the built web app)
    src/tools/<id>/      server half of each tool (module, controller, service, DTOs, manifest)
  web/             @homelab/web: Preact + Vite single-page app
    src/tools/<id>/      client half of each tool (page and its components)
    src/pages/           Control Center (admin), member home, Users, Account, sign-in, /ds
  agent/           @homelab/agent: host metrics agent, runs natively on the host (no deps)
packages/
  contracts/       @homelab/contracts: API types + Zod request schemas, shared by both apps
  host-metrics/    @homelab/host-metrics: dependency-free CPU/memory/disk sampler (server + agent)
  ui/              @homelab/ui: design system (tokens, CSS, Preact components, icons, theme)
```

Dependencies only point inward: `apps/*` → `packages/*`, `ui` → `contracts`. The apps never import each other.

## Requirements

- Node.js 24.15+
- pnpm 12 (`corepack enable`)
- Postgres 16+ (`pnpm db:up` runs one in Docker)

## Develop

```bash
pnpm install
cp .env.example .env
pnpm db:up   # Postgres on 127.0.0.1:5432 (Docker); migrations run when the server starts
pnpm dev     # API on :3000 (watch), web on http://localhost:5173 (HMR, proxies /api)
```

```bash
pnpm build       # contracts → server + web
pnpm start       # API serves apps/web/dist at http://localhost:3000
pnpm typecheck
pnpm lint
pnpm test        # server tests run on PGlite (in-process Postgres); no database needed
```

### Database

Postgres through [Drizzle](https://orm.drizzle.team). Each module owns its tables in its own schema file, next to the code that uses them:

| Table             | Schema file                                   |
| ----------------- | --------------------------------------------- |
| `users`           | `apps/server/src/users/users.schema.ts`       |
| `sessions`        | `apps/server/src/sessions/sessions.schema.ts` |
| `activity_events` | `apps/server/src/activity/activity.schema.ts` |

Columns are camelCase in TypeScript and snake_case in Postgres. Migrations live in `apps/server/drizzle/` and are applied on server start (`DB_MIGRATE=false` to apply them yourself).

| Script             | Does                                                            |
| ------------------ | --------------------------------------------------------------- |
| `pnpm db:up`       | Start the compose Postgres and wait until it is healthy         |
| `pnpm db:down`     | Stop it (data stays in the `pgdata` volume)                     |
| `pnpm db:generate` | Write a migration from changes to any `*.schema.ts`             |
| `pnpm db:migrate`  | Apply pending migrations to `DATABASE_URL`                      |
| `pnpm db:check`    | Check the migration history is consistent                      |
| `pnpm db:studio`   | Browse and edit the data in Drizzle Studio                      |

To change the schema: edit the module's `*.schema.ts`, run `pnpm db:generate`, review the SQL, and commit both.

## Configuration

The server reads `.env` from the repository root. Relative paths resolve against the repository root, wherever the command runs from.

| Variable        | Default         | Purpose                                                     |
| --------------- | --------------- | ----------------------------------------------------------- |
| `PORT`          | `3000`          | API port (the Vite proxy follows it)                        |
| `HOST`          | `0.0.0.0`       | Bind address (`127.0.0.1` for local-only)                   |
| `DATABASE_URL`  | required        | Postgres connection, e.g. `postgres://homelab:homelab@localhost:5432/homelab` |
| `DB_MIGRATE`    | `true`          | Apply pending migrations on start                           |
| `DATA_DIR`      | `data`          | Folder the Files tool manages                               |
| `STATE_DIR`     | `state`         | Private server files (the initial admin password). Must not be inside `DATA_DIR`; the server refuses to start if it is |
| `ADMIN_PASSWORD`| –               | First start only: password for the `admin` account (8+ characters). Unset → random, written to `STATE_DIR/initial-admin-password.txt` and replaced at first sign-in |
| `SESSION_DAYS`  | `30`            | How long a sign-in lasts                                    |
| `MAX_UPLOAD_MB` | `4096`          | Per-file upload limit                                       |
| `LAN_URLS`      | –               | Comma-separated addresses to advertise instead of detected interfaces |
| `PUBLIC_PORT`   | `PORT`          | Port used in the advertised LAN addresses                   |
| `HOST_AGENT_URL`| –               | Host agent to read host metrics from (see Docker)           |
| `WEB_DIST`      | `apps/web/dist` | Built web app the API serves                                |

## Accounts and roles

On first start the server creates an `admin` account (see `ADMIN_PASSWORD`). Admins add everyone else on **Users**. A new account gets a temporary password, shown once, which the person replaces at first sign-in.

|                                              | Admin          | Member                                |
| -------------------------------------------- | -------------- | ------------------------------------- |
| Host health, network, everyone's activity    | yes            | no                                    |
| Manage users                                 | yes            | no                                    |
| Shared library (`DATA_DIR` outside `users/`) | read and write | read only                             |
| Personal space `DATA_DIR/users/<name>/`      | everyone's     | their own; other spaces are invisible |

- There is always at least one active admin, and nobody can disable, demote or delete their own account.
- Passwords are hashed with scrypt. Sessions are `HttpOnly` cookies; Postgres stores only a SHA-256 of each token, so they survive restarts. Changing your password signs out your other devices; an admin disabling an account or resetting its password signs it out everywhere.
- After 5 failed sign-ins, that username is locked out from that address for 15 minutes.
- Every request that changes something must send `X-Homelab-Request: 1`, which blocks cross-site request forgery.
- Lost admin password: another admin can reset it on **Users**. If there is none, empty the accounts (`docker compose exec postgres psql -U homelab -c 'TRUNCATE users CASCADE'`) and restart. The next start creates a fresh `admin`; files in `DATA_DIR` are untouched.

Traffic is plain HTTP. Keep the server on a trusted network or a VPN, or put an HTTPS reverse proxy in front of it.

## Docker

```bash
docker compose up -d --build     # → http://localhost:3000
pnpm agent                       # on the host, for real host metrics (see below)
```

Compose runs two containers: `postgres` (data in the `pgdata` volume, published on `127.0.0.1:5432` for local tools) and `utility-server`, which starts once Postgres is healthy and applies migrations. The image ships a pruned server bundle (`pnpm deploy --prod`), its migrations and the static web build. `./data` is bind-mounted at `/data` and `./state` at `/state`. Point `DATA_PATH` at your media folder to manage that instead. The container is healthy when `GET /api/health` can reach the database.

| Variable         | Default                             | Purpose                                                       |
| ---------------- | ----------------------------------- | ------------------------------------------------------------- |
| `PORT`           | `3000`                              | Host port to publish (also used for the LAN addresses shown)  |
| `DATA_PATH`      | `./data`                            | Host folder mounted as the data directory                     |
| `STATE_PATH`     | `./state`                           | Host folder for private server files                          |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `homelab` | Database credentials, used by both containers |
| `POSTGRES_PORT`  | `5432`                              | Loopback port Postgres is published on                        |
| `ADMIN_PASSWORD` | –                                   | First start only: bootstrap admin password                    |
| `HOST_AGENT_URL` | `http://host.docker.internal:3001`  | Where the container finds the host agent                      |
| `AGENT_TOKEN`    | –                                   | Shared secret between server and agent (optional)             |
| `LAN_URLS`       | –                                   | Override the addresses shown on the homepage                  |
| `LAB_HOSTNAME`   | `homelab`                           | Container hostname (shown only without the agent)             |

### Host metrics: the agent

A container can only measure the machine its kernel runs on:

| Where Docker runs                                  | Without the agent                    | With `pnpm agent`  |
| -------------------------------------------------- | ------------------------------------ | ------------------ |
| Docker Desktop (Windows, macOS, Linux)             | The Docker **VM**, flagged on the dashboard | The real host |
| Docker Engine on Linux                             | Host CPU, memory and disk; container hostname | The real host |
| No Docker (`pnpm start`)                           | The real host                        | not needed         |

`apps/agent` is a dependency-free Node process that runs **natively on the host**. It serves `GET /metrics` on `127.0.0.1:3001`, reading the same root `.env` as everything else. The server validates the agent's response against the shared contract, falls back to its own view when the agent is down, and shows which source is in use on the Control Center.

```bash
pnpm agent                                   # build + run in the foreground
pnpm --filter @homelab/agent... build        # build once, then autostart:
node apps/agent/dist/main.js
```

| Agent variable    | Default                  | Purpose                                                   |
| ----------------- | ------------------------ | --------------------------------------------------------- |
| `AGENT_PORT`      | `3001`                   | Listen port                                               |
| `AGENT_HOST`      | `127.0.0.1`              | Bind address. Docker Desktop reaches host loopback. With Docker Engine on Linux, use `0.0.0.0` (plus a firewall rule or `AGENT_TOKEN`). |
| `AGENT_TOKEN`     | –                        | Require `Authorization: Bearer <token>`                   |
| `AGENT_DISK_PATH` | `DATA_PATH` → `DATA_DIR` → `data` | Filesystem reported as the data disk             |

Start it at login (replace `<repo>` with the repository path, after building once):

- **Windows**: `schtasks /Create /TN "Homelab agent" /SC ONLOGON /TR "node <repo>\apps\agent\dist\main.js"`
- **macOS**: a LaunchAgent in `~/Library/LaunchAgents/` whose `ProgramArguments` are `$(which node)` and `<repo>/apps/agent/dist/main.js`, with `RunAtLoad` set; then `launchctl load` it.
- **Linux**: a `systemd --user` service with `ExecStart=/usr/bin/node <repo>/apps/agent/dist/main.js`; then `systemctl --user enable --now homelab-agent`.

## Tools

| Route             | Tool                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `/`               | Admin: Control Center (host health, accounts and sessions, activity feed, storage, quick actions). Member: home (quick actions, notes to continue, new library files, own storage and activity) |
| `/tools/files`    | Files: Library / My files switch, list/grid, drag-and-drop uploads with progress, preview and range streaming, rename, delete. Actions the user may not take are hidden |
| `/tools/markdown` | Markdown: write/split/read, highlighting, Mermaid with pan & zoom, save with <kbd>Ctrl</kbd>+<kbd>S</kbd>. Library notes open read-only with **Save copy** for members |
| `/users`          | Admin: add, rename, change role, reset password, disable or delete accounts           |
| `/account`        | Profile, what you can do, password change, theme, sign out                            |
| `/ds`             | Internal design-system reference (admin only, not linked in the UI)                   |

### Adding a tool

1. **Contracts**: add the request schemas and response types the tool's API needs to `packages/contracts/src/index.ts`.
2. **Server**: in `apps/server/src/tools/<id>/`, add `<id>.module.ts`, `<id>.controller.ts`, `<id>.service.ts` and `<id>.dto.ts` (plus `<id>.schema.ts` if it stores data), and `<id>.tool.ts` exporting a `ToolDefinition` (`manifest` + Nest `module`). Add it to `TOOLS` in `apps/server/src/tools/registry.ts`. Give the manifest a `summaryUrl` returning a `ToolSummary` to feature the tool on the home pages.
3. **Client**: create `apps/web/src/tools/<id>/<Name>Page.tsx` (default export) and add it to `CLIENT_TOOLS` in `apps/web/src/tools/registry.ts`. Build the UI from `@homelab/ui` components. See `DESIGN.md`.

The navigation, tool cards and quick actions come from the server manifest. A tool appears once both halves are registered.

## API

Every route except `POST /api/auth/login` and `GET /api/health` needs a session. Routes marked *admin* return `403` to members.

Every JSON response has the same shape. Only file streams and downloads (`/api/files/raw`) are raw.

```jsonc
{ "data": { } }                                                         // one object, or null for actions
{ "data": [ ], "meta": { "page": 1, "pageSize": 50, "total": 132, "totalPages": 3 } }   // every list
{ "error": { "status": 422, "code": "VALIDATION_FAILED", "message": "Invalid request",
             "details": [ { "field": "password", "message": "At least 8 characters" } ] } }
```

- Lists take `?page=` (from 1) and `?pageSize=` (default 50, max 200).
- Requests are validated against DTOs: unknown fields are rejected and every broken rule is listed in `details` (`422`).
- `code` is one of `ERROR_CODES` in `@homelab/contracts` (`UNAUTHENTICATED`, `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_HEADER_MISSING`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, …). Server errors never include internals.
- Responses carry only the fields their DTO exposes; password hashes and internal ids never leave the server.

| Method | Route                            | Description                                     |
| ------ | -------------------------------- | ----------------------------------------------- |
| POST   | `/api/auth/login`                | `{ username, password }`: start a session       |
| POST   | `/api/auth/logout`               | End this session                                |
| GET    | `/api/auth/me`                   | The signed-in user                              |
| POST   | `/api/auth/password`             | `{ current, next }`: change your password; signs out your other sessions |
| GET    | `/api/health`                    | Public: `{ status, database }`, `503` when Postgres is unreachable |
| GET    | `/api/users`                     | *admin*, list: accounts (admins first) with storage and last sign-in |
| GET    | `/api/users/stats`               | *admin*: accounts, admins, disabled, active sessions, storage |
| POST   | `/api/users`                     | *admin*: `{ username, displayName, role, password }` |
| PATCH  | `/api/users/:username`           | *admin*: `{ displayName?, role?, disabled? }`   |
| POST   | `/api/users/:username/password`  | *admin*: `{ password }`: set a temporary password |
| DELETE | `/api/users/:username?deleteFiles=` | *admin*: delete the account, optionally its space |
| GET    | `/api/tools`                     | List: tool manifests the user may use           |
| GET    | `/api/system`                    | *admin*: host metrics + ~6 min CPU/memory history |
| GET    | `/api/activity`                  | *admin*: request counts since start (last hour, per area) |
| GET    | `/api/activity/events`           | *admin*, list: everyone's events, newest first   |
| GET    | `/api/activity/mine`             | List: the signed-in user's own events            |
| POST   | `/api/activity/pageview`         | `{ path }`: client route views                  |
| GET    | `/api/files?path=`               | List: a folder, folders first then by name      |
| GET    | `/api/files/recent?scope=&kind=` | List: recently modified files the user can see (`scope`: all, library, home) |
| GET    | `/api/files/raw?path=&download=` | Stream a file (HTTP range supported)            |
| POST   | `/api/files/upload?path=`        | List: multipart upload, field `files`; returns the saved files |
| PUT    | `/api/files/text`                | `{ path, content }`: write a text/markdown file |
| POST   | `/api/files/folder`              | `{ path }`: create a folder                     |
| POST   | `/api/files/rename`              | `{ path, name }`                                |
| DELETE | `/api/files?path=`               | Delete a file or folder                         |
| GET    | `/api/files/summary`, `/api/markdown/summary` | Home page summaries               |

All paths are resolved inside `DATA_DIR`. Traversal and symlink escapes are rejected with `403`. A member gets `404` for another person's space and `403` for writes outside their own.

## License

[MIT](LICENSE)
