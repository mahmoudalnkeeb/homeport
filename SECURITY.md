# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through [GitHub security advisories](https://github.com/mahmoudalnkeeb/homeport/security/advisories/new). Include what you found, how to reproduce it, and which version or commit you tested.

You'll get an answer within a week. Once a fix is released, you'll be credited in the advisory unless you'd rather not be.

## Supported versions

Homeport has not reached 1.0. Only the latest commit on `main` gets security fixes.

## Security model

Homeport is built for a trusted home network or VPN, not the open internet.

- **Transport**: Homeport serves plain HTTP. Use it on your LAN or over a VPN, or put an HTTPS reverse proxy in front of it.
- **Accounts**: passwords are hashed with scrypt. Sessions are `HttpOnly` cookies, and the database stores only a SHA-256 hash of each token. After 5 failed sign-ins, that username is locked out from that address for 15 minutes.
- **CSRF**: every request that changes something must carry `X-Homeport-Request: 1`, which a cross-site form can't send.
- **Isolation**: members can read the shared library and only their own private space. Paths are normalised, and `..`, `.` and backslash tricks are rejected before any access check. Attachments made from files inherit the file's visibility. Another member's space answers `404`.
- **Storage**: the API checks access, then hands out short-lived signed URLs, so browsers talk to MinIO directly. MinIO's port has to be reachable by browsers, so **set a strong `S3_SECRET_KEY`**. The server refuses to start in production with the default.
- **Active content**: HTML and SVG are served under `Content-Security-Policy: sandbox` with `nosniff`.
