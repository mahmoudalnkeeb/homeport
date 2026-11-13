import type { ActivityEvent, ActivitySnapshot, SystemSnapshot, ToolInfo, ToolSummary, UserInfo, UserStats } from '@homelab/contracts';
import {
  Badge,
  BarList,
  Breakdown,
  Card,
  Chip,
  Cluster,
  copyText,
  EmptyState,
  formatBytes,
  formatDuration,
  Grid,
  Icon,
  IconButton,
  KIND_ICON,
  Meta,
  Meter,
  Notice,
  PageHeader,
  Row,
  Rows,
  Section,
  Sparkline,
  Stat,
  StatusDot,
  timeAgo,
  type IconName,
} from '@homelab/ui';

import { api } from '../api';
import { useTools } from '../app';
import { useResource } from '../hooks';
import './overview.css';

const pct = (ratio: number) => Math.round(ratio * 100);
const EVENT_ICON: Record<string, IconName> = {
  upload: 'upload',
  save: 'save',
  delete: 'trash',
  rename: 'pencil',
  mkdir: 'folder-plus',
};

const withCode = (text: string) =>
  text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

interface ToolSummaryEntry {
  tool: ToolInfo;
  summary: ToolSummary;
}

async function loadSummaries(tools: ToolInfo[]): Promise<ToolSummaryEntry[]> {
  const entries = await Promise.all(
    tools.map(async (tool) => {
      if (!tool.summaryUrl) return null;
      try {
        return { tool, summary: await api.summary(tool.summaryUrl) };
      } catch {
        return null;
      }
    })
  );
  return entries.filter((entry) => entry !== null);
}

function HostHealth({ system, activity }: { system: SystemSnapshot | undefined; activity: ActivitySnapshot | undefined }) {
  if (!system) {
    return (
      <Grid>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} span={3}>
            <div class="skeleton" style={{ height: '108px' }} />
          </Card>
        ))}
      </Grid>
    );
  }
  const memory = system.memory.used / system.memory.total;
  const lastHour = activity?.lastHour ?? [];
  return (
    <Grid>
      <Card span={3} title="CPU" icon="cpu" aside={<span class="faint">{system.cpu.cores} cores</span>}>
        <Stat value={system.cpu.usage === null ? '—' : pct(system.cpu.usage)} unit="%" />
        <Sparkline values={system.history.map((sample) => sample.cpu)} max={1} />
        <Meta title={system.cpu.model}>{system.cpu.model}</Meta>
      </Card>
      <Card span={3} title="Memory" icon="memory" aside={<span class="faint">{formatBytes(system.memory.total)}</span>}>
        <Stat value={pct(memory)} unit="%" />
        <Sparkline values={system.history.map((sample) => sample.mem)} max={1} color="var(--series-2)" />
        <Meta>{formatBytes(system.memory.used)} in use</Meta>
      </Card>
      <Card span={3} title="Data disk" icon="drive" aside={system.disk && <span class="faint">{formatBytes(system.disk.total)}</span>}>
        {system.disk ? (
          <>
            <Stat value={formatBytes(system.disk.free)} label="free" />
            <Meter value={system.disk.used / system.disk.total} label="Disk used" thresholds />
            <Meta title={system.disk.path}>
              {pct(system.disk.used / system.disk.total)}% used · {system.disk.path}
            </Meta>
          </>
        ) : (
          <p class="muted">Disk statistics are unavailable.</p>
        )}
      </Card>
      <Card span={3} title="Requests" icon="activity" aside={<span class="faint">last 60 min</span>}>
        <Stat value={lastHour.reduce((sum, count) => sum + count, 0).toLocaleString()} />
        <Sparkline values={lastHour} type="bar" color="var(--series-3)" />
        {activity && (
          <Meta>
            {activity.totalRequests.toLocaleString()} since start · {timeAgo(activity.since)}
          </Meta>
        )}
      </Card>
    </Grid>
  );
}

