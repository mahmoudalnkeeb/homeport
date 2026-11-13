import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import os from 'node:os';

import type { HostMetrics, SystemSample } from '@homeport/contracts';

export interface HostSamplerOptions {
  diskPath: string;
  sampleMs?: number;
  maxSamples?: number;
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const { user, nice, sys, irq, idle: cpuIdle } = cpu.times;
    idle += cpuIdle;
    total += user + nice + sys + irq + cpuIdle;
  }
  return { idle, total };
}

const memoryUsage = () => 1 - os.freemem() / os.totalmem();

export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

export type RuntimeKind = 'native' | 'container' | 'vm';

export function runtimeKind(release = os.release(), exists: (path: string) => boolean = existsSync): RuntimeKind {
  if (/microsoft|linuxkit/i.test(release)) return 'vm';
  if (exists('/.dockerenv') || exists('/run/.containerenv')) return 'container';
  return 'native';
}

export class HostSampler {
  private readonly history: SystemSample[] = [];
  private previous = cpuTimes();
  private timers: NodeJS.Timeout[] = [];
  private readonly sampleMs: number;
  private readonly maxSamples: number;

  constructor(private readonly options: HostSamplerOptions) {
    this.sampleMs = options.sampleMs ?? 5_000;
    this.maxSamples = options.maxSamples ?? 72;
  }

  start(): void {
    if (this.timers.length) return;
    const first = setTimeout(() => this.sample(), Math.min(1_000, this.sampleMs));
    const interval = setInterval(() => this.sample(), this.sampleMs);
    first.unref();
    interval.unref();
    this.timers = [first, interval];
  }

  stop(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
  }

  sample(): void {
    const current = cpuTimes();
    const total = current.total - this.previous.total;
    const idle = current.idle - this.previous.idle;
    this.previous = current;
    this.history.push({ t: Date.now(), cpu: total > 0 ? 1 - idle / total : 0, mem: memoryUsage() });
    if (this.history.length > this.maxSamples) this.history.shift();
  }

  private async disk(): Promise<HostMetrics['disk']> {
    try {
      const stats = await statfs(this.options.diskPath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      return { path: this.options.diskPath, total, free, used: total - free };
    } catch {
      return null;
    }
  }

  async snapshot(): Promise<HostMetrics> {
    const cpus = os.cpus();
    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      uptime: os.uptime(),
      cpu: { model: cpus[0]?.model.trim() ?? 'unknown', cores: cpus.length, usage: this.history.at(-1)?.cpu ?? null },
      memory: { total: os.totalmem(), used: os.totalmem() - os.freemem() },
      disk: await this.disk(),
      addresses: lanAddresses(),
      history: [...this.history],
    };
  }
}
