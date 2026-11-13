import { pipeline } from 'node:stream/promises';

import { extensionOf, kindOf, type FileKind } from '@homeport/contracts';
import type { NodeResponse } from '@nestjs/platform-node';

import { contentTypeOf } from './storage.keys.js';
import type { StorageService } from './storage.service.js';

const ACTIVE_CONTENT = new Set(['html', 'htm', 'svg', 'xml', 'xhtml']);
const PROXIED_KINDS = new Set<FileKind>(['markdown', 'text']);

export async function serveObject(
  storage: StorageService,
  res: NodeResponse,
  { host, key, name, download }: { host: string; key: string; name: string; download: boolean }
): Promise<void> {
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`;
  const contentType = contentTypeOf(name);
  const active = ACTIVE_CONTENT.has(extensionOf(name));
  if (download || (!active && !PROXIED_KINDS.has(kindOf(name)))) {
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.redirect(302, await storage.signedUrl(host, key, { contentType, disposition }));
    return;
  }
  const { body, size } = await storage.read(key);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', size);
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache');
  if (active) res.setHeader('Content-Security-Policy', 'sandbox');
  await pipeline(body, res);
}
