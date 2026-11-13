import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { UploadTicket } from '@homeport/contracts';

import { StorageService, type StoredObject, type UploadPlan } from '../src/storage/storage.service.js';
import { testEnv } from './support.js';

const UPLOAD_URL = 'memory-upload://';

export class MemoryStorage extends StorageService {
  readonly objects = new Map<string, { body: Buffer; modified: Date }>();

  constructor() {
    super(testEnv());
  }

  override async onModuleInit(): Promise<void> {}

  override async head(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return object ? { key, size: object.body.length, modified: object.modified } : null;
  }

  override async list(prefix: string): Promise<StoredObject[]> {
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .flatMap((key) => {
        const object = this.objects.get(key);
        return object ? [{ key, size: object.body.length, modified: object.modified }] : [];
      });
  }

  override async any(prefix: string): Promise<boolean> {
    return [...this.objects.keys()].some((key) => key.startsWith(prefix));
  }

  override async put(key: string, body: string | Buffer): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), modified: new Date() });
  }

  override async putFile(key: string, path: string): Promise<void> {
    await this.put(key, await readFile(path));
  }

  override async read(key: string): Promise<{ body: Readable; size: number }> {
    const object = this.objects.get(key);
    if (!object) throw new NotFoundException('Not found');
    return { body: Readable.from([object.body]), size: object.body.length };
  }

  override async copy(from: StoredObject, to: string): Promise<void> {
    const object = this.objects.get(from.key);
    if (!object) throw new NotFoundException('Not found');
    this.objects.set(to, { ...object });
  }

  override async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }

  override async signedUrl(host: string, key: string, { disposition }: { contentType: string; disposition: string }): Promise<string> {
    return `${this.publicEndpointFor(host)}/${encodeURI(key)}?disposition=${encodeURIComponent(disposition)}`;
  }

  override async startUpload(_host: string, key: string, size: number): Promise<UploadPlan> {
    return { uploadId: null, partSize: Math.max(size, 1), partUrls: [`${UPLOAD_URL}${key}`] };
  }

  override async finishUpload(key: string): Promise<StoredObject> {
    const object = await this.head(key);
    if (!object) throw new BadRequestException('Upload not found or not finished');
    return object;
  }

  override async abortUpload(): Promise<void> {}

  async upload(ticket: UploadTicket, body: string | Buffer): Promise<void> {
    const [url] = ticket.partUrls;
    if (!url?.startsWith(UPLOAD_URL)) throw new Error('Not a memory upload ticket');
    await this.put(url.slice(UPLOAD_URL.length), body);
  }
}
