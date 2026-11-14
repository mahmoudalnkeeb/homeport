import type { Album, MusicTrack } from '@homeport/contracts';
import {
  Button,
  Card,
  Chip,
  DataTable,
  Dialog,
  EmptyState,
  formatClock,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Segmented,
  toast,
  type Column,
} from '@homeport/ui';
import { useState } from 'preact/hooks';

import { api } from '../../api';
import { useAuth } from '../../auth';
import { useDebounced, useResource } from '../../hooks';
import { useAppend, usePlayer, type Track } from '../../media';
import '../../library.css';
import './music.css';

type Tab = 'albums' | 'artists' | 'songs';

const PAGE_SIZE = 48;
const SEARCH_DELAY_MS = 250;

const musicTrack = (track: MusicTrack): Track => ({
  id: track.id,
  kind: 'audio',
  title: `${track.title} · ${track.artist}`,
  src: track.url,
  download: `${track.url}&download=true`,
  stream: null,
  poster: track.cover,
});

function Cover({ src }: { src: string | null }) {
  return src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Icon name="music" />;
}

function AlbumTracks({ album, onClose }: { album: Album; onClose: () => void }) {
  const play = usePlayer();
  const append = useAppend();
  const detail = useResource(() => api.music.album(album.id), { key: album.id });
  const list = detail.data?.trackList ?? [];

  const playFrom = (index: number) => {
    play(list.map(musicTrack), index);
    onClose();
  };

  if (detail.error) return <EmptyState icon="alert" title="Could not load this album" />;
  if (!detail.data) return <div class="skeleton" style={{ height: '160px' }} />;
  return (
    <div class="music-album">
      <div class="music-album-head">
        <span class="music-album-cover">
          <Cover src={album.cover} />
        </span>
        <div class="stack">
          <span class="muted">
            {album.albumArtist}
            {album.year ? ` · ${album.year}` : ''}
          </span>
          <div class="cluster">
            <Button variant="primary" icon="play" disabled={!list.length} onClick={() => playFrom(0)}>
              Play
            </Button>
            <Button
              icon="list-music"
              disabled={!list.length}
              onClick={() => {
                append(list.map(musicTrack));
                toast(`Added ${list.length} songs to the queue`);
              }}
            >
              Add to queue
            </Button>
          </div>
        </div>
      </div>
      <ol class="music-tracks">
        {list.map((track, index) => (
          <li key={track.id}>
            <button type="button" onClick={() => playFrom(index)}>
              <span class="mono muted">{track.trackNo ?? index + 1}</span>
              <span class="truncate">
                {track.title}
                {track.artist !== album.albumArtist && <span class="muted"> · {track.artist}</span>}
              </span>
              <span class="mono muted">{track.duration ? formatClock(track.duration) : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function MusicPage() {
  const { can } = useAuth();
  const play = usePlayer();
  const append = useAppend();
  const [tab, setTab] = useState<Tab>('albums');
  const [artist, setArtist] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Album | null>(null);
  const q = useDebounced(search, SEARCH_DELAY_MS);
  const query = { q, page, pageSize: PAGE_SIZE };
  const key = `${tab}|${artist ?? ''}|${q}|${page}`;

  const albums = useResource(() => api.music.albums(artist ? { ...query, artist } : query), { key: tab === 'albums' ? key : 'off' });
  const artists = useResource(() => api.music.artists(query), { key: tab === 'artists' ? key : 'off' });
  const songs = useResource(() => api.music.tracks(query), { key: tab === 'songs' ? key : 'off' });
  const listing = tab === 'albums' ? albums : tab === 'artists' ? artists : songs;
  const total = listing.data?.meta.total ?? 0;

  const reset = (next: Partial<{ tab: Tab; artist: string | undefined }>) => {
    if (next.tab) setTab(next.tab);
    if ('artist' in next) setArtist(next.artist);
    setPage(1);
  };

  const rescan = async () => {
    const result = await api.music.rescan();
    toast(`Music rescanned: ${result.queued} new, ${result.removed} removed`);
    await listing.reload();
  };

  const songItems = songs.data?.items ?? [];
  const columns: Column<MusicTrack>[] = [
    {
      key: 'play',
      header: 'Play',
      hiddenHeader: true,
      render: (track) => (
        <IconButton
          size="sm"
          icon="play"
          label={`Play ${track.title}`}
          onClick={() =>
            play(
              songItems.map(musicTrack),
              songItems.findIndex((item) => item.id === track.id)
            )
          }
        />
      ),
    },
    { key: 'title', header: 'Title', render: (track) => <span class="truncate">{track.title}</span> },
    { key: 'artist', header: 'Artist', render: (track) => track.artist },
    { key: 'album', header: 'Album', render: (track) => track.album },
    { key: 'duration', header: 'Length', numeric: true, render: (track) => (track.duration ? formatClock(track.duration) : '') },
    {
      key: 'queue',
      header: 'Queue',
      hiddenHeader: true,
      render: (track) => <IconButton size="sm" icon="plus" label={`Add ${track.title} to queue`} onClick={() => append([musicTrack(track)])} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Music"
        description="Albums and artists from library/music, read from each file's tags."
        actions={
          can('library:manage') && (
            <Button icon="refresh" onClick={() => void rescan().catch(() => toast('Rescan failed', 'error'))}>
              Rescan
            </Button>
          )
        }
      />

      <div class="toolbar">
        <Segmented
          label="Browse"
          value={tab}
          onChange={(next) => reset({ tab: next, artist: undefined })}
          options={[
            { value: 'albums', label: 'Albums', icon: 'library' },
            { value: 'artists', label: 'Artists', icon: 'users' },
            { value: 'songs', label: 'Songs', icon: 'music' },
          ]}
        />
        <div class="filter">
          <Input
            type="search"
            icon="search"
            label="Search music"
            placeholder="Search titles and artists"
            value={search}
            onValue={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </div>
        {artist && (
          <span class="cluster">
            <Chip icon="user">{artist}</Chip>
            <IconButton size="sm" icon="x" label="Show all artists" onClick={() => reset({ artist: undefined })} />
          </span>
        )}
      </div>

      {!listing.data ? (
        <Card>
          <div class="skeleton" style={{ height: '200px' }} />
        </Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState icon={q ? 'search' : 'music'} title={q ? 'Nothing matches that search' : 'No music yet'}>
            <span>{q ? 'Try a shorter search.' : 'Upload audio files to library/music in Files. Artist/Album folders work best.'}</span>
          </EmptyState>
        </Card>
      ) : tab === 'albums' ? (
        <div class="tiles is-square">
          {albums.data?.items.map((album) => (
            <button key={album.id} type="button" class="tile" title={album.title} onClick={() => setOpen(album)}>
              <span class="tile-thumb">
                <Cover src={album.cover} />
              </span>
              <span class="tile-info">
                <span class="row-title truncate">{album.title}</span>
                <span class="row-meta truncate">{album.albumArtist}</span>
              </span>
            </button>
          ))}
        </div>
      ) : tab === 'artists' ? (
        <div class="tiles is-square">
          {artists.data?.items.map((item) => (
            <button key={item.name} type="button" class="tile" title={item.name} onClick={() => reset({ tab: 'albums', artist: item.name })}>
              <span class="tile-thumb">
                <Cover src={item.cover} />
              </span>
              <span class="tile-info">
                <span class="row-title truncate">{item.name}</span>
                <span class="row-meta">
                  {item.albums} album{item.albums === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <DataTable columns={columns} rows={songItems} rowKey={(track) => track.id} />
      )}

      <div class="music-pages">
        <Pagination label="Music pages" page={page} totalPages={listing.data?.meta.totalPages ?? 0} onPage={setPage} />
      </div>

      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? ''} icon="music" size="lg">
        {open && <AlbumTracks album={open} onClose={() => setOpen(null)} />}
      </Dialog>
    </>
  );
}
