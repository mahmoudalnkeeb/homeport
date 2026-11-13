import { isStreamable, type FileEntry } from '@homeport/contracts';
import {
  ActionSheet,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  EmptyState,
  formatBytes,
  formatDate,
  Icon,
  IconButton,
  Input,
  KIND_ICON,
  Notice,
  PageHeader,
  Rows,
  Segmented,
  confirm,
  prompt,
  timeAgo,
  toast,
  type Column,
  type SheetAction,
} from '@homeport/ui';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { api, rawUrl, uploadFiles } from '../../api';
import { useAuth } from '../../auth';
import { PHONE, useFileDrop, useMediaQuery, usePreference, useResource } from '../../hooks';
import { streamLabel, usePlayer, type Track } from '../../media';
import { UploadList, useUploads } from '../../uploads';
import { PreviewDialog } from './PreviewDialog';
import '../../library.css';

const LAYOUTS = ['list', 'grid'] as const;
type Layout = (typeof LAYOUTS)[number];
type Space = 'library' | 'home';

const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const filesUrl = (path: string, extra = '') =>
  `/tools/files${path || extra ? '?' : ''}${path ? `path=${encodeURIComponent(path)}` : ''}${path && extra ? '&' : ''}${extra}`;
const markdownUrl = (path: string) => `/tools/markdown?file=${encodeURIComponent(path)}`;
const isMedia = (entry: FileEntry): entry is FileEntry & { kind: 'video' | 'audio' } => isStreamable(entry.kind);
const toTrack = (entry: FileEntry & { kind: 'video' | 'audio' }): Track => ({
  id: entry.path,
  kind: entry.kind,
  title: entry.name,
  src: rawUrl(entry.path),
  download: rawUrl(entry.path, true),
  stream: entry.stream,
});

