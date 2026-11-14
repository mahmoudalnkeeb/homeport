export type ParsedVideo =
  | { kind: 'movie'; title: string; year: number | null }
  | { kind: 'episode'; folder: string; show: string; title: string | null; year: number | null; season: number; episode: number };

const EXTENSION = /\.[a-z0-9]{2,4}$/i;
const TITLE_YEAR = /^(.*?)[\s._([-]+((?:19|20)\d{2})(?!\d)/;
const EPISODE = /(?:^|[\s._-])s(\d{1,2})[\s._-]?e(\d{1,3})(?!\d)|(?:^|[\s._-])(\d{1,2})x(\d{2,3})(?!\d)/i;
const SEASON_FOLDER = /^(?:season|series|s)[\s._-]*(\d{1,2})$/i;

const clean = (value: string) =>
  value
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s([-]+$/, '')
    .trim();

export function splitTitle(name: string): { title: string; year: number | null } {
  const bare = name.replace(EXTENSION, '');
  const match = TITLE_YEAR.exec(bare);
  if (!match?.[1]) return { title: clean(bare), year: null };
  return { title: clean(match[1]), year: Number(match[2]) };
}

export function parseMoviePath(rel: string): ParsedVideo {
  const [first = rel] = rel.split('/').filter(Boolean);
  return { kind: 'movie', ...splitTitle(first) };
}

export function parseEpisodePath(rel: string): ParsedVideo | null {
  const parts = rel.split('/').filter(Boolean);
  const file = parts.at(-1) ?? '';
  const folder = parts.length > 1 ? parts[0] : undefined;
  const match = EPISODE.exec(file.replace(EXTENSION, ''));
  const seasonFolder = parts.length > 2 ? SEASON_FOLDER.exec(parts[parts.length - 2] ?? '') : null;
  if (!match && !seasonFolder) return null;

  const season = Number(match?.[1] ?? match?.[3] ?? seasonFolder?.[1]);
  const episode = Number(match?.[2] ?? match?.[4] ?? /(?:^|\D)(\d{1,3})(?!\d)/.exec(file)?.[1]);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;

  const showSource = folder ?? file.slice(0, match?.index ?? 0);
  const { title: show, year } = splitTitle(showSource);
  if (!show) return null;
  const rest = match ? clean(file.replace(EXTENSION, '').slice((match.index ?? 0) + match[0].length).replace(/^[\s._-]+/, '')) : '';
  return { kind: 'episode', folder: folder ?? show, show, year, season, episode, title: rest || null };
}
