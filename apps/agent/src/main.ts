import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { HostSampler } from '@homelab/host-metrics';

import { createAgentServer } from './server.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

const envFile = join(REPO_ROOT, '.env');
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const env = (name: string): string | undefined => process.env[name] ?? fileEnv[name];

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid AGENT_PORT: ${value}`);
  }
  return parsed;
}

const agentPort = port(env('AGENT_PORT'), 3001);
const agentHost = env('AGENT_HOST') ?? '127.0.0.1';
const diskSetting = env('AGENT_DISK_PATH') ?? env('DATA_PATH') ?? env('DATA_DIR') ?? 'data';
const diskPath = isAbsolute(diskSetting) ? diskSetting : resolve(REPO_ROOT, diskSetting);
const token = env('AGENT_TOKEN') || undefined;

const sampler = new HostSampler({ diskPath });
sampler.start();

const server = createAgentServer(sampler, token ? { token } : {});
server.listen(agentPort, agentHost, () => {
  process.stdout.write(
    `homelab agent: http://${agentHost}:${agentPort}/metrics (disk: ${diskPath}${token ? ', token required' : ''})\n`
  );
});

const shutdown = () => {
  sampler.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
