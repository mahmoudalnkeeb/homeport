export type MediaExtension = 'mp3' | 'mp4';

export interface Media {
  thumbnail: string;
  stream_url: string;
  download_url: string;
  duration: number; // duration in seconds
  ext: MediaExtension;
  size: number; // size in bytes
}

export default class MediaEntity implements Media {
  thumbnail: string;
  stream_url: string;
  download_url: string;
  duration: number;
  ext: MediaExtension;
  size: number;
  constructor(
    thumbnail: string,
    stream_url: string,
    download_url: string,
    ext: MediaExtension
  ) {
    this.thumbnail = thumbnail;
    this.stream_url = stream_url;
    this.download_url = download_url;
    this.ext = ext;
    this.duration = this.calculateDuration();
    this.size = this.calculateSize();
  }

  private calculateDuration() {
    return 0;
  }

  private calculateSize() {
    return 0;
  }
}
