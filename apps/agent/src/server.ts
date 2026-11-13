import { createServer, type Server } from 'node:http';

import type { HostSampler } from '@homelab/host-metrics';

export function createAgentServer(sampler: HostSampler, { token }: { token?: string } = {}): Server {
  return createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    if (req.method !== 'GET') return send(405, { message: 'Method not allowed' });
    if (token && req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'Unauthorized' });

    const path = (req.url ?? '/').split('?')[0];
    if (path === '/health') return send(200, { ok: true });
    if (path !== '/metrics') return send(404, { message: 'Not found' });

    sampler
      .snapshot()
      .then((metrics) => send(200, metrics))
      .catch(() => send(500, { message: 'Could not read host metrics' }));
  });
}
