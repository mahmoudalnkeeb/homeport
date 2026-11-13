import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';

import type { HostMetrics } from '@homelab/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { envSchema } from '../src/config/env.js';

const BASE = { DATABASE_URL: 'postgres://test@localhost/test' };
import { SystemService } from '../src/system/system.service.js';

const HOST: HostMetrics = {
  hostname: 'real-host',
  platform: 'Windows_NT 10.0.19045',
  arch: 'x64',
  uptime: 1000,
  cpu: { model: 'Real CPU', cores: 8, usage: 0.25 },
  memory: { total: 16e9, used: 8e9 },
  disk: { path: 'D:\\media', total: 2e12, free: 1e12, used: 1e12 },
  addresses: ['192.168.1.20'],
  history: [{ t: 1, cpu: 0.25, mem: 0.5 }],
};

const servers: Server[] = [];

async function fakeAgent(status: number, body: unknown, token?: string): Promise<string> {
  const server = createServer((req, res) => {
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(req.url === '/metrics' ? status : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const service = (env: Record<string, string>) => new SystemService(envSchema.parse({ ...BASE, DATA_DIR: tmpdir(), ...env }));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('SystemService', () => {
  it('reports the host agent when it answers, with LAN URLs on the public port', async () => {
    const url = await fakeAgent(200, HOST, 'tkn');
    const snapshot = await service({ HOST_AGENT_URL: url, AGENT_TOKEN: 'tkn', PORT: '3000', PUBLIC_PORT: '8080' }).snapshot();

    expect(snapshot.source).toEqual({ kind: 'agent', label: 'Host agent' });
    expect(snapshot).toMatchObject({ hostname: 'real-host', cpu: HOST.cpu, memory: HOST.memory, disk: HOST.disk });
    expect(snapshot.urls).toEqual(['http://192.168.1.20:8080']);
    expect(snapshot).not.toHaveProperty('addresses');
  });

  it('prefers LAN_URLS over detected addresses', async () => {
    const url = await fakeAgent(200, HOST);
    const snapshot = await service({ HOST_AGENT_URL: url, LAN_URLS: 'http://lab.home:3000' }).snapshot();

    expect(snapshot.urls).toEqual(['http://lab.home:3000']);
  });

  it.each([
    ['an error status', 500, { message: 'boom' }],
    ['a payload that breaks the contract', 200, { hostname: 'x' }],
  ])('falls back to local metrics on %s', async (_, status, body) => {
    const url = await fakeAgent(status, body);
    const snapshot = await service({ HOST_AGENT_URL: url }).snapshot();

    expect(snapshot.source.kind).not.toBe('agent');
    expect(snapshot.hostname).not.toBe('real-host');
  });

  it('backs off after a failure instead of calling the agent on every request', async () => {
    let calls = 0;
    const server = createServer((_req, res) => {
      calls++;
      res.writeHead(500).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const system = service({ HOST_AGENT_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });

    await system.snapshot();
    await system.snapshot();

    expect(calls).toBe(1);
  });

  it('uses local metrics when no agent is configured', async () => {
    const snapshot = await service({}).snapshot();

    expect(['native', 'container', 'vm']).toContain(snapshot.source.kind);
    expect(snapshot.node).toBe(process.version);
  });
});
