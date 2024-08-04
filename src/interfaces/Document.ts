export default interface Document {
  thumbnail: string;
  view_url: string;
  download_url: string;
  type: 'doc' | 'docx' | 'txt' | 'log' | 'pdf';
  size: number; // size in bytes
}
