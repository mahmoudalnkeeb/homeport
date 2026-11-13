# API

Everything the web app does goes through this JSON API under `/api`. Every route needs a session except `POST /api/auth/login` and `GET /api/health`.

## Conventions

- **Sessions** are `HttpOnly` cookies set by `POST /api/auth/login`.
- **CSRF**: every request that changes something must send `X-Homeport-Request: 1`. Without it the server answers `403 CSRF_HEADER_MISSING`.
- **Permissions**: routes marked *admin* return `403` to members. Paths in a private space that isn't yours return `404`, so its existence isn't revealed.
- **Validation**: request bodies and queries are checked against DTOs. Unknown fields are rejected, and every broken rule is listed in `details` (`422`).
- **Responses** carry only the fields their DTO exposes. Password hashes and internal storage keys never leave the server.

Every JSON response has one of three shapes:

```jsonc
{ "data": { } }                                                                         // one object, or null for actions
{ "data": [ ], "meta": { "page": 1, "pageSize": 50, "total": 132, "totalPages": 3 } }   // every list
{ "error": { "status": 422, "code": "VALIDATION_FAILED", "message": "Invalid request",
             "details": [ { "field": "password", "message": "At least 8 characters" } ] } }
```

Lists take `?page=` (from 1) and `?pageSize=` (default 50, max 200). `code` is one of `ERROR_CODES` in `@homeport/contracts`.

## Uploads

Files never pass through the API. An upload takes three steps:

1. `POST …/uploads` with `{ name, size }` (plus `folder` for Files). The server checks access and returns a ticket: a `target`, an optional multipart `uploadId`, a `partSize` and presigned `partUrls`.
2. `PUT` each part of the file to its URL, straight to object storage.
3. `POST …/uploads/finish` with `{ target, uploadId }`. Call `…/uploads/abort` instead to cancel.

Downloads and streams (`…/raw`, `/api/media/…`) answer with a redirect to a short-lived signed URL. Text, Markdown and active content such as HTML and SVG are served by the API itself under a sandboxing `Content-Security-Policy`.

## Routes

### Auth and system

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ username, password }`: start a session |
| POST | `/api/auth/logout` | End this session |
| GET | `/api/auth/me` | The signed-in user |
| POST | `/api/auth/password` | `{ current, next }`: change your password and sign out your other sessions |
| GET | `/api/health` | Public: `{ status, database }`, or `503` when Postgres is unreachable |
| GET | `/api/tools` | List: tools the user may use |
| GET | `/api/system` | *admin*: host metrics with about 6 minutes of CPU and memory history |

### Users (*admin*)

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/users` | List: accounts, admins first, with storage use and last sign-in |
| GET | `/api/users/stats` | Accounts, admins, disabled accounts, active sessions, storage |
| POST | `/api/users` | `{ username, displayName, role, password }` |
| PATCH | `/api/users/:username` | `{ displayName?, role?, disabled? }` |
| POST | `/api/users/:username/password` | `{ password }`: set a temporary password |
| DELETE | `/api/users/:username?deleteFiles=` | Delete the account, and optionally its personal space |

### Files

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/files?path=` | List: a folder, folders first, then by name |
| GET | `/api/files/recent?scope=&kind=` | List: recently changed files you can see (`scope`: `all`, `library`, `home`) |
| GET | `/api/files/raw?path=&download=` | Open or download a file |
| POST | `/api/files/uploads` | `{ folder, name, size }`: start an upload |
| POST | `/api/files/uploads/finish` | `{ target, uploadId? }`: finish it. The file also becomes an attachment |
| POST | `/api/files/uploads/abort` | `{ target, uploadId? }` |
| PUT | `/api/files/text` | `{ path, content }`: write a text or Markdown file |
| POST | `/api/files/folder` | `{ path }`: create a folder |
| POST | `/api/files/rename` | `{ path, name }` |
| DELETE | `/api/files?path=` | Delete a file, or a folder with everything inside |

### Attachments

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/attachments?category=&q=&mine=` | List: newest first, only those you're allowed to see |
| GET | `/api/attachments/categories` | Count and size per category |
| GET | `/api/attachments/:id` | One attachment |
| GET | `/api/attachments/:id/raw?download=` | Open or download it (a stable link) |
| POST | `/api/attachments/uploads` (`/finish`, `/abort`) | Upload, as described above |
| PATCH | `/api/attachments/:id` | `{ name }`: rename. Owner or admin only |
| DELETE | `/api/attachments/:id` | Delete. Owner or admin only. Attachments that live in Files are deleted there |

### Media, activity and summaries

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/media/:id/:file` | HLS playlists and segments for a transcoded file you can read |
| GET | `/api/activity` | *admin*: request counts since start |
| GET | `/api/activity/events` | *admin*, list: everyone's events, newest first |
| GET | `/api/activity/mine` | List: your own events |
| POST | `/api/activity/pageview` | `{ path }`: record a client route view |
| GET | `/api/files/summary`, `/api/attachments/summary`, `/api/markdown/summary` | Cards for the home pages |
