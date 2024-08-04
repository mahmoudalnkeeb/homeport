export default interface Media {
  thumbnail: string;
  stream_url: string;
  download_url: string;
  length: {
    hours?: number;
    minutes: number;
    seconds: number;
  };
  type: 'mp3' | 'mp4';
  size: number; // size in bytes
}
