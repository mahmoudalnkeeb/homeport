import type { StreamInfo, StreamStatus } from '@homeport/contracts';
import { LinkButton, MediaDock, Notice, type DockTrack } from '@homeport/ui';
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useMemo, useState } from 'preact/hooks';

const STREAM_LABELS: Record<StreamStatus, string> = {
  pending: 'queued for streaming',
  processing: 'preparing stream',
  ready: 'adaptive',
  failed: 'stream failed',
};

export const streamLabel = (stream: StreamInfo): string => STREAM_LABELS[stream.status];

export interface Track {
  id: string;
  kind: 'video' | 'audio';
  title: string;
  src: string;
  download: string;
  stream: StreamInfo | null | undefined;
  poster?: string | null;
  startAt?: number;
  onProgress?: (position: number, duration: number) => void;
}

interface Queue {
  tracks: Track[];
  index: number;
  minimized: boolean;
}

type Play = (tracks: Track[], index: number) => void;
type Append = (tracks: Track[]) => void;

const PlayerContext = createContext<{ play: Play; append: Append }>({ play: () => undefined, append: () => undefined });

export const usePlayer = (): Play => useContext(PlayerContext).play;
export const useAppend = (): Append => useContext(PlayerContext).append;

const toDockTrack = (track: Track): DockTrack => ({
  id: track.id,
  kind: track.kind,
  title: track.title,
  src: track.src,
  hls: track.stream?.status === 'ready' ? track.stream.playlist : null,
  poster: track.poster ?? track.stream?.poster ?? null,
  startAt: track.startAt,
  onProgress: track.onProgress,
});

function StreamNotice({ stream }: { stream: StreamInfo | null | undefined }) {
  if (stream?.status === 'failed') {
    return (
      <Notice tone="warning" title="Adaptive stream unavailable">
        Transcoding failed, so this plays the original file. Re-upload it to try again.
      </Notice>
    );
  }
  if (!stream || stream.status === 'ready') return null;
  return (
    <Notice title="Preparing adaptive stream">
      Playing the original file for now. Quality switching is available once transcoding finishes.
    </Notice>
  );
}

export function PlayerProvider({ children }: { children: ComponentChildren }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const play = useCallback<Play>((tracks, index) => setQueue({ tracks, index, minimized: false }), []);
  const append = useCallback<Append>(
    (tracks) => setQueue((current) => (current ? { ...current, tracks: [...current.tracks, ...tracks] } : { tracks, index: 0, minimized: true })),
    []
  );
  const actions = useMemo(() => ({ play, append }), [play, append]);
  const dockTracks = useMemo(() => queue?.tracks.map(toDockTrack) ?? [], [queue?.tracks]);
  const update = (patch: Partial<Queue>) => setQueue((current) => (current ? { ...current, ...patch } : current));
  const track = queue?.tracks[queue.index];

  return (
    <PlayerContext.Provider value={actions}>
      {children}
      {queue && track && (
        <MediaDock
          tracks={dockTracks}
          index={queue.index}
          minimized={queue.minimized}
          onSelect={(index) => update({ index })}
          onMinimize={() => update({ minimized: true })}
          onExpand={() => update({ minimized: false })}
          onClose={() => setQueue(null)}
          actions={
            <LinkButton size="sm" icon="download" href={track.download} download>
              <span class="btn-label">Download</span>
            </LinkButton>
          }
        >
          <StreamNotice stream={track.stream} />
        </MediaDock>
      )}
    </PlayerContext.Provider>
  );
}
