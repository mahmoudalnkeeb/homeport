import { BadRequestException } from '@nestjs/common';
import { extensionOf } from '@homeport/contracts';

export const FILES_PREFIX = 'files/';
export const ATTACHMENTS_PREFIX = 'attachments/';
export const STREAMS_PREFIX = 'streams/';

const INVALID_NAME = /[<>:"/\\|?*]/;
const hasControlChars = (name: string) => [...name].some((char) => char.charCodeAt(0) < 32);

export function assertValidName(name: string): void {
  if (!name || name === '.' || name === '..' || name.length > 255 || INVALID_NAME.test(name) || hasControlChars(name)) {
    throw new BadRequestException(`Invalid name: ${name}`);
  }
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  xml: 'application/xml',
  zip: 'application/zip',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed',
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
};

export const contentTypeOf = (name: string): string => CONTENT_TYPES[extensionOf(name)] ?? 'application/octet-stream';
