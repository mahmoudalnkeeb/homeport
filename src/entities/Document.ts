export type DocumentExt = 'doc' | 'docx' | 'txt' | 'log' | 'pdf';

export interface Document {
  thumbnail: string;
  view_url: string;
  download_url: string;
  ext: DocumentExt;
  size: number; // size in bytes
}

export default class DocumentEntity implements Document {
  thumbnail: string;
  view_url: string;
  download_url: string;
  ext: DocumentExt;
  size: number;

  constructor(
    thumbnail: string,
    view_url: string,
    download_url: string,
    ext: DocumentExt,
    size: number
  ) {
    this.thumbnail = thumbnail;
    this.view_url = view_url;
    this.download_url = download_url;
    this.ext = ext;
    this.size = size;
  }

  // Optionally, if you have logic to calculate size, include these methods
  private calculateSize(): number {
    // Implement the actual size calculation logic here
    return 0;
  }
}
