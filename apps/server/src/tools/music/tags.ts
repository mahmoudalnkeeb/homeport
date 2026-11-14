export interface TrackInfo {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
}

export const UNKNOWN_ARTIST = 'Unknown artist';
export const UNKNOWN_ALBUM = 'Unknown album';

const EXTENSION = /\.[a-z0-9]{2,4}$/i;
const NUMBERED = /^(\d{1,3})[\s.\-_]+(.+)$/;

const leadingNumber = (value: string | undefined) => {
  const match = value ? /^\s*(\d{1,3})/.exec(value) : null;
  return match ? Number(match[1]) : null;
};

const yearOf = (value: string | undefined) => {
  const match = value ? /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(value) : null;
  return match ? Number(match[1]) : null;
};

const first = (...values: (string | undefined)[]) => values.find((value) => value !== undefined && value.trim() !== '')?.trim();

export function trackInfo(rel: string, tags: Record<string, string>): TrackInfo {
  const parts = rel.split('/').filter(Boolean);
  const file = (parts.at(-1) ?? rel).replace(EXTENSION, '');
  const numbered = NUMBERED.exec(file);
  const folderAlbum = parts.length >= 2 ? parts.at(-2) : undefined;
  const folderArtist = parts.length >= 3 ? parts.at(-3) : undefined;

  const artist = first(tags.artist, tags.album_artist, tags.albumartist, folderArtist) ?? UNKNOWN_ARTIST;
  return {
    title: first(tags.title, numbered?.[2], file) ?? file,
    artist,
    albumArtist: first(tags.album_artist, tags.albumartist, tags['album artist'], folderArtist, artist) ?? UNKNOWN_ARTIST,
    album: first(tags.album, folderAlbum) ?? UNKNOWN_ALBUM,
    trackNo: leadingNumber(tags.track) ?? (numbered ? Number(numbered[1]) : null),
    discNo: leadingNumber(tags.disc),
    year: yearOf(first(tags.date, tags.year, tags.originaldate)),
  };
}
