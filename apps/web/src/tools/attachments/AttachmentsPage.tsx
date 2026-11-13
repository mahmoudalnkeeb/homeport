import { ATTACHMENT_CATEGORIES, isStreamable, type Attachment, type AttachmentCategory } from '@homeport/contracts';
import {
  ActionSheet,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  formatBytes,
  formatDate,
  Icon,
  IconButton,
  Input,
  KIND_ICON,
  LinkButton,
  PageHeader,
  Pagination,
  Segmented,
  Skeleton,
  confirm,
  copyText,
  prompt,
  timeAgo,
  toast,
  type Column,
  type IconName,
  type SheetAction,
} from '@homeport/ui';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { api, uploadAttachments } from '../../api';
import { useAuth } from '../../auth';
import { PHONE, useFileDrop, useMediaQuery, usePreference, useResource } from '../../hooks';
import { streamLabel, usePlayer, type Track } from '../../media';
import { UploadList, useUploads } from '../../uploads';
import '../../library.css';
import './attachments.css';

type Filter = 'all' | AttachmentCategory;
type Scope = 'everyone' | 'mine';
const LAYOUTS = ['grid', 'list'] as const;
type Layout = (typeof LAYOUTS)[number];

const PAGE_SIZE = 60;
const POLL_MS = 5000;
const SEARCH_DELAY_MS = 250;

const CATEGORY_META: Record<AttachmentCategory, { label: string; icon: IconName }> = {
  image: { label: 'Images', icon: 'image' },
  video: { label: 'Video', icon: 'film' },
  audio: { label: 'Audio', icon: 'music' },
  document: { label: 'Documents', icon: 'file-text' },
  archive: { label: 'Archives', icon: 'archive' },
  other: { label: 'Other', icon: 'file' },
};

const isFilter = (value: string | undefined): value is AttachmentCategory => ATTACHMENT_CATEGORIES.some((category) => category === value);

const filesHref = (path: string) =>
  `/tools/files?path=${encodeURIComponent(path.split('/').slice(0, -1).join('/'))}&open=${encodeURIComponent(path)}`;
const isMedia = (item: Attachment): item is Attachment & { kind: 'video' | 'audio' } => isStreamable(item.kind);
const attachmentTrack = (item: Attachment & { kind: 'video' | 'audio' }): Track => ({
  id: item.id,
  kind: item.kind,
  title: item.name,
  src: item.url,
  download: `${item.url}?download=true`,
  stream: item.stream,
});
const absolute = (url: string) => new URL(url, location.origin).href;
const markdownOf = (item: Attachment) => `${item.kind === 'image' ? '!' : ''}[${item.name.replace(/[[\]]/g, '')}](${item.url})`;
const thumbnailOf = (item: Attachment) => (item.kind === 'image' ? item.url : (item.stream?.poster ?? null));
const attachmentsUrl = (filter: Filter, extra = '') => {
  const params = new URLSearchParams(extra);
  if (filter !== 'all') params.set('category', filter);
  return `/tools/attachments${params.size ? `?${params}` : ''}`;
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function TextBody({ url }: { url: string }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('Could not open this attachment'))))
      .then((value) => active && setText(value))
      .catch((caught: Error) => active && setError(caught.message));
    return () => {
      active = false;
    };
  }, [url]);
  if (error) return <EmptyState icon="alert" title={error} />;
  if (text === undefined) return <Skeleton height="60%" />;
  return <pre>{text}</pre>;
}

function PreviewBody({ item }: { item: Attachment }) {
  switch (item.kind) {
    case 'image':
      return <img src={item.url} alt={item.name} />;
    case 'pdf':
      return <iframe src={item.url} title={item.name} />;
    case 'markdown':
    case 'text':
      return item.size > 2 * 1024 * 1024 ? (
        <EmptyState icon="file" title="Too large to preview">
          <span>{formatBytes(item.size)}. Download it instead.</span>
        </EmptyState>
      ) : (
        <TextBody url={item.url} />
      );
    default:
      return (
        <EmptyState icon={KIND_ICON[item.kind]} title="No preview for this file type">
          <span>{formatBytes(item.size)}</span>
          <LinkButton variant="primary" icon="download" href={`${item.url}?download=true`} download>
            Download
          </LinkButton>
        </EmptyState>
      );
  }
}

