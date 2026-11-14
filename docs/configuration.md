# Configuration

Homeport reads `.env` from the repository root. Relative paths resolve against the repository root, wherever a command runs from. Start from [`.env.example`](../.env.example).

## Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port. The Vite dev proxy follows it |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` for local-only |
| `DATABASE_URL` | required | Postgres connection, e.g. `postgres://homeport:homeport@localhost:5432/homeport` |
| `DB_MIGRATE` | `true` | Apply pending migrations on start, including the BullMQ job queue tables in the `bullmq` schema |
| `STATE_DIR` | `state` | Private server files, currently the initial admin password |
| `ADMIN_PASSWORD` | random | First start only: password for the `admin` account (8+ characters). If unset, a random one is written to `STATE_DIR/initial-admin-password.txt` and must be changed at first sign-in |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `MAX_UPLOAD_MB` | `4096` | Per-file upload limit |
| `LAN_URLS` | detected | Comma-separated addresses to show on the home page instead of detected interfaces |
| `PUBLIC_PORT` | `PORT` | Port used in the advertised LAN addresses |
| `DISK_PATH` | repository root | Filesystem reported as the disk when no host agent answers |
| `TRUST_PROXY` | none | Proxy addresses (comma-separated IPs or ranges, or `loopback` / `uniquelocal`) allowed to report the visitor's real address and protocol through `X-Forwarded-*` headers. Use only with `PUBLISH_ADDRESS=127.0.0.1` |
| `HOST_AGENT_URL` | none | Host agent to read host metrics from. See [host agent](host-agent.md) |
| `AGENT_TOKEN` | none | Shared secret sent to the host agent |
| `WEB_DIST` | `apps/web/dist` | Built web app the API serves |

## Object storage

Files, attachments and HLS renditions live in MinIO or any S3-compatible server.

| Variable | Default | Purpose |
| --- | --- | --- |
| `S3_ENDPOINT` | `http://localhost:9000` | Where the server reaches storage |
| `S3_PUBLIC_PORT` | `9000` | Port browsers use for presigned URLs |
| `S3_PUBLIC_ENDPOINT` | none | Pin one public storage address, e.g. an HTTPS reverse proxy. By default each URL uses the hostname the browser opened the app with (localhost, LAN IP, Tailscale name), so every network works without extra config. If the app itself is served over HTTPS (needed to install it as an app), this must be an HTTPS address too, or browsers block the mixed content |
| `S3_REGION` | `us-east-1` | Signing region |
| `S3_ACCESS_KEY` | `homeport` | Storage access key (the MinIO root user under Compose) |
| `S3_SECRET_KEY` | `homeport-minio` | Storage secret. **Required in production**: the server refuses to start with the default, because MinIO's port is reachable on the network |
| `S3_BUCKET` | `homeport` | Bucket, created on first start |

## Streaming

| Variable | Default | Purpose |
| --- | --- | --- |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Binaries used to transcode video and audio to HLS. The Docker image ships them |
| `TRANSCODE_CONCURRENCY` | `1` | Parallel transcodes. Jobs run on a BullMQ queue stored in Postgres and retry up to 3 times with backoff. `0` turns the worker off and media plays from the original file. It also turns off the Watch and Music indexing workers |

## Libraries

Watch and Music index files from fixed folders in Files. Uploads there are indexed automatically, and **Rescan** (admins) picks up files copied straight into MinIO and drops entries whose file is gone.

| Folder | Layout |
| --- | --- |
| `library/movies` | `Title (Year).mkv` or `Title (Year)/anything.mkv` |
| `library/tv` | `Show (Year)/Season 01/Show S01E02 Title.mkv`. `1x02` names also work |
| `library/music` | Read from file tags. Without tags, `Artist/Album/03 - Title.mp3`. Embedded cover art becomes the album cover. Music plays the original file, with no HLS transcode, so tracks can play back to back without a gap |

| Variable | Default | Purpose |
| --- | --- | --- |
| `TMDB_TOKEN` | unset | TMDB v4 read access token. When set, movies and shows get posters, descriptions and episode titles. Without it, titles come from file names |

## Docker Compose

These only affect `compose.yaml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Host port for the app |
| `STATE_PATH` | `./state` | Host folder mounted at `/state` |
| `OBJECTS_PATH` | `objects` volume | Volume or host folder holding MinIO's data. Point it at a large disk |
| `MINIO_PORT` | `9000` | Storage port published on the network (browsers need it) |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO console, published on loopback only |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `homeport` | Database credentials used by both containers |
| `POSTGRES_PORT` | `5432` | Loopback port Postgres is published on |
| `HOST_AGENT_URL` | `http://host.docker.internal:3001` | Where the container finds the host agent |
| `LAB_HOSTNAME` | `homeport` | Container hostname, shown only when no agent answers |
| `PUBLISH_ADDRESS` | `0.0.0.0` | Where ports 3000 and 9000 are published. Set `127.0.0.1` when nginx on the host serves HTTPS, so only it can reach them. See [HTTPS on your home network](https.md) |

The container is healthy once `GET /api/health` reaches the database.

## Database

Postgres through [Drizzle](https://orm.drizzle.team). Each module owns its tables in its own `*.schema.ts`, next to the code that uses them. Columns are camelCase in TypeScript and snake_case in Postgres. Migrations live in `apps/server/drizzle/` and run on server start.

| Script | Does |
| --- | --- |
| `pnpm services:up` / `pnpm services:down` | Start or stop Postgres and MinIO in Docker |
| `pnpm db:generate` | Write a migration from changes to any `*.schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:check` | Check the migration history is consistent |
| `pnpm db:studio` | Browse the data in Drizzle Studio |

## Recovering the admin account

Another admin can reset a lost password on **Users**. If there is no other admin, empty the accounts and restart. The next start creates a fresh `admin`, and stored files are untouched:

```sh
docker compose exec postgres psql -U homeport -c "TRUNCATE users CASCADE"
docker compose restart homeport
```
