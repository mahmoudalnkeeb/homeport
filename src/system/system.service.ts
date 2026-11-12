import { statfs } from 'node:fs/promises';
import os from 'node:os';

import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { ENV, type Environment } from '../config/env.js';

export interface Sample {
  t: number;
  cpu: number;
  mem: number;
}

const SAMPLE_MS = 5_000;
const MAX_SAMPLES = 72; // six minutes of history

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

const memUsage = () => 1 - os.freemem() / os.totalmem();

@Injectable()
export class SystemService implements OnModuleInit, OnModuleDestroy {
  private readonly history: Sample[] = [];
  private previous = cpuTimes();
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(ENV) private readonly env: Environment) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private sample(): void {
    const current = cpuTimes();
    const total = current.total - this.previous.total;
    const idle = current.idle - this.previous.idle;
    this.previous = current;
    const cpu = total > 0 ? 1 - idle / total : 0;
    this.history.push({ t: Date.now(), cpu, mem: memUsage() });
    if (this.history.length > MAX_SAMPLES) this.history.shift();
  }

  private lanUrls(): string[] {
    if (this.env.LAN_URLS.length) return this.env.LAN_URLS;
    const urls: string[] = [];
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) {
          urls.push(`http://${address.address}:${this.env.PORT}`);
        }
      }
    }
    return urls;
  }

  private async disk() {
    try {
      const stats = await statfs(this.env.DATA_DIR);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      return { path: this.env.DATA_DIR, total, free, used: total - free };
    } catch {
      return null;
    }
  }

  async snapshot() {
    const cpus = os.cpus();
    const latest = this.history.at(-1);
    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
      uptime: os.uptime(),
      processUptime: process.uptime(),
      cpu: { model: cpus[0]?.model.trim() ?? 'unknown', cores: cpus.length, usage: latest?.cpu ?? null },
      memory: { total: os.totalmem(), used: os.totalmem() - os.freemem() },
      disk: await this.disk(),
      urls: this.lanUrls(),
      history: this.history,
    };
  }
}
