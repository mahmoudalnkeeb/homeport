import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { hostMetricsSchema, type HostMetrics, type MetricsSource, type SystemSnapshot } from '@homeport/contracts';
import { HostSampler, runtimeKind } from '@homeport/host-metrics';

import { ENV, type Environment } from '../config/env.js';

const AGENT_TIMEOUT_MS = 1_500;
const AGENT_RETRY_MS = 15_000;

@Injectable()
export class SystemService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemService.name);
  private readonly local: HostSampler;
  private agentRetryAt = 0;
  private agentError: string | undefined;

  constructor(@Inject(ENV) private readonly env: Environment) {
    this.local = new HostSampler({ diskPath: env.DISK_PATH });
  }

  onModuleInit(): void {
    this.local.start();
  }

  onModuleDestroy(): void {
    this.local.stop();
  }

  private async fromAgent(): Promise<HostMetrics | null> {
    const base = this.env.HOST_AGENT_URL;
    if (!base || Date.now() < this.agentRetryAt) return null;
    try {
      const response = await fetch(new URL('/metrics', base), {
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
        headers: this.env.AGENT_TOKEN ? { Authorization: `Bearer ${this.env.AGENT_TOKEN}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = hostMetricsSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('response does not match the host metrics contract');
      if (this.agentError !== undefined) this.logger.log({ event: 'system.agent.connected', url: base });
      this.agentError = undefined;
      return parsed.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.agentError === undefined) this.logger.warn({ event: 'system.agent.unreachable', url: base, error: message });
      this.agentError = message;
      this.agentRetryAt = Date.now() + AGENT_RETRY_MS;
      return null;
    }
  }

  private localSource(): MetricsSource {
    const kind = runtimeKind();
    if (kind === 'native') return { kind, label: 'This machine' };
    if (kind === 'container') return { kind, label: 'Host kernel (container)' };
    const fix = 'Run `pnpm agent` on the host to report its real CPU, memory and disk.';
    return {
      kind,
      label: 'Docker VM',
      hint: this.env.HOST_AGENT_URL
        ? `Host agent unreachable at ${this.env.HOST_AGENT_URL} (${this.agentError ?? 'not contacted yet'}). ${fix}`
        : `These numbers describe the Docker/WSL virtual machine, not the host. ${fix}`,
    };
  }

  async snapshot(): Promise<SystemSnapshot> {
    const agent = await this.fromAgent();
    const { addresses, ...host } = agent ?? (await this.local.snapshot());
    return {
      ...host,
      node: process.version,
      processUptime: process.uptime(),
      urls: this.env.LAN_URLS.length
        ? this.env.LAN_URLS
        : addresses.map((address) => `http://${address}:${this.env.PUBLIC_PORT}`),
      source: agent ? { kind: 'agent', label: 'Host agent' } : this.localSource(),
    };
  }
}
