# Homelab utility server

A modular NestJS 12 server for a home network: browse and stream files, write Markdown notes, and watch host health from one dashboard. Each tool is a self-contained Nest module with its own API and UI, and every UI shares one design system.

## Requirements

- Node.js 24.15+
- pnpm 10+

## Run

```bash
pnpm install
cp .env.example .env
pnpm dev            # watch mode → http://localhost:3000
pnpm build && pnpm start
```

The server binds to `0.0.0.0`, so other devices on the LAN can open it. The homepage lists the LAN addresses.

### Docker

```bash
docker compose up -d --build     # → http://localhost:3000
```

`./data` is bind-mounted at `/data`. Point `DATA_PATH` at your media folder to manage that instead. Compose reads these from `.env` or the shell:

| Variable       | Default   | Purpose                                                                 |
| -------------- | --------- | ----------------------------------------------------------------------- |
| `PORT`         | `3000`    | Host port to publish                                                    |
| `DATA_PATH`    | `./data`  | Host folder mounted as the data directory                               |
| `LAN_URLS`     | –         | Addresses to show on the homepage, e.g. `http://192.168.1.20:3000`. The container can only see its bridge IP. |
| `LAB_HOSTNAME` | `homelab` | Hostname shown on the homepage                                          |

Inside Docker, the CPU, memory and disk figures describe the container's host VM. On Docker Desktop that's the WSL/Hyper-V VM, not Windows itself.

| Variable        | Default       | Purpose                                  |
| --------------- | ------------- | ---------------------------------------- |
| `PORT`          | `3000`        | HTTP port                                |
| `HOST`          | `0.0.0.0`     | Bind address (`127.0.0.1` for local-only) |
| `DATA_DIR`      | `data`        | Folder the Files tool manages            |
| `MAX_UPLOAD_MB` | `4096`        | Per-file upload limit                    |
| `LAN_URLS`      | –             | Comma-separated addresses to advertise instead of detected interfaces |

> There is no authentication. Anyone who can reach the port can read, upload and delete files in `DATA_DIR`. Keep it on a trusted network or bind `HOST=127.0.0.1`.

## What's inside

| Path            | What it is                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| `/`             | Overview: CPU/memory/disk, request traffic, storage breakdown, recent files, activity feed, quick actions |
| `/tools/files/` | File manager: list/grid views, drag-and-drop uploads with progress, preview & streaming for video, audio, images, PDF and text, rename, delete |
| `/tools/markdown/` | Markdown editor (from `md-viewer`): write/split/read views, highlighting, Mermaid with pan & zoom, save to the data folder with <kbd>Ctrl</kbd>+<kbd>S</kbd> |
| `/ds/`          | Internal design system reference (not linked in the UI)                    |

### API

| Method | Route                       | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| GET    | `/api/tools`                | Registered tool manifests                    |
| GET    | `/api/system`               | Host metrics + ~6 min CPU/memory history     |
| GET    | `/api/activity`             | Request counts (last hour, per area) and events |
| GET    | `/api/files?path=`          | List a folder                                |
| GET    | `/api/files/raw?path=&download=` | Stream a file (HTTP range supported)    |
| POST   | `/api/files/upload?path=`   | Multipart upload, field `files`              |
| PUT    | `/api/files/text`           | `{ path, content }`: write a text/markdown file |
| POST   | `/api/files/folder`         | `{ path }`: create a folder                  |
| POST   | `/api/files/rename`         | `{ path, name }`                             |
| DELETE | `/api/files?path=`          | Delete a file or folder                      |
| GET    | `/api/files/summary`, `/api/markdown/summary` | Homepage summaries         |

All paths are resolved inside `DATA_DIR`. Traversal and symlink escapes are rejected with `403`.

## Architecture

```text
src/
  main.ts                 bootstrap; mounts each tool's UI at /tools/<id>/
  app.module.ts
  config/env.ts           Zod-validated environment (ENV provider)
  activity/               request counting + event feed (global)
  system/                 host metrics sampler
  tools/
    tool.ts               ToolDefinition / ToolManifest / ToolSummary contracts
    registry.ts           TOOLS list + GET /api/tools
    files/                FilesModule: service, controller, ui/
    markdown/             MarkdownModule: summary controller, ui/, vendored libs
public/
  index.html, home.*      overview page
  ds/                     design system: ds.css, ui.js, theme.js, reference page
```

### Adding a tool

1. Create `src/tools/<id>/<id>.module.ts` with a Nest module and export a `ToolDefinition` (`manifest`, `module`, `uiDir`, optional `assets`).
2. Put the UI in `src/tools/<id>/ui/index.html`. Link `/ds/ds.css`, load `/ds/theme.js` in `<head>`, and call `mountShell('<id>')` from `/ds/ui.js`.
3. Add the definition to `TOOLS` in `src/tools/registry.ts`.

That's all. The navigation, homepage tool grid, quick actions and summaries come from the manifest. Give the manifest a `summaryUrl` returning a `ToolSummary` to put stats and recent items on the homepage.

## Commands

```bash
pnpm dev | build | start
pnpm typecheck
pnpm lint
pnpm test
```

## License

[MIT](LICENSE)