function StorageCard({ entry }: { entry: ToolSummaryEntry | undefined }) {
  if (!entry?.summary.breakdown) return <Card span={6} title="Storage" icon="folder" />;
  const { tool, summary } = entry;
  const breakdown = summary.breakdown ?? [];
  return (
    <Card span={6} title={`Storage · ${tool.name}`} icon={tool.icon} aside={<a href={tool.href}>Open</a>}>
      <Cluster gap={8}>
        {summary.tiles.map((tile) => (
          <Stat key={tile.label} value={tile.value} label={tile.label} />
        ))}
      </Cluster>
      {breakdown.length ? (
        <Breakdown
          label="Storage by file type"
          segments={breakdown.map((item) => ({
            ...item,
            icon: KIND_ICON[item.label as keyof typeof KIND_ICON] ?? 'file',
          }))}
        />
      ) : (
        <EmptyState icon="upload" title="No files yet">
          <span>Upload something to get started.</span>
        </EmptyState>
      )}
    </Card>
  );
}

function ActivityFeed({ events, areaName }: { events: ActivityEvent[]; areaName: (area: string) => string }) {
  return (
    <Card span={8} title="Activity" icon="activity" aside={<span class="faint">everyone</span>}>
      {events.length ? (
        <Rows class="feed">
          {events.map((event) => (
            <Row
              key={`${event.at}-${event.detail}`}
              icon={EVENT_ICON[event.action] ?? 'activity'}
              title={event.detail}
              meta={`${event.user} · ${event.action} · ${areaName(event.tool)} · ${timeAgo(event.at)}`}
            />
          ))}
        </Rows>
      ) : (
        <EmptyState icon="clock" title="Nothing yet">
          <span>Uploads, saves and deletes show up here.</span>
        </EmptyState>
      )}
    </Card>
  );
}

function PeopleCard({ users, stats }: { users: UserInfo[]; stats: UserStats | undefined }) {
  const pending = users.filter((user) => user.mustChangePassword && !user.disabled).length;
  return (
    <Card span={4} title="Accounts" icon="users" aside={<a href="/users">Open</a>}>
      <Cluster gap={8}>
        <Stat value={stats?.accounts ?? 0} label="Users" />
        <Stat value={stats?.admins ?? 0} label="Admins" />
        <Stat value={stats?.activeSessions ?? 0} label="Sessions" />
      </Cluster>
      <Rows>
        {users.slice(0, 4).map((user) => (
          <Row
            key={user.username}
            icon={user.role === 'admin' ? 'shield' : 'user'}
            title={user.displayName}
            meta={user.lastLoginAt ? `signed in ${timeAgo(user.lastLoginAt)}` : 'never signed in'}
            end={user.disabled ? <Badge>disabled</Badge> : undefined}
          />
        ))}
      </Rows>
      {pending > 0 && <Meta>{pending} waiting to choose a password</Meta>}
    </Card>
  );
}