export default function AttachmentsPage() {
  const { query, route } = useLocation();
  const { me, can } = useAuth();
  const isPhone = useMediaQuery(PHONE);
  const filter: Filter = isFilter(query.category) ? query.category : 'all';
  const [scope, setScope] = useState<Scope>('everyone');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim(), SEARCH_DELAY_MS);
  const [page, setPage] = useState(1);
  const [layout, setLayout] = usePreference<Layout>('attachments-layout', 'grid', LAYOUTS);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [menuFor, setMenuFor] = useState<Attachment | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const writable = can('attachments:write');
  const canManage = (item: Attachment) => me.role === 'admin' || item.owner === me.username;
  const canDelete = (item: Attachment) => writable && canManage(item) && !item.path;

  useEffect(() => setPage(1), [filter, scope, term]);

  const [busy, setBusy] = useState(false);
  const listing = useResource(
    () =>
      api.attachments.page({
        ...(filter === 'all' ? {} : { category: filter }),
        ...(term ? { q: term } : {}),
        mine: scope === 'mine',
        page,
        pageSize: PAGE_SIZE,
      }),
    { key: `${filter}|${scope}|${term}|${page}`, ...(busy ? { interval: POLL_MS } : {}) }
  );
  const counts = useResource(() => api.attachments.categories(), { key: listing.data?.meta.total });
  const items = useMemo(() => listing.data?.items ?? [], [listing.data]);
  const totalPages = listing.data?.meta.totalPages ?? 0;

  useEffect(() => {
    if (totalPages && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const goToPage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    setBusy(items.some((item) => item.stream && (item.stream.status === 'pending' || item.stream.status === 'processing')));
    setPreview((current) => (current ? (items.find((item) => item.id === current.id) ?? current) : current));
  }, [items]);

  const play = usePlayer();
  const show = (item: Attachment) => {
    if (!isMedia(item)) return setPreview(item);
    const queue = items.filter(isMedia);
    play(
      queue.map(attachmentTrack),
      Math.max(
        0,
        queue.findIndex((entry) => entry.id === item.id)
      )
    );
  };

  const openId = query.open;
  useEffect(() => {
    if (!openId) return;
    api.attachments
      .get(openId)
      .then((item) => (isMedia(item) ? play([attachmentTrack(item)], 0) : setPreview(item)))
      .catch((error: Error) => toast(error.message, 'error'));
  }, [openId, play]);

  const { jobs, upload: track } = useUploads();
  const reload = listing.reload;
  const upload = useCallback(
    async (files: File[]) => {
      if (await track(files, (onProgress) => uploadAttachments(files, onProgress))) void reload();
    },
    [track, reload]
  );
  const dragging = useFileDrop((files) => {
    if (writable) void upload(files);
  });

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Something went wrong', 'error');
    }
  };

  const renameItem = (item: Attachment) =>
    run(async () => {
      const name = await prompt({ title: 'Rename attachment', label: 'Display name', value: item.name, confirmLabel: 'Rename' });
      if (!name || name === item.name) return;
      const updated = await api.attachments.rename(item.id, name);
      setPreview((current) => (current?.id === item.id ? updated : current));
      toast(`Renamed to ${name}`);
      await listing.reload();
    });

  const deleteItem = (item: Attachment) =>
    run(async () => {
      const ok = await confirm({
        title: 'Delete attachment?',
        message: `“${item.name}” will be deleted, and every link or note that embeds it will stop working.`,
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      await api.attachments.remove(item.id);
      setPreview((current) => (current?.id === item.id ? null : current));
      toast(`Deleted ${item.name}`);
      await listing.reload();
    });

  const copyLink = (item: Attachment) => copyText(absolute(item.url), 'Link copied');
  const copyMarkdown = (item: Attachment) => copyText(markdownOf(item), 'Markdown copied');
  const download = (item: Attachment) => location.assign(`${item.url}?download=true`);

  const actionsFor = (item: Attachment): SheetAction[] => [
    { label: 'Preview', icon: 'eye', onSelect: () => show(item) },
    { label: 'Copy link', icon: 'link', onSelect: () => void copyLink(item) },
    { label: 'Copy Markdown', icon: 'file-text', onSelect: () => void copyMarkdown(item) },
    { label: 'Download', icon: 'download', onSelect: () => download(item) },
    ...(item.path ? [{ label: 'Open in Files', icon: 'folder' as const, onSelect: () => route(filesHref(item.path ?? '')) }] : []),
    ...(writable && canManage(item) ? [{ label: 'Rename', icon: 'pencil' as const, onSelect: () => void renameItem(item) }] : []),
    ...(canDelete(item)
      ? [{ label: 'Delete', icon: 'trash' as const, tone: 'danger' as const, onSelect: () => void deleteItem(item) }]
      : []),
  ];

  const countOf = (category: Filter) => {
    const stats = counts.data ?? [];
    return category === 'all'
      ? stats.reduce((sum, stat) => sum + stat.count, 0)
      : (stats.find((stat) => stat.category === category)?.count ?? 0);
  };
  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'All', icon: 'layers' as const },
      ...ATTACHMENT_CATEGORIES.map((category) => ({ value: category, ...CATEGORY_META[category] })),
    ],
    []
  );

  const metaOf = (item: Attachment) =>
    [formatBytes(item.size), item.stream ? streamLabel(item.stream) : null, item.owner ?? 'deleted user'].filter(Boolean).join(' · ');

  const columns: Column<Attachment>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (item) => (
        <div class="name-cell">
          <span class="row-icon">
            <Icon name={KIND_ICON[item.kind]} />
          </span>
          <button type="button" onClick={() => show(item)}>
            {item.name}
          </button>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => (
        <span class="kind-cell">
          {CATEGORY_META[item.category].label}
          {item.stream && ` · ${streamLabel(item.stream)}`}
        </span>
      ),
    },
    { key: 'owner', header: 'Owner', render: (item) => <span class="muted">{item.owner ?? '—'}</span> },
    { key: 'size', header: 'Size', numeric: true, render: (item) => formatBytes(item.size) },
    {
      key: 'added',
      header: 'Added',
      numeric: true,
      render: (item) => <span title={formatDate(item.createdAt)}>{timeAgo(item.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      hiddenHeader: true,
      render: (item) => (
        <div class="row-actions">
          <IconButton size="sm" icon="link" label={`Copy link to ${item.name}`} onClick={() => copyLink(item)} />
          <IconButton size="sm" icon="download" label={`Download ${item.name}`} onClick={() => download(item)} />
          {writable && canManage(item) && (
            <IconButton size="sm" icon="pencil" label={`Rename ${item.name}`} onClick={() => renameItem(item)} />
          )}
          {canDelete(item) && <IconButton size="sm" icon="trash" label={`Delete ${item.name}`} onClick={() => deleteItem(item)} />}
        </div>
      ),
    },
  ];

  const filtered = Boolean(term) || scope === 'mine' || filter !== 'all';
  const emptyTitle = filtered ? 'Nothing matches' : 'No attachments yet';
  const emptyHint = filtered
    ? 'Try another category or search.'
    : writable
      ? 'Drop files here or use Upload. Each one gets a link you can reuse anywhere.'
      : 'Nothing has been shared yet.';

  return (
    <>
      <PageHeader
        title="Attachments"
        description="Reusable media and documents, sorted by type. Every item keeps a stable link you can embed in notes."
        actions={
          writable && (
            <>
              <Button variant="primary" icon="upload" onClick={() => pickerRef.current?.click()}>
                Upload
              </Button>
              <input
                ref={pickerRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void upload([...(event.currentTarget.files ?? [])]);
                  event.currentTarget.value = '';
                }}
              />
            </>
          )
        }
      />

      <div class="category-switch">
        <Segmented
          label="Category"
          value={filter}
          onChange={(next) => route(attachmentsUrl(next))}
          options={filterOptions.map((option) => ({
            ...option,
            label: counts.data ? `${option.label} ${countOf(option.value)}` : option.label,
          }))}
        />
      </div>

      <div class="toolbar">
        <div class="filter">
          <Input type="search" icon="search" label="Search attachments" placeholder="Search by name" value={search} onValue={setSearch} />
        </div>
        <Segmented
          label="Owner"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'everyone', label: 'Everyone', icon: 'users' },
            { value: 'mine', label: 'Mine', icon: 'user' },
          ]}
        />
        <span class="spacer" />
        {!isPhone && (
          <Segmented
            label="Layout"
            iconOnly
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', label: 'Grid view', icon: 'grid' },
              { value: 'list', label: 'List view', icon: 'list' },
            ]}
          />
        )}
      </div>

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
      ) : !items.length ? (
        <Card>
          <EmptyState icon={filtered ? 'search' : 'paperclip'} title={emptyTitle}>
            <span>{emptyHint}</span>
          </EmptyState>
        </Card>
      ) : layout === 'grid' || isPhone ? (
        <div class="tiles attachment-tiles">
          {items.map((item) => {
            const thumb = thumbnailOf(item);
            return (
              <div key={item.id} class="attachment-tile">
                <button type="button" class="tile" title={item.name} onClick={() => show(item)}>
                  <span class="tile-thumb">
                    {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" /> : <Icon name={KIND_ICON[item.kind]} />}
                    {item.stream && item.stream.status !== 'ready' && <span class="tile-flag">{streamLabel(item.stream)}</span>}
                  </span>
                  <span class="tile-info">
                    <span class="row-title">{item.name}</span>
                    <span class="row-meta">{metaOf(item)}</span>
                  </span>
                </button>
                <IconButton size="sm" icon="more" label={`Actions for ${item.name}`} class="tile-menu" onClick={() => setMenuFor(item)} />
              </div>
            );
          })}
        </div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(item) => item.id} />
      )}

      <div class="attachment-pages">
        <Pagination label="Attachment pages" page={page} totalPages={totalPages} onPage={goToPage} />
      </div>

      <Dialog
        open={preview !== null}
        onClose={() => {
          setPreview(null);
          if (openId) route(attachmentsUrl(filter), true);
        }}
        size="lg"
        title={preview?.name ?? ''}
        icon={preview ? KIND_ICON[preview.kind] : 'file'}
        bodyClass="preview-body"
        actions={
          preview && (
            <>
              <IconButton size="sm" icon="link" label="Copy link" onClick={() => copyLink(preview)} />
              <IconButton size="sm" icon="file-text" label="Copy Markdown" onClick={() => copyMarkdown(preview)} />
              <LinkButton size="sm" icon="download" href={`${preview.url}?download=true`} download>
                <span class="btn-label">Download</span>
              </LinkButton>
            </>
          )
        }
        footer={
          preview && (
            <div class="attachment-foot">
              <span class="muted">
                {CATEGORY_META[preview.category].label} · {formatBytes(preview.size)} · added by {preview.owner ?? 'a deleted user'}{' '}
                {timeAgo(preview.createdAt)}
              </span>
              <span class="cluster">
                {preview.path && (
                  <LinkButton size="sm" icon="folder" href={filesHref(preview.path)}>
                    Open in Files
                  </LinkButton>
                )}
                {writable && canManage(preview) && (
                  <Button size="sm" icon="pencil" onClick={() => renameItem(preview)}>
                    Rename
                  </Button>
                )}
                {canDelete(preview) && (
                  <Button size="sm" icon="trash" onClick={() => deleteItem(preview)}>
                    Delete
                  </Button>
                )}
              </span>
            </div>
          )
        }
      >
        {preview && <PreviewBody key={preview.id} item={preview} />}
      </Dialog>

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
            <strong>{writable ? 'Drop to add attachments' : 'Read-only'}</strong>
            <span class="muted">{writable ? 'Files are sorted into categories by type' : 'You can browse and reuse attachments here'}</span>
          </div>
        </div>
      )}
    </>
  );
}
