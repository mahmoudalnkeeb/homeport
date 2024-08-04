export default interface Image {
  thumbnail: string;
  view_url: string;
  download_url: string;
  dimensions: {
    width: number;
    height: number;
  };
  size: number; // size in bytes
}
