# Host agent

A container can only measure the machine its kernel runs on. The host agent is a small, dependency-free Node process that runs **natively on the host** and reports the host's real CPU, memory and disk to Homeport.

| Where Homeport runs | Without the agent | With the agent |
| --- | --- | --- |
| Docker Desktop (Windows, macOS, Linux) | The Docker **VM**, flagged on the dashboard | The real host |
| Docker Engine on Linux | Host CPU, memory and disk; the container's hostname | The real host |
| No Docker (`pnpm start`) | The real host | Not needed |

The server checks the agent's response against the shared contract and falls back to its own view when the agent is down. The Control Center shows which source is in use.

## Run it

To build and run it in the foreground:

```sh
pnpm agent
```

Or build it once and run the built file:

```sh
pnpm --filter @homeport/agent... build
node apps/agent/dist/main.js
```

It serves `GET /metrics` on `127.0.0.1:3001` and reads the same root `.env` as the server.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_PORT` | `3001` | Listen port |
| `AGENT_HOST` | `127.0.0.1` | Bind address. Docker Desktop can reach the host's loopback. With Docker Engine on Linux, use `0.0.0.0` together with a firewall rule or `AGENT_TOKEN` |
| `AGENT_TOKEN` | none | Require `Authorization: Bearer <token>`. Set the same value for the server |
| `AGENT_DISK_PATH` | `.` | Filesystem reported as the data disk |

## Start it at login

Build once, then replace `<repo>` with the repository path:

- **Windows**: `schtasks /Create /TN "Homeport agent" /SC ONLOGON /TR "node <repo>\apps\agent\dist\main.js"`
- **macOS**: create a LaunchAgent in `~/Library/LaunchAgents/` whose `ProgramArguments` are the full path to `node` (as printed by `which node`) and `<repo>/apps/agent/dist/main.js`, with `RunAtLoad` set, then `launchctl load` it.
- **Linux**: create a `systemd --user` service with `ExecStart=/usr/bin/node <repo>/apps/agent/dist/main.js`, then `systemctl --user enable --now homeport-agent`.