export default function FilesPage() {
  const { query, route } = useLocation();
  const { me, canWrite } = useAuth();
  const isPhone = useMediaQuery(PHONE);
  const path = query.path ?? '';
  const [filter, setFilter] = useState('');
  const [layout, setLayout] = usePreference<Layout>('files-layout', 'list', LAYOUTS);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [menuFor, setMenuFor] = useState<FileEntry | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const inHome = path === me.home || path.startsWith(`${me.home}/`);
  const space: Space = inHome ? 'home' : 'library';

  const navigate = useCallback((next: string) => route(filesUrl(next)), [route]);
  const listing = useResource(
    () =>
      api.files.list(path).catch((error: Error) => {
        toast(error.message, 'error');
        if (path) navigate('');
        throw error;
      }),
    { key: path }
  );
  const reloadListing = listing.reload;
  const writable = listing.data !== undefined && canWrite(path);

  const play = usePlayer();
  const playFrom = useCallback(
    (entry: FileEntry, siblings: FileEntry[]) => {
      const queue = siblings.filter(isMedia);
      play(
        queue.map(toTrack),
        Math.max(
          0,
          queue.findIndex((item) => item.path === entry.path)
        )
      );
    },
    [play]
  );

  const openPath = query.open;
  const handledOpen = useRef<string | undefined>(undefined);
  useEffect(() => {
    const entry = listing.data?.find((candidate) => candidate.path === openPath);
    if (!entry || handledOpen.current === openPath) return;
    handledOpen.current = openPath;
    if (isMedia(entry)) playFrom(entry, listing.data ?? []);
    else setPreview(entry);
  }, [listing.data, openPath, playFrom]);

  const { jobs, upload: track } = useUploads();
  const upload = useCallback(
    async (folder: string, files: File[]) => {
      const done = await track(files, (onProgress) => uploadFiles(folder, files, onProgress));
      if (done && folder === path) void reloadListing();
    },
    [track, path, reloadListing]
  );
  const dragging = useFileDrop((files) => {
    if (writable) void upload(path, files);
    else toast('This folder is read-only for you. Upload to My files instead.', 'error');
  });

  const entries = useMemo(() => {
    const all = listing.data ?? [];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((entry) => entry.name.toLowerCase().includes(needle)) : all;
  }, [listing.data, filter]);

  const open = (entry: FileEntry) => {
    if (entry.kind === 'folder') navigate(entry.path);
    else if (isMedia(entry)) playFrom(entry, entries);
    else setPreview(entry);
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Something went wrong', 'error');
    }
  };

  const renameEntry = (entry: FileEntry) =>
    run(async () => {
      const name = await prompt({ title: 'Rename', label: 'New name', value: entry.name, confirmLabel: 'Rename' });
      if (!name || name === entry.name) return;
      await api.files.rename({ path: entry.path, name });
      toast(`Renamed to ${name}`);
      await listing.reload();
    });

  const deleteEntry = (entry: FileEntry) =>
    run(async () => {
      const folder = entry.kind === 'folder';
      const ok = await confirm({
        title: `Delete ${folder ? 'folder' : 'file'}?`,
        message: `“${entry.name}”${folder ? ' and everything inside it' : ''} will be permanently deleted.`,
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      await api.files.remove(entry.path);
      toast(`Deleted ${entry.name}`);
      await listing.reload();
    });

  const createFolder = () =>
    run(async () => {
      const name = await prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create' });
      if (!name) return;
      await api.files.createFolder(joinPath(path, name));
      navigate(joinPath(path, name));
    });

  const actionsFor = (entry: FileEntry): SheetAction[] => {
    const actions: SheetAction[] = [
      {
        label: entry.kind === 'folder' ? 'Open' : 'Preview',
        icon: entry.kind === 'folder' ? 'folder' : 'eye',
        onSelect: () => open(entry),
      },
    ];
    if (entry.kind === 'markdown')
      actions.push({ label: 'Open in Markdown', icon: 'file-text', onSelect: () => route(markdownUrl(entry.path)) });
    if (entry.kind !== 'folder')
      actions.push({ label: 'Download', icon: 'download', onSelect: () => location.assign(rawUrl(entry.path, true)) });
    if (writable) {
      actions.push(
        { label: 'Rename', icon: 'pencil', onSelect: () => void renameEntry(entry) },
        { label: 'Delete', icon: 'trash', tone: 'danger', onSelect: () => void deleteEntry(entry) }
      );
    }
    return actions;
  };

  const relativeParts = (inHome ? path.slice(me.home.length) : path).split('/').filter(Boolean);
  const base = inHome ? me.home : '';
  const crumbs = [
    { label: inHome ? 'My files' : 'Library', href: filesUrl(base) },
    ...relativeParts.map((name, i) => ({ label: name, href: filesUrl(joinPath(base, relativeParts.slice(0, i + 1).join('/'))) })),
  ];

  const columns: Column<FileEntry>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (entry) => (
        <div class="name-cell">
          <span class="row-icon">
            <Icon name={KIND_ICON[entry.kind]} />
          </span>
          <button type="button" onClick={() => open(entry)}>
            {entry.name}
          </button>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      render: (entry) => (
        <span class="kind-cell">
          {entry.kind}
          {entry.stream && ` · ${streamLabel(entry.stream)}`}
        </span>
      ),
    },
    { key: 'size', header: 'Size', numeric: true, render: (entry) => (entry.kind === 'folder' ? '—' : formatBytes(entry.size)) },
    {
      key: 'modified',
      header: 'Modified',
      numeric: true,
      render: (entry) => <span title={formatDate(entry.modified)}>{timeAgo(entry.modified)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      hiddenHeader: true,
      render: (entry) => (
        <div class="row-actions">
          {entry.kind === 'markdown' && (
            <IconButton
              size="sm"
              icon="file-text"
              label={`Open ${entry.name} in Markdown`}
              onClick={() => route(markdownUrl(entry.path))}
            />
          )}
          {entry.kind !== 'folder' && (
            <IconButton
              size="sm"
              icon="download"
              label={`Download ${entry.name}`}
              onClick={() => location.assign(rawUrl(entry.path, true))}
            />
          )}
          {writable && <IconButton size="sm" icon="pencil" label={`Rename ${entry.name}`} onClick={() => renameEntry(entry)} />}
          {writable && <IconButton size="sm" icon="trash" label={`Delete ${entry.name}`} onClick={() => deleteEntry(entry)} />}
        </div>
      ),
    },
  ];

  const emptyHint = filter ? 'Try a different filter.' : writable ? 'Drop files here or use Upload.' : 'Nothing has been shared here yet.';

  return (
    <>
      <PageHeader
        title="Files"
        description={
          space === 'home' ? 'Your private space. Only you and admins can see it.' : 'The shared library everyone can stream from.'
        }
        actions={
          writable && (
            <>
              <Button icon="folder-plus" onClick={createFolder}>
                New folder
              </Button>
              <Button variant="primary" icon="upload" onClick={() => pickerRef.current?.click()}>
                Upload
              </Button>
              <input
                ref={pickerRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void upload(path, [...(event.currentTarget.files ?? [])]);
                  event.currentTarget.value = '';
                }}
              />
            </>
          )
        }
      />

      <div class="space-switch">
        <Segmented
          label="Space"
          value={space}
          onChange={(next) => navigate(next === 'home' ? me.home : '')}
          options={[
            { value: 'library', label: 'Library', icon: 'library' },
            { value: 'home', label: 'My files', icon: 'folder' },
          ]}
        />
      </div>

      <div class="toolbar">
        <Breadcrumbs label="Folder path" items={crumbs} />
        <span class="spacer" />
        <div class="filter">
          <Input
            type="search"
            icon="search"
            label="Filter this folder"
            placeholder="Filter this folder"
            value={filter}
            onValue={setFilter}
          />
        </div>
        <Segmented
          label="Layout"
          iconOnly
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'list', label: 'List view', icon: 'list' },
            { value: 'grid', label: 'Grid view', icon: 'grid' },
          ]}
        />
      </div>

      {listing.data && !writable && (
        <div class="files-notice">
          <Notice title="Read-only">
            You can browse, stream and download here. To upload or write notes, use <a href={filesUrl(me.home)}>My files</a>.
          </Notice>
        </div>
      )}

      <UploadList jobs={jobs} />

      {query.upload === '1' && writable && (
        <div class="dropzone upload-prompt">
          <Icon name="upload" size="lg" />
          <strong>{isPhone ? 'Add files from your phone' : 'Drop files anywhere on this page'}</strong>
          <Button variant="primary" onClick={() => pickerRef.current?.click()}>
            Choose files
          </Button>
        </div>
      )}

      {!listing.data ? (
        <Card>
          <div class="skeleton" style={{ height: '160px' }} />
        </Card>
      ) : !entries.length ? (
        <Card>
          <EmptyState icon={filter ? 'search' : 'folder'} title={filter ? 'No matches' : 'This folder is empty'}>
            <span>{emptyHint}</span>
          </EmptyState>
        </Card>
      ) : layout === 'grid' ? (
        <div class="tiles">
          {entries.map((entry) => (
            <button key={entry.path} type="button" class="tile" title={entry.name} onClick={() => open(entry)}>
              <span class="tile-thumb">
                {entry.kind === 'image' || entry.stream?.poster ? (
                  <img src={entry.stream?.poster ?? rawUrl(entry.path)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <Icon name={KIND_ICON[entry.kind]} />
                )}
              </span>
              <span class="tile-info">
                <span class="row-title">{entry.name}</span>
                <span class="row-meta">{entry.kind === 'folder' ? 'Folder' : formatBytes(entry.size)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : isPhone ? (
        <Card class="file-list">
          <Rows>
            {entries.map((entry) => (
              <li key={entry.path} class="file-row">
                <button type="button" class="row" onClick={() => open(entry)}>
                  <span class="row-icon">
                    <Icon name={KIND_ICON[entry.kind]} />
                  </span>
                  <span class="row-main">
                    <span class="row-title">{entry.name}</span>
                    <span class="row-meta">
                      {entry.kind === 'folder' ? 'Folder' : formatBytes(entry.size)} · {timeAgo(entry.modified)}
                    </span>
                  </span>
                </button>
                <IconButton icon="more" label={`Actions for ${entry.name}`} onClick={() => setMenuFor(entry)} />
              </li>
            ))}
          </Rows>
        </Card>
      ) : (
        <DataTable columns={columns} rows={entries} rowKey={(entry) => entry.path} />
      )}

      <PreviewDialog entry={preview} onClose={() => setPreview(null)} />
      <ActionSheet
        open={menuFor !== null}
        title={menuFor?.name ?? ''}
        actions={menuFor ? actionsFor(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />

      {dragging && (
        <div class="drop-overlay" aria-hidden="true">
          <div class="dropzone">
            <Icon name={writable ? 'upload' : 'lock'} size="lg" />
            <strong>{writable ? 'Drop to upload' : 'Read-only folder'}</strong>
            <span class="muted">
              {writable ? `into ${crumbs.map((crumb) => crumb.label).join(' / ')}` : 'Switch to My files to upload'}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
