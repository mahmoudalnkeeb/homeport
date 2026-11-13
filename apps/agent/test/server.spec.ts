import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';

import { hostMetricsSchema } from '@homelab/contracts';
import { HostSampler } from '@homelab/host-metrics';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentServer } from '../src/server';

const servers: ReturnType<typeof createAgentServer>[] = [];

async function start(options: { token?: string } = {}): Promise<string> {
  const sampler = new HostSampler({ diskPath: tmpdir() });
  sampler.sample();
  const server = createAgentServer(sampler, options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('agent server', () => {
  it('serves host metrics that satisfy the shared contract', async () => {
    const base = await start();
    const response = await fetch(`${base}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(hostMetricsSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('answers health checks, rejects other paths and methods', async () => {
    const base = await start();

    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(405);
  });

  it('requires the bearer token when one is configured', async () => {
    const base = await start({ token: 's3cret' });

    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    expect((await fetch(`${base}/metrics`, { headers: { Authorization: 'Bearer s3cret' } })).status).toBe(200);
  });
});
