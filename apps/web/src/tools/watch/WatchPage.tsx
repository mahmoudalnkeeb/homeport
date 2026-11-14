import { type Show, type Video } from '@homeport/contracts';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  formatClock,
  Icon,
  Input,
  PageHeader,
  Pagination,
  Row,
  Rows,
  Section,
  Segmented,
  toast,
} from '@homeport/ui';
import { useState } from 'preact/hooks';

import { api, rawUrl } from '../../api';
import { useAuth } from '../../auth';
import { useDebounced, useResource } from '../../hooks';
import { usePlayer, type Track } from '../../media';
import '../../library.css';
import './watch.css';

type Tab = 'movies' | 'tv';

const PAGE_SIZE = 48;
const SEARCH_DELAY_MS = 250;

const resumeAt = (video: Video) => (video.progress && !video.progress.completed ? video.progress.position : 0);
const percentOf = (video: Video) => (video.progress?.duration ? Math.min(100, (video.progress.position / video.progress.duration) * 100) : 0);
const episodeCode = (video: Video) => `S${String(video.season ?? 0).padStart(2, '0')}E${String(video.episode ?? 0).padStart(2, '0')}`;
const titleOf = (video: Video) => (video.kind === 'episode' ? `${episodeCode(video)} · ${video.title}` : video.title);
const posterOf = (video: Video) => video.poster ?? video.stream?.poster ?? null;

function videoTrack(video: Video, onSaved: () => void): Track {
  return {
    id: video.id,
    kind: 'video',
    title: titleOf(video),
    src: rawUrl(video.path),
    download: rawUrl(video.path, true),
    stream: video.stream,
    poster: posterOf(video),
    startAt: resumeAt(video),
    onProgress: (position, duration) =>
      void api.watch
        .saveProgress(video.id, { position, duration })
        .then(onSaved)
        .catch(() => undefined),
  };
}

function Poster({ src, icon }: { src: string | null; icon: 'film' | 'play' }) {
  return src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Icon name={icon} />;
}

