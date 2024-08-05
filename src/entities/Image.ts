export interface Image {
  thumbnail: string;
  view_url: string;
  download_url: string;
  dimensions: {
    width: number;
    height: number;
  };
  size: number; // size in bytes
}

export default class ImageEntity implements Image {
  thumbnail: string;
  view_url: string;
  download_url: string;
  dimensions: {
    width: number;
    height: number;
  };
  size: number;

  constructor(
    thumbnail: string,
    view_url: string,
    download_url: string,
    width: number,
    height: number,
    size: number
  ) {
    this.thumbnail = thumbnail;
    this.view_url = view_url;
    this.download_url = download_url;
    this.dimensions = { width, height };
    this.size = size;
  }

  // Optionally, if you have logic to calculate size or dimensions, include these methods
  private calculateDimensions(): { width: number; height: number } {
    // Implement the actual dimensions calculation logic here
    return { width: 0, height: 0 };
  }

  private calculateSize(): number {
    // Implement the actual size calculation logic here
    return 0;
  }
}
