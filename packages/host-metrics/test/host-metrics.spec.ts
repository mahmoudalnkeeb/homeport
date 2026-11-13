import { tmpdir } from 'node:os';

import { hostMetricsSchema } from '@homelab/contracts';
import { describe, expect, it } from 'vitest';

import { HostSampler, runtimeKind } from '../src/index';

describe('runtimeKind', () => {
  const none = () => false;
  it.each([
    ['5.15.167.4-microsoft-standard-WSL2', none, 'vm'],
    ['6.10.14-linuxkit', none, 'vm'],
    ['6.8.0-45-generic', (path: string) => path === '/.dockerenv', 'container'],
    ['6.8.0-45-generic', (path: string) => path === '/run/.containerenv', 'container'],
    ['6.8.0-45-generic', none, 'native'],
    ['10.0.19045', none, 'native'],
  ])('%s -> %s', (release, exists, expected) => {
    expect(runtimeKind(release, exists)).toBe(expected);
  });
});

describe('HostSampler', () => {
  it('produces a snapshot that matches the agent contract', async () => {
    const sampler = new HostSampler({ diskPath: tmpdir() });
    sampler.sample();

    const snapshot = await sampler.snapshot();

    expect(hostMetricsSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.cpu.usage).toBe(snapshot.history[0]?.cpu);
    expect(snapshot.disk?.total).toBeGreaterThan(0);
  });

  it('reports no disk for a missing path and caps the history', async () => {
    const sampler = new HostSampler({ diskPath: '/definitely/not/here', maxSamples: 3 });
    for (let i = 0; i < 5; i++) sampler.sample();

    const snapshot = await sampler.snapshot();

    expect(snapshot.disk).toBeNull();
    expect(snapshot.history).toHaveLength(3);
  });
});
