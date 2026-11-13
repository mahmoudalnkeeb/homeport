<p align="center">
  <img src="apps/web/public/favicon.svg" width="72" height="72" alt="Homeport logo">
</p>

<h1 align="center">Homeport</h1>

<p align="center">
  A self-hosted home server for your family's files, media and notes, with a health dashboard for the machine it runs on.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-d9822b"></a>
  <img alt="Node.js 24.15+" src="https://img.shields.io/badge/node-%E2%89%A524.15-3c873a">
  <img alt="pnpm 12" src="https://img.shields.io/badge/pnpm-12-f69220">
  <img alt="Docker Compose" src="https://img.shields.io/badge/docker-compose-2496ed">
</p>

---

Homeport runs on one machine in your home (a NAS, a mini PC, an old laptop) and gives everyone on your network their own account. Admins run the server. Members get a shared library plus a private space nobody else can see.

## Features

- **Files**: a shared library and a private folder for each person. Uploads go straight to object storage in parallel parts, so multi-gigabyte files are fine.
- **Streaming**: video and audio are transcoded to adaptive HLS in the background. The player keeps playing in a corner while you browse, and queues the rest of the folder as a playlist.
- **Attachments**: a library of images, video, audio and documents sorted by type. Each item keeps a stable link you can embed in notes. Everything uploaded through Files shows up here too, with the same privacy.
- **Markdown notes**: write, split and read modes, code highlighting, and Mermaid diagrams.
- **Control Center**: CPU, memory, disk and network for the host machine, plus accounts, sessions and an activity feed.
- **Accounts**: admin and member roles, scrypt-hashed passwords, revocable sessions, sign-in throttling and CSRF protection.
- **Works on phones**: a responsive interface with bottom tabs, light and dark themes, and an installable app for your home screen. See [Install on your phone](#install-on-your-phone).

## Quick start

You need [Docker](https://docs.docker.com/get-docker/) with Compose and [Node.js](https://nodejs.org) 24.15+. Every command below works the same in a macOS or Linux terminal, PowerShell and Command Prompt.

```sh
git clone https://github.com/mahmoudalnkeeb/homeport.git
cd homeport
node scripts/setup-env.mjs
docker compose up -d --build
```

`setup-env.mjs` copies `.env.example` to `.env` and fills in a random `S3_SECRET_KEY`. Without that secret the server won't start, because the storage port is reachable on your network. It never overwrites an existing `.env`.

Open <http://localhost:3000> (or the machine's LAN address) and sign in as `admin`. The first password is written to `state/initial-admin-password.txt`, or set your own with `ADMIN_PASSWORD` before the first start. You'll be asked to change it, then you can add everyone else on **Users**.

> [!IMPORTANT]
> Homeport serves plain HTTP. Keep it on your home network or a VPN (Tailscale works well), or put an HTTPS reverse proxy in front of it.

To report the real host's CPU, memory and disk when running in Docker Desktop, also run the small [host agent](docs/host-agent.md) on the host: `pnpm agent`.

## Install on your phone

Homeport is a Progressive Web App: you can add it to your home screen, and it opens in its own window like any other app. **Account → Install app** shows the right steps for the device you're on.

- **Android and desktop Chrome or Edge**: tap **Install Homeport** on the Account page, or choose **Install app** in the browser menu.
- **iPhone and iPad**: in Safari, tap **Share**, then **Add to Home Screen**.

Browsers only allow installing over HTTPS (or `localhost`). Plain `http://192.168.x.x` addresses can still be bookmarked to the home screen, but they won't install as an app. [HTTPS on your home network](docs/https.md) sets up a trusted certificate with your own domain. Your files stay on your network, and nothing needs installing on your devices.

## How it fits together

```text
browser ──HTTP──▶  homeport (NestJS API + Preact app, :3000)
   │                  ├── Postgres  (accounts, sessions, attachments, stream jobs)
   │                  ├── MinIO     (files, attachments, HLS renditions)
   │                  └── ffmpeg    (background transcoding)
   └──presigned URLs──▶ MinIO (:9000)   uploads and streams go direct, not through the API
```

The API never proxies large files. It hands the browser short-lived signed URLs, and the browser uploads and streams straight from MinIO. Access checks happen before any URL is signed.

## Documentation

| Guide | What's in it |
| --- | --- |
| [Configuration](docs/configuration.md) | Every environment variable for the server, Compose and storage |
| [HTTPS on your home network](docs/https.md) | A trusted certificate for your LAN with certbot and nginx on the host and Cloudflare DNS, so Homeport can install as an app |
| [Host agent](docs/host-agent.md) | Real host metrics when the server runs in a container, and starting it at login |
| [API](docs/api.md) | Response envelope, errors, pagination and every route |
| [Design system](DESIGN.md) | Tokens, components and UI rules for `@homeport/ui` |
| [Contributing](CONTRIBUTING.md) | Local setup, project layout, adding a tool, and pull request checklist |
| [Security](SECURITY.md) | The security model and how to report a vulnerability |

## Development

Requirements: Node.js 24.15+, pnpm 12 (`corepack enable`) and Docker for Postgres and MinIO.

```sh
pnpm install
node scripts/setup-env.mjs
pnpm services:up
pnpm dev
```

`pnpm services:up` starts Postgres and MinIO in Docker. `pnpm dev` runs the API on port 3000 in watch mode and the web app on <http://localhost:5173> with hot reload.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests need no running services: the server tests use PGlite (in-process Postgres) and in-memory storage.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and conventions.

## Project status

Homeport is young and moves quickly. Expect breaking changes between versions until 1.0. Pin a commit if you depend on it.

## License

[MIT](LICENSE) © Mahmoud Alnakeeb
