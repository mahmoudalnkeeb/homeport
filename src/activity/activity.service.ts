import { Injectable } from '@nestjs/common';

export interface ActivityEvent {
  at: string;
  tool: string;
  action: string;
  detail: string;
}

const MINUTE = 60_000;
const WINDOW_MINUTES = 60;
const MAX_EVENTS = 50;
// Dashboard polling would drown out real usage, so telemetry endpoints are not counted.
const UNTRACKED_API = new Set(['system', 'activity', 'tools']);

/** Maps a request path to the area it belongs to, or null when it should not be counted. */
export function areaOf(path: string): string | null {
  const [first, second] = path.split('/').filter(Boolean);
  if (first === undefined || first === 'index.html') return 'home';
  if (first === 'api') return second && !UNTRACKED_API.has(second) ? second : null;
  const isPage = !/\.[a-z0-9]+$/i.test(path) || path.endsWith('.html');
  if (!isPage) return null;
  if (first === 'tools' && second) return second;
  return null;
}

@Injectable()
export class ActivityService {
  private readonly startedAt = new Date();
  private total = 0;
  private readonly perArea = new Map<string, number>();
  private readonly perMinute = new Map<number, number>();
  private readonly events: ActivityEvent[] = [];

  track(path: string, now = Date.now()): void {
    const area = areaOf(path);
    if (!area) return;
    this.total++;
    this.perArea.set(area, (this.perArea.get(area) ?? 0) + 1);
    const minute = Math.floor(now / MINUTE);
    this.perMinute.set(minute, (this.perMinute.get(minute) ?? 0) + 1);
    for (const key of this.perMinute.keys()) {
      if (key <= minute - WINDOW_MINUTES) this.perMinute.delete(key);
    }
  }

  record(tool: string, action: string, detail: string): void {
    this.events.unshift({ at: new Date().toISOString(), tool, action, detail });
    this.events.length = Math.min(this.events.length, MAX_EVENTS);
  }

  snapshot(now = Date.now()) {
    const minute = Math.floor(now / MINUTE);
    const lastHour = Array.from(
      { length: WINDOW_MINUTES },
      (_, i) => this.perMinute.get(minute - WINDOW_MINUTES + 1 + i) ?? 0
    );
    return {
      since: this.startedAt.toISOString(),
      totalRequests: this.total,
      lastHour,
      perArea: [...this.perArea]
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count),
      events: this.events,
    };
  }
}