export default function ControlCenter() {
  const tools = useTools();
  const system = useResource(api.system, { interval: 5000 });
  const activity = useResource(api.activity, { interval: 5000 });
  const summaries = useResource(() => loadSummaries(tools), { interval: 30000, key: tools });
  const events = useResource(() => api.events({ pageSize: 12 }), { interval: 5000 });
  const people = useResource(() => api.users.page({ pageSize: 4 }), { interval: 30000 });
  const peopleStats = useResource(api.users.stats, { interval: 30000 });

  const areaName = (area: string) => (area === 'home' ? 'Home' : (tools.find((tool) => tool.id === area)?.name ?? area));
  const lanUrl = system.data?.urls[0];
  const online = !system.error;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <StatusDot ok={online} />
            <span class="eyebrow">{online ? 'Online' : 'Unreachable'}</span>
          </>
        }
        title={system.data?.hostname ?? 'Overview'}
        description={
          system.data
            ? `${system.data.platform} · ${system.data.arch} · up ${formatDuration(system.data.uptime)}`
            : 'Loading system details…'
        }
        actions={
          lanUrl && (
            <Chip icon="link">
              {lanUrl}
              <IconButton icon="copy" label="Copy LAN address" size="sm" onClick={() => copyText(lanUrl, 'Address copied')} />
            </Chip>
          )
        }
      />

      <Section title="Quick actions" first>
        <div class="actions">
          {tools.flatMap((tool) =>
            tool.quickActions.map((action) => (
              <a key={action.href} class="action" href={action.href}>
                <span class="row-icon">
                  <Icon name={action.icon} />
                </span>
                <span>
                  {action.label}
                  <small>{tool.name}</small>
                </span>
              </a>
            ))
          )}
          <a class="action" href="/users?new=1">
            <span class="row-icon">
              <Icon name="users" />
            </span>
            <span>
              Add user<small>Admin</small>
            </span>
          </a>
          <button type="button" class="action" onClick={() => copyText(lanUrl ?? location.origin, 'Address copied')}>
            <span class="row-icon">
              <Icon name="link" />
            </span>
            <span>
              Copy LAN address<small>Open from another device</small>
            </span>
          </button>
        </div>
      </Section>

      <Section
        title="Host health"
        aside={
          system.data && (
            <Badge tone={system.data.source.kind === 'vm' ? undefined : 'accent'}>Source: {system.data.source.label}</Badge>
          )
        }
      >
        {system.data?.source.hint && (
          <div class="source-notice">
            <Notice tone="warning" title="Showing the Docker VM, not this host">
              {withCode(system.data.source.hint)}
            </Notice>
          </div>
        )}
        <HostHealth system={system.data} activity={activity.data} />
      </Section>

      <Section title="Storage & usage">
        <Grid>
          <StorageCard entry={summaries.data?.find((entry) => entry.summary.breakdown)} />
          <Card span={3} title="Usage by area" icon="layers">
            {activity.data?.perArea.length ? (
              <BarList items={activity.data.perArea.slice(0, 6).map(({ area, count }) => ({ label: areaName(area), value: count }))} />
            ) : (
              <p class="muted">No traffic yet.</p>
            )}
          </Card>
          <Card span={3} title="Network" icon="network">
            <Rows>
              {system.data?.urls.length ? (
                system.data.urls.map((url) => (
                  <Row
                    key={url}
                    title={url}
                    mono
                    end={<IconButton icon="copy" label="Copy address" size="sm" onClick={() => copyText(url, 'Address copied')} />}
                  />
                ))
              ) : (
                <Row title="No LAN interfaces found" />
              )}
            </Rows>
            {system.data && (
              <Meta>
                Node {system.data.node} · server up {formatDuration(system.data.processUptime)}
              </Meta>
            )}
          </Card>
        </Grid>
      </Section>

      <Section title="Recent">
        <Grid>
          {(summaries.data ?? [])
            .filter(({ summary }) => summary.recent)
            .map(({ tool, summary }) => (
              <Card key={tool.id} span={6} title={`Recent · ${tool.name}`} icon={tool.icon} aside={<a href={tool.href}>View all</a>}>
                {summary.recent?.length ? (
                  <Rows>
                    {summary.recent.slice(0, 6).map((item) => (
                      <Row
                        key={item.href}
                        href={item.href}
                        icon={tool.id === 'markdown' ? 'file-text' : 'file'}
                        title={item.label}
                        meta={`${formatBytes(item.size)} · ${timeAgo(item.modified)}`}
                      />
                    ))}
                  </Rows>
                ) : (
                  <EmptyState icon={KIND_ICON.other} title="Nothing here yet" />
                )}
              </Card>
            ))}
        </Grid>
      </Section>

      <Section title="People" aside={<a href="/users">Manage users</a>}>
        <Grid>
          <PeopleCard users={people.data?.items ?? []} stats={peopleStats.data} />
          <ActivityFeed events={events.data?.items ?? []} areaName={areaName} />
        </Grid>
      </Section>

      <Section title="Tools">
        <div class="tool-grid">
          {tools.map((tool) => {
            const summary = summaries.data?.find((entry) => entry.tool.id === tool.id)?.summary;
            return (
              <Card key={tool.id} href={tool.href} class="tool-card">
                <Cluster>
                  <span class="row-icon">
                    <Icon name={tool.icon} size="lg" />
                  </span>
                  <span class="spacer" />
                  <Icon name="arrow-right" class="arrow" />
                </Cluster>
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
                {summary && (
                  <Cluster>
                    {summary.tiles.map((tile) => (
                      <Badge key={tile.label}>
                        {tile.value} {tile.label.toLowerCase()}
                      </Badge>
                    ))}
                  </Cluster>
                )}
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}
