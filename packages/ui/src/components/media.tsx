import type Hls from 'hls.js';
import type { ComponentChildren, RefObject } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { formatClock } from '../format.js';
import { Icon, type IconName } from '../icons.js';
import { IconButton } from './controls.js';

export interface MediaPlayerProps {
  src: string;
  hls?: string | null | undefined;
  title: string;
  poster?: string | null | undefined;
  autoPlay?: boolean;
  compact?: boolean;
  onEnded?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  children?: ComponentChildren;
}

interface Quality {
  index: number;
  label: string;
}

interface Playback {
  playing: boolean;
  current: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  rate: number;
  waiting: boolean;
}

type MediaElement = HTMLVideoElement | HTMLAudioElement;

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VOLUME_KEY = 'lab-volume';
const IDLE_MS = 2500;
const MEDIA_EVENTS = [
  'play',
  'pause',
  'timeupdate',
  'durationchange',
  'progress',
  'volumechange',
  'ratechange',
  'waiting',
  'playing',
  'seeked',
  'loadedmetadata',
  'emptied',
  'canplay',
  'ended',
] as const;

function savedVolume(): number {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : 1;
  } catch {
    return 1;
  }
}

function bufferedEnd(media: MediaElement): number {
  for (let i = media.buffered.length - 1; i >= 0; i--) {
    if (media.buffered.start(i) <= media.currentTime) return media.buffered.end(i);
  }
  return 0;
}

function readPlayback(media: MediaElement): Playback {
  return {
    playing: !media.paused,
    current: media.currentTime,
    duration: Number.isFinite(media.duration) ? media.duration : 0,
    buffered: bufferedEnd(media),
    volume: media.volume,
    muted: media.muted,
    rate: media.playbackRate,
    waiting: !media.paused && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
  };
}

function usePlayback(ref: RefObject<MediaElement | null>): Playback {
  const [state, setState] = useState<Playback>({
    playing: false,
    current: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    muted: false,
    rate: 1,
    waiting: false,
  });
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    media.volume = savedVolume();
    const update = () => setState(readPlayback(media));
    for (const event of MEDIA_EVENTS) media.addEventListener(event, update);
    update();
    return () => {
      for (const event of MEDIA_EVENTS) media.removeEventListener(event, update);
    };
  }, [ref]);
  return state;
}

