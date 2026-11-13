import type { FileEntry } from '@homeport/contracts';
import {
  Breakdown,
  Card,
  Cluster,
  EmptyState,
  formatBytes,
  Grid,
  Icon,
  KIND_ICON,
  LinkButton,
  Row,
  Rows,
  Section,
  Stat,
  timeAgo,
  type IconName,
} from '@homeport/ui';

import { api } from '../api';
import { useAuth } from '../auth';
import { useResource } from '../hooks';
import './overview.css';

const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
const openInFiles = (file: FileEntry) =>
  `/tools/files?path=${encodeURIComponent(folderOf(file.path))}&open=${encodeURIComponent(file.path)}`;

const EVENT_LABEL: Record<string, [IconName, string]> = {
  upload: ['upload', 'Uploaded'],
  save: ['save', 'Saved'],
  delete: ['trash', 'Deleted'],
  rename: ['pencil', 'Renamed'],
  mkdir: ['folder-plus', 'Created folder'],
};

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function MemberHome() {
  const { me } = useAuth();
  const firstName = me.displayName.split(/\s+/)[0] ?? me.displayName;
  const homeHref = `/tools/files?path=${encodeURIComponent(me.home)}`;

  const space = useResource(() => api.summary('/api/files/summary'), { interval: 60_000 });
  const notes = useResource(() => api.files.recent({ scope: 'home', kind: 'markdown', pageSize: 5 }), { interval: 60_000 });
  const library = useResource(() => api.files.recent({ scope: 'library', pageSize: 8 }), { interval: 60_000 });
  const mine = useResource(() => api.myActivity({ pageSize: 8 }), { interval: 30_000 });

  const actions: { label: string; hint: string; icon: IconName; href: string }[] = [
    { label: 'Upload', hint: 'to My files', icon: 'upload', href: `${homeHref}&upload=1` },
    { label: 'New note', hint: 'Markdown', icon: 'plus', href: '/tools/markdown?new=1' },
    { label: 'My files', hint: 'Your private space', icon: 'folder', href: homeHref },
    { label: 'Library', hint: 'Shared media', icon: 'library', href: '/tools/files' },
  ];

  return (
    <>
      <header class="member-hero">
        <span class="eyebrow">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <h1>
          {greeting()}, {firstName}
        </h1>
        <p class="muted">Your files, notes and the shared library, all in one place.</p>
      </header>

      <div class="member-actions">
        {actions.map((action) => (
          <a key={action.label} class="member-action" href={action.href}>
            <span class="member-action-icon">
              <Icon name={action.icon} size="lg" />
            </span>
            <span>
              <strong>{action.label}</strong>
              <small>{action.hint}</small>
            </span>
          </a>
        ))}
      </div>

      <Section title="Pick up where you left off">
        <Grid>
          <Card span={6} title="Continue editing" icon="file-text" aside={<a href="/tools/markdown">Open editor</a>}>
            {notes.data?.items.length ? (
              <Rows>
                {notes.data.items.map((file) => (
                  <Row
                    key={file.path}
                    href={`/tools/markdown?file=${encodeURIComponent(file.path)}`}
                    icon="file-text"
                    title={file.name}
                    meta={`edited ${timeAgo(file.modified)}`}
                  />
                ))}
              </Rows>
            ) : (
              <EmptyState icon="file-text" title={notes.data ? 'No notes yet' : 'Loading…'}>
                {notes.data && (
                  <LinkButton href="/tools/markdown?new=1" icon="plus" variant="primary">
                    Write your first note
                  </LinkButton>
                )}
              </EmptyState>
            )}
          </Card>

          <Card span={6} title="My space" icon="folder" aside={<a href={homeHref}>Open</a>}>
            {space.data ? (
              <>
                <Cluster gap={8}>
                  {space.data.tiles.map((tile) => (
                    <Stat key={tile.label} value={tile.value} label={tile.label} />
                  ))}
                </Cluster>
                {space.data.breakdown?.length ? (
                  <Breakdown
                    label="My storage by file type"
                    segments={space.data.breakdown.map((item) => ({
                      ...item,
                      icon: KIND_ICON[item.label as keyof typeof KIND_ICON] ?? 'file',
                    }))}
                  />
                ) : (
                  <p class="muted">Nothing stored yet. Uploads and notes you save land here, visible only to you.</p>
                )}
              </>
            ) : (
              <div class="skeleton" style={{ height: '96px' }} />
            )}
          </Card>
        </Grid>
      </Section>

      <Section title="Shared with everyone">
        <Grid>
          <Card span={8} title="New in the library" icon="sparkles" aside={<a href="/tools/files">Browse</a>}>
            {library.data?.items.length ? (
              <Rows>
                {library.data.items.map((file) => (
                  <Row
                    key={file.path}
                    href={openInFiles(file)}
                    icon={KIND_ICON[file.kind]}
                    title={file.name}
                    meta={`${formatBytes(file.size)} · added ${timeAgo(file.modified)}`}
                  />
                ))}
              </Rows>
            ) : (
              <EmptyState icon="library" title={library.data ? 'The library is empty' : 'Loading…'}>
                {library.data && <span>Your admin hasn't added shared files yet.</span>}
              </EmptyState>
            )}
          </Card>

          <Card span={4} title="Your activity" icon="activity">
            {mine.data?.items.length ? (
              <Rows class="feed">
                {mine.data.items.map((event) => {
                  const [icon, verb] = EVENT_LABEL[event.action] ?? ['activity', event.action];
                  return <Row key={`${event.at}-${event.detail}`} icon={icon} title={event.detail.split('/').at(-1) ?? event.detail} meta={`${verb} · ${timeAgo(event.at)}`} />;
                })}
              </Rows>
            ) : (
              <EmptyState icon="clock" title="Nothing yet">
                <span>Your uploads and saves will show up here.</span>
              </EmptyState>
            )}
          </Card>
        </Grid>
      </Section>
    </>
  );
}