function VideoTile({ video, onOpen }: { video: Video; onOpen: () => void }) {
  const percent = percentOf(video);
  return (
    <button type="button" class="tile" title={video.title} onClick={onOpen}>
      <span class="tile-thumb">
        <Poster src={posterOf(video)} icon="film" />
        {percent > 0 && !video.progress?.completed && (
          <span class="tile-progress" aria-label={`${Math.round(percent)}% watched`}>
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>
      <span class="tile-info">
        <span class="row-title truncate">{titleOf(video)}</span>
        <span class="row-meta">{video.year ?? (video.progress?.completed ? 'Watched' : '')}</span>
      </span>
    </button>
  );
}

function PlayButtons({ video, onPlay }: { video: Video; onPlay: (video: Video, fromStart: boolean) => void }) {
  const resume = resumeAt(video);
  return (
    <div class="cluster">
      <Button variant="primary" icon="play" onClick={() => onPlay(video, false)}>
        {resume ? `Resume from ${formatClock(resume)}` : 'Play'}
      </Button>
      {resume > 0 && (
        <Button icon="reset" onClick={() => onPlay(video, true)}>
          Start over
        </Button>
      )}
    </div>
  );
}

function ShowEpisodes({ show, onPlay }: { show: Show; onPlay: (video: Video, fromStart: boolean, queue: Video[]) => void }) {
  const detail = useResource(() => api.watch.show(show.id), { key: show.id });
  if (detail.error) return <EmptyState icon="alert" title="Could not load episodes" />;
  if (!detail.data) return <div class="skeleton" style={{ height: '120px' }} />;
  const seasons = [...new Set(detail.data.videos.map((video) => video.season ?? 0))];
  return (
    <>
      {seasons.map((season) => (
        <Section key={season} title={season ? `Season ${season}` : 'Specials'}>
          <Rows>
            {detail.data?.videos
              .filter((video) => (video.season ?? 0) === season)
              .map((video, _i, list) => (
                <Row
                  key={video.id}
                  icon={video.progress?.completed ? 'check' : 'play'}
                  title={titleOf(video)}
                  meta={video.overview ?? (video.progress && !video.progress.completed ? `Stopped at ${formatClock(video.progress.position)}` : undefined)}
                  end={
                    <Button size="sm" icon="play" onClick={() => onPlay(video, false, list)}>
                      {resumeAt(video) ? 'Resume' : 'Play'}
                    </Button>
                  }
                />
              ))}
          </Rows>
        </Section>
      ))}
    </>
  );
}

export default function WatchPage() {
  const { can } = useAuth();
  const play = usePlayer();
  const [tab, setTab] = useState<Tab>('movies');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [movie, setMovie] = useState<Video | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  const q = useDebounced(search, SEARCH_DELAY_MS);
  const query = { q, page, pageSize: PAGE_SIZE };

  const continueWatching = useResource(() => api.watch.continueWatching());
  const movies = useResource(() => api.watch.movies(query), { key: tab === 'movies' ? `${q}|${page}` : 'off' });
  const shows = useResource(() => api.watch.shows(query), { key: tab === 'tv' ? `${q}|${page}` : 'off' });
  const listing = tab === 'movies' ? movies : shows;

  const refresh = () => void continueWatching.reload();
  const start = (video: Video, fromStart: boolean, queue: Video[] = [video]) => {
    const index = Math.max(
      0,
      queue.findIndex((item) => item.id === video.id)
    );
    const tracks = queue.map((item, i) => {
      const track = videoTrack(item, refresh);
      return i === index && fromStart ? { ...track, startAt: 0 } : track;
    });
    play(tracks, index);
    setMovie(null);
    setShow(null);
  };

  const rescan = async () => {
    const result = await api.watch.rescan();
    toast(`Library rescanned: ${result.queued} new, ${result.removed} removed`);
    await Promise.all([movies.reload(), shows.reload(), continueWatching.reload()]);
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  const totalPages = listing.data?.meta.totalPages ?? 0;

  return (
    <>
      <PageHeader
        title="Watch"
        description="Movies from library/movies and shows from library/tv. Progress follows you to every device."
        actions={
          can('library:manage') && (
            <Button icon="refresh" onClick={() => void rescan().catch(() => toast('Rescan failed', 'error'))}>
              Rescan
            </Button>
          )
        }
      />

      {!!continueWatching.data?.length && (
        <Section title="Continue watching" first>
          <div class="tiles is-poster watch-row">
            {continueWatching.data.map((video) => (
              <VideoTile key={video.id} video={video} onOpen={() => start(video, false)} />
            ))}
          </div>
        </Section>
      )}

      <div class="toolbar">
        <Segmented
          label="Library"
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'movies', label: 'Movies', icon: 'film' },
            { value: 'tv', label: 'TV', icon: 'monitor' },
          ]}
        />
        <div class="filter">
          <Input
            type="search"
            icon="search"
            label={tab === 'movies' ? 'Search movies' : 'Search shows'}
            placeholder="Search by title"
            value={search}
            onValue={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {!listing.data ? (
        <Card>
          <div class="skeleton" style={{ height: '200px' }} />
        </Card>
      ) : !listing.data.items.length ? (
        <Card>
          <EmptyState icon={q ? 'search' : 'film'} title={q ? 'Nothing matches that search' : 'Nothing here yet'}>
            <span>{q ? 'Try a shorter title.' : `Upload videos to ${tab === 'movies' ? 'library/movies' : 'library/tv/<Show>/Season 01'} in Files.`}</span>
          </EmptyState>
        </Card>
      ) : tab === 'movies' ? (
        <div class="tiles is-poster">
          {movies.data?.items.map((video) => <VideoTile key={video.id} video={video} onOpen={() => setMovie(video)} />)}
        </div>
      ) : (
        <div class="tiles is-poster">
          {shows.data?.items.map((item) => (
            <button key={item.id} type="button" class="tile" title={item.title} onClick={() => setShow(item)}>
              <span class="tile-thumb">
                <Poster src={item.poster} icon="film" />
              </span>
              <span class="tile-info">
                <span class="row-title truncate">{item.title}</span>
                <span class="row-meta">
                  {item.episodes} episode{item.episodes === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div class="watch-pages">
        <Pagination label="Library pages" page={page} totalPages={totalPages} onPage={setPage} />
      </div>

      <Dialog open={movie !== null} onClose={() => setMovie(null)} title={movie?.title ?? ''} icon="film" size="lg">
        {movie && (
          <div class="watch-detail">
            {posterOf(movie) && <img src={posterOf(movie) ?? ''} alt="" />}
            <div class="stack">
              {movie.year && <span class="muted">{movie.year}</span>}
              <p>{movie.overview ?? 'No description yet.'}</p>
              <PlayButtons video={movie} onPlay={start} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={show !== null} onClose={() => setShow(null)} title={show?.title ?? ''} icon="monitor" size="lg">
        {show && (
          <div class="stack">
            {show.overview && <p>{show.overview}</p>}
            <ShowEpisodes show={show} onPlay={start} />
          </div>
        )}
      </Dialog>
    </>
  );
}