function qualityLabel(level: { height?: number; bitrate: number }, video: boolean): string {
  return video && level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`;
}

function useSource(ref: RefObject<MediaElement | null>, src: string, hlsUrl: string | null | undefined, video: boolean) {
  const engine = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQualityState] = useState(-1);
  const [active, setActive] = useState(-1);
  const [adaptive, setAdaptive] = useState(false);

  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    let cancelled = false;
    setQualities([]);
    setQualityState(-1);
    setActive(-1);
    setAdaptive(false);

    const progressive = () => {
      engine.current?.destroy();
      engine.current = null;
      setAdaptive(false);
      setQualities([]);
      media.src = src;
    };

    void (async () => {
      if (!hlsUrl) return progressive();
      const { default: HlsEngine } = await import('hls.js');
      if (cancelled) return;
      if (!HlsEngine.isSupported()) {
        if (media.canPlayType('application/vnd.apple.mpegurl')) {
          media.src = hlsUrl;
          setAdaptive(true);
          return;
        }
        return progressive();
      }
      const hls = new HlsEngine({ capLevelToPlayerSize: video, startLevel: -1 });
      engine.current = hls;
      setAdaptive(true);
      hls.on(HlsEngine.Events.MANIFEST_PARSED, (_event, data) =>
        setQualities(
          data.levels
            .map((level, index) => ({ index, label: qualityLabel(level, video), bitrate: level.bitrate }))
            .sort((a, b) => b.bitrate - a.bitrate)
            .map(({ index, label }) => ({ index, label }))
        )
      );
      hls.on(HlsEngine.Events.LEVEL_SWITCHED, (_event, data) => setActive(data.level));
      hls.on(HlsEngine.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsEngine.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
        const resumeAt = media.currentTime;
        progressive();
        media.addEventListener('loadedmetadata', () => (media.currentTime = resumeAt), { once: true });
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(media);
    })();

    return () => {
      cancelled = true;
      engine.current?.destroy();
      engine.current = null;
      media.removeAttribute('src');
      media.load();
    };
  }, [ref, src, hlsUrl, video]);

  const setQuality = useCallback((index: number) => {
    if (engine.current) engine.current.currentLevel = index;
    setQualityState(index);
  }, []);

  const activeLabel = qualities.find((item) => item.index === active)?.label;
  return { adaptive, qualities, quality, setQuality, activeLabel };
}

function useEnded(ref: RefObject<MediaElement | null>, onEnded: (() => void) | undefined) {
  const latest = useRef(onEnded);
  useEffect(() => {
    latest.current = onEnded;
  });
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    const handle = () => latest.current?.();
    media.addEventListener('ended', handle);
    return () => media.removeEventListener('ended', handle);
  }, [ref]);
}

function TrackButtons({ onPrevious, onNext }: Pick<MediaPlayerProps, 'onPrevious' | 'onNext'>) {
  return (
    <>
      {onPrevious && <ControlButton icon="track-prev" label="Previous (Shift+P)" onClick={onPrevious} />}
      {onNext && <ControlButton icon="track-next" label="Next (Shift+N)" onClick={onNext} />}
    </>
  );
}

function useMediaKeys(
  ref: RefObject<MediaElement | null>,
  {
    onFullscreen,
    onPrevious,
    onNext,
  }: { onFullscreen?: () => void; onPrevious?: (() => void) | undefined; onNext?: (() => void) | undefined }
) {
  return useCallback(
    (event: KeyboardEvent) => {
      const media = ref.current;
      if (!media || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLSelectElement) return;
      const seek = (delta: number) => (media.currentTime = Math.max(0, Math.min(media.duration || 0, media.currentTime + delta)));
      const actions: Record<string, () => void> = {
        ' ': () => void (media.paused ? media.play() : media.pause()),
        k: () => void (media.paused ? media.play() : media.pause()),
        ArrowLeft: () => seek(-5),
        ArrowRight: () => seek(5),
        j: () => seek(-10),
        l: () => seek(10),
        ArrowUp: () => (media.volume = Math.min(1, media.volume + 0.1)),
        ArrowDown: () => (media.volume = Math.max(0, media.volume - 0.1)),
        m: () => (media.muted = !media.muted),
        ...(onFullscreen ? { f: onFullscreen } : {}),
        ...(onPrevious ? { P: onPrevious } : {}),
        ...(onNext ? { N: onNext } : {}),
      };
      const action = actions[event.key];
      if (!action) return;
      if (event.target instanceof HTMLInputElement && event.key.startsWith('Arrow')) return;
      event.preventDefault();
      action();
    },
    [ref, onFullscreen, onPrevious, onNext]
  );
}

function ControlButton({ icon, label, onClick, pressed }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" class="media-btn" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

function SeekBar({ media, playback, title }: { media: RefObject<MediaElement | null>; playback: Playback; title: string }) {
  const { current, duration, buffered } = playback;
  const percent = (value: number) => (duration ? `${Math.min(100, (value / duration) * 100)}%` : '0%');
  return (
    <input
      type="range"
      class="media-seek"
      min={0}
      max={duration || 0}
      step="any"
      value={current}
      aria-label={`Seek ${title}`}
      aria-valuetext={`${formatClock(current)} of ${formatClock(duration)}`}
      style={{ '--played': percent(current), '--buffered': percent(buffered) }}
      onInput={(event) => {
        if (media.current) media.current.currentTime = Number(event.currentTarget.value);
      }}
    />
  );
}

function VolumeControl({ media, playback }: { media: RefObject<MediaElement | null>; playback: Playback }) {
  const silent = playback.muted || playback.volume === 0;
  return (
    <div class="media-volume">
      <ControlButton
        icon={silent ? 'volume-off' : 'volume'}
        label={silent ? 'Unmute (M)' : 'Mute (M)'}
        onClick={() => {
          if (!media.current) return;
          media.current.muted = !media.current.muted;
          if (!media.current.muted && media.current.volume === 0) media.current.volume = 0.5;
        }}
      />
      <input
        type="range"
        class="media-seek media-volume-range"
        min={0}
        max={1}
        step={0.05}
        value={playback.muted ? 0 : playback.volume}
        aria-label="Volume"
        style={{ '--played': `${(playback.muted ? 0 : playback.volume) * 100}%`, '--buffered': '0%' }}
        onInput={(event) => {
          const element = media.current;
          if (!element) return;
          element.volume = Number(event.currentTarget.value);
          element.muted = element.volume === 0;
          try {
            if (element.volume > 0) localStorage.setItem(VOLUME_KEY, String(element.volume));
          } catch {
            return;
          }
        }}
      />
    </div>
  );
}

function Settings({
  media,
  playback,
  source,
}: {
  media: RefObject<MediaElement | null>;
  playback: Playback;
  source: ReturnType<typeof useSource>;
}) {
  return (
    <>
      {source.qualities.length > 1 && (
        <label class="media-select" title="Quality">
          <span class="sr-only">Quality</span>
          <select value={source.quality} onChange={(event) => source.setQuality(Number(event.currentTarget.value))}>
            <option value={-1}>{source.quality === -1 && source.activeLabel ? `Auto · ${source.activeLabel}` : 'Auto'}</option>
            {source.qualities.map((item) => (
              <option key={item.index} value={item.index}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label class="media-select" title="Playback speed">
        <span class="sr-only">Playback speed</span>
        <select
          value={playback.rate}
          onChange={(event) => {
            if (media.current) media.current.playbackRate = Number(event.currentTarget.value);
          }}
        >
          {RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

const togglePlay = (media: MediaElement | null) => {
  if (!media) return;
  if (media.paused) void media.play().catch(() => undefined);
  else media.pause();
};

export function VideoPlayer({
  src,
  hls,
  title,
  poster,
  autoPlay = false,
  compact = false,
  onEnded,
  onPrevious,
  onNext,
  children,
}: MediaPlayerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const playback = usePlayback(video);
  const source = useSource(video, src, hls, true);
  useEnded(video, onEnded);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      clearTimeout(idleTimer.current);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = frame.current;
    const media: (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null = video.current;
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (element?.requestFullscreen) return void element.requestFullscreen().catch(() => undefined);
    media?.webkitEnterFullscreen?.();
  }, []);

  const onKeyDown = useMediaKeys(video, { onFullscreen: toggleFullscreen, onPrevious, onNext });
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled;

  return (
    <div
      ref={frame}
      class={`media-player media-video${compact ? ' is-compact' : ''}${idle && playback.playing ? ' is-idle' : ''}`}
      tabIndex={0}
      aria-label={`Video player: ${title}`}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <video
        ref={video}
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        poster={poster ?? undefined}
        onClick={() => togglePlay(video.current)}
        onDblClick={toggleFullscreen}
      />
      {playback.waiting && (
        <span class="media-spinner" role="status" aria-label="Buffering">
          <Icon name="loader" size="lg" />
        </span>
      )}
      {!playback.playing && !playback.waiting && (
        <button type="button" class="media-bigplay" aria-label={`Play ${title}`} onClick={() => togglePlay(video.current)}>
          <Icon name="play" size="lg" />
        </button>
      )}
      <div class="media-chrome">
        <SeekBar media={video} playback={playback} title={title} />
        <div class="media-bar">
          <ControlButton
            icon={playback.playing ? 'pause' : 'play'}
            label={playback.playing ? 'Pause (K)' : 'Play (K)'}
            onClick={() => togglePlay(video.current)}
          />
          <TrackButtons onPrevious={onPrevious} onNext={onNext} />
          {!compact && (
            <>
              <ControlButton
                icon="skip-back"
                label="Back 10 seconds (J)"
                onClick={() => video.current && (video.current.currentTime -= 10)}
              />
              <ControlButton
                icon="skip-forward"
                label="Forward 10 seconds (L)"
                onClick={() => video.current && (video.current.currentTime += 10)}
              />
              <VolumeControl media={video} playback={playback} />
            </>
          )}
          <span class="media-time mono">
            {formatClock(playback.current)} / {formatClock(playback.duration)}
          </span>
          <span class="media-spacer" />
          {!compact && source.adaptive && <span class="media-badge">HLS</span>}
          {children}
          {!compact && <Settings media={video} playback={playback} source={source} />}
          {!compact && canPip && (
            <ControlButton
              icon="pip"
              label="Picture in picture"
              onClick={() => {
                if (document.pictureInPictureElement) void document.exitPictureInPicture();
                else void video.current?.requestPictureInPicture().catch(() => undefined);
              }}
            />
          )}
          {!compact && (
            <ControlButton
              icon={fullscreen ? 'minimize' : 'maximize'}
              label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
              onClick={toggleFullscreen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function AudioPlayer({
  src,
  hls,
  title,
  poster,
  autoPlay = false,
  compact = false,
  onEnded,
  onPrevious,
  onNext,
  children,
}: MediaPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const playback = usePlayback(audio);
  const source = useSource(audio, src, hls, false);
  const onKeyDown = useMediaKeys(audio, { onPrevious, onNext });
  useEnded(audio, onEnded);

  return (
    <div
      class={`media-player media-audio${compact ? ' is-compact' : ''}`}
      tabIndex={0}
      aria-label={`Audio player: ${title}`}
      onKeyDown={onKeyDown}
    >
      <audio ref={audio} preload="metadata" autoPlay={autoPlay} />
      <div class="media-audio-head">
        <button
          type="button"
          class="media-audio-play"
          aria-label={playback.playing ? `Pause ${title}` : `Play ${title}`}
          onClick={() => togglePlay(audio.current)}
        >
          <Icon name={playback.waiting ? 'loader' : playback.playing ? 'pause' : 'play'} size="lg" class={playback.waiting ? 'spin' : ''} />
        </button>
        <div class="media-audio-title">
          {poster ? <img src={poster} alt="" /> : null}
          <strong class="truncate">{title}</strong>
          <span class="media-time mono">
            {formatClock(playback.current)} / {formatClock(playback.duration)}
            {!compact && source.adaptive && <span class="media-badge">HLS</span>}
          </span>
        </div>
        {compact && <TrackButtons onPrevious={onPrevious} onNext={onNext} />}
      </div>
      <SeekBar media={audio} playback={playback} title={title} />
      {!compact && (
        <div class="media-bar">
          {onPrevious && <ControlButton icon="track-prev" label="Previous (Shift+P)" onClick={onPrevious} />}
          <ControlButton icon="skip-back" label="Back 10 seconds (J)" onClick={() => audio.current && (audio.current.currentTime -= 10)} />
          <ControlButton
            icon="skip-forward"
            label="Forward 10 seconds (L)"
            onClick={() => audio.current && (audio.current.currentTime += 10)}
          />
          {onNext && <ControlButton icon="track-next" label="Next (Shift+N)" onClick={onNext} />}
          <VolumeControl media={audio} playback={playback} />
          <span class="media-spacer" />
          {children}
          <Settings media={audio} playback={playback} source={source} />
        </div>
      )}
    </div>
  );
}

export interface DockTrack {
  id: string;
  kind: 'video' | 'audio';
  title: string;
  src: string;
  hls?: string | null | undefined;
  poster?: string | null | undefined;
}

export interface MediaDockProps {
  tracks: DockTrack[];
  index: number;
  minimized: boolean;
  onSelect: (index: number) => void;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
  actions?: ComponentChildren;
  children?: ComponentChildren;
}

const TRACK_ICON = { video: 'film', audio: 'music' } as const;

function useMediaSession(track: DockTrack | undefined, onPrevious: (() => void) | undefined, onNext: (() => void) | undefined) {
  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: track.title, artwork: track.poster ? [{ src: track.poster }] : [] });
    session.setActionHandler('previoustrack', onPrevious ?? null);
    session.setActionHandler('nexttrack', onNext ?? null);
    return () => {
      session.metadata = null;
      session.setActionHandler('previoustrack', null);
      session.setActionHandler('nexttrack', null);
    };
  }, [track, onPrevious, onNext]);
}

export function MediaDock({ tracks, index, minimized, onSelect, onMinimize, onExpand, onClose, actions, children }: MediaDockProps) {
  const panel = useRef<HTMLElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const [showList, setShowList] = useState(true);
  const track = tracks[index];
  const queued = tracks.length > 1;
  const onPrevious = index > 0 ? () => onSelect(index - 1) : undefined;
  const onNext = index < tracks.length - 1 ? () => onSelect(index + 1) : undefined;
  useMediaSession(track, onPrevious, onNext);

  useEffect(() => {
    if (!minimized) panel.current?.focus();
  }, [minimized]);

  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' });
  }, [index, minimized, showList]);

  if (!track) return null;

  const player = {
    src: track.src,
    hls: track.hls,
    title: track.title,
    poster: track.poster,
    autoPlay: true,
    compact: minimized,
    onEnded: onNext,
    onPrevious,
    onNext,
  };

  return (
    <>
      {!minimized && <div class="dock-backdrop" aria-hidden="true" onClick={onMinimize} />}
      <section
        ref={panel}
        class={`dock ${minimized ? 'is-minimized' : 'is-expanded'}`}
        role={minimized ? 'region' : 'dialog'}
        aria-modal={minimized ? undefined : true}
        aria-label={`Now playing: ${track.title}`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || minimized) return;
          event.preventDefault();
          onMinimize();
        }}
      >
        <header class="dock-head">
          <Icon name={TRACK_ICON[track.kind]} />
          <div class="dock-title">
            <strong class="truncate">{track.title}</strong>
            {queued && (
              <span class="mono">
                {index + 1} of {tracks.length}
              </span>
            )}
          </div>
          {!minimized && actions}
          {!minimized && queued && (
            <IconButton
              size="sm"
              icon="list-music"
              label={showList ? 'Hide playlist' : 'Show playlist'}
              aria-pressed={showList}
              onClick={() => setShowList((value) => !value)}
            />
          )}
          <IconButton
            size="sm"
            icon={minimized ? 'expand' : 'shrink'}
            label={minimized ? 'Expand player' : 'Minimize player (Esc)'}
            onClick={minimized ? onExpand : onMinimize}
          />
          <IconButton size="sm" icon="x" label="Close player" onClick={onClose} />
        </header>
        <div class="dock-main">
          <div class="dock-stage">
            {track.kind === 'video' ? <VideoPlayer key={track.id} {...player} /> : <AudioPlayer key={track.id} {...player} />}
            {!minimized && children}
          </div>
          {!minimized && queued && showList && (
            <ol class="dock-list" aria-label="Playlist">
              {tracks.map((item, i) => (
                <li key={item.id}>
                  <button
                    ref={i === index ? current : null}
                    type="button"
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => onSelect(i)}
                  >
                    <span class="dock-list-index mono">{i === index ? <Icon name="play" /> : i + 1}</span>
                    <Icon name={TRACK_ICON[item.kind]} />
                    <span class="truncate">{item.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
