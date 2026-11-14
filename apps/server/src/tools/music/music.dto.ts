import type { Album, AlbumDetail, AlbumQuery, Artist, MusicTrack } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { ExposeNested } from '../../common/http/expose.js';
import { Trim } from '../../common/http/validation.js';
import { LibraryQueryDto } from '../library.dto.js';

export class AlbumQueryDto extends LibraryQueryDto implements AlbumQuery {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  artist?: string;
}

export class MusicTrackDto implements MusicTrack {
  @Expose() id!: string;
  @Expose() title!: string;
  @Expose() artist!: string;
  @Expose() albumId!: string;
  @Expose() album!: string;
  @Expose() trackNo!: number | null;
  @Expose() discNo!: number | null;
  @Expose() duration!: number | null;
  @Expose() url!: string;
  @Expose() cover!: string | null;
}

export class AlbumDto implements Album {
  @Expose() id!: string;
  @Expose() title!: string;
  @Expose() albumArtist!: string;
  @Expose() year!: number | null;
  @Expose() cover!: string | null;
  @Expose() tracks!: number;
}

export class AlbumDetailDto extends AlbumDto implements AlbumDetail {
  @ExposeNested(() => MusicTrackDto) trackList!: MusicTrack[];
}

export class ArtistDto implements Artist {
  @Expose() name!: string;
  @Expose() albums!: number;
  @Expose() cover!: string | null;
}
