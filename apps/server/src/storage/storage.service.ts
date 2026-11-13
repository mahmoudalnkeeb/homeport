import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  UploadPartCopyCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';

import { AppError } from '../common/http/app-error.js';
import { ENV, type Environment } from '../config/env.js';

export interface StoredObject {
  key: string;
  size: number;
  modified: Date;
}

export interface UploadPlan {
  uploadId: string | null;
  partSize: number;
  partUrls: string[];
}

const MiB = 1024 * 1024;
const MIN_PART = 16 * MiB;
const MAX_PARTS = 10_000;
const COPY_PART = 1024 * MiB;
const SINGLE_COPY_LIMIT = 5 * 1024 * MiB;
const UPLOAD_URL_TTL = 12 * 3600;
const READ_URL_TTL = 2 * 3600;
const HOUR_MS = 3_600_000;

export function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
  const metadata = error.$metadata;
  return typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata && typeof metadata.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : undefined;
}

const copySource = (bucket: string, key: string) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly signers = new Map<string, S3Client>();
  private readonly signerConfig: { region: string; credentials: { accessKeyId: string; secretAccessKey: string }; forcePathStyle: boolean };
  private readonly publicEndpoint: string | undefined;
  private readonly publicPort: number;
  private readonly bucket: string;
  readonly maxUploadBytes: number;

  constructor(@Inject(ENV) env: Environment) {
    const base = {
      region: env.S3_REGION,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      forcePathStyle: true,
    };
    this.client = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
    this.signerConfig = base;
    this.publicEndpoint = env.S3_PUBLIC_ENDPOINT;
    this.publicPort = env.S3_PUBLIC_PORT;
    this.bucket = env.S3_BUCKET;
    this.maxUploadBytes = env.MAX_UPLOAD_MB * MiB;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (statusOf(error) !== 404) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log({ event: 'storage.bucket_created', bucket: this.bucket });
    }
    await this.client
      .send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucket,
          LifecycleConfiguration: {
            Rules: [{ ID: 'abort-stale-uploads', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }],
          },
        })
      )
      .catch((error: unknown) =>
        this.logger.warn({ event: 'storage.lifecycle_skipped', reason: error instanceof Error ? error.name : 'unknown' })
      );
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { key, size: head.ContentLength ?? 0, modified: head.LastModified ?? new Date(0) };
    } catch (error) {
      if (statusOf(error) === 404) return null;
      throw error;
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const item of page.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0, modified: item.LastModified ?? new Date(0) });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  async any(prefix: string): Promise<boolean> {
    const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1 }));
    return (page.KeyCount ?? 0) > 0;
  }

  async put(key: string, body: string | Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async putFile(key: string, path: string, contentType: string): Promise<void> {
    const { size } = await stat(path);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType })
    );
  }

  async read(key: string): Promise<{ body: Readable; size: number }> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!(object.Body instanceof Readable)) throw new Error(`Unexpected body for ${key}`);
      return { body: object.Body, size: object.ContentLength ?? 0 };
    } catch (error) {
      if (statusOf(error) === 404) throw new NotFoundException('Not found');
      throw error;
    }
  }

  async readText(key: string): Promise<string> {
    const { body } = await this.read(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return Buffer.concat(chunks).toString('utf8');
  }

  async download(key: string, path: string): Promise<void> {
    const { body } = await this.read(key);
    await pipeline(body, createWriteStream(path));
  }

  async copy(from: StoredObject, to: string): Promise<void> {
    const source = copySource(this.bucket, from.key);
    if (from.size <= SINGLE_COPY_LIMIT) {
      await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: to, CopySource: source }));
      return;
    }
    const { UploadId } = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: to }));
    try {
      const parts: CompletedPart[] = [];
      for (let start = 0, number = 1; start < from.size; start += COPY_PART, number++) {
        const end = Math.min(start + COPY_PART, from.size) - 1;
        const part = await this.client.send(
          new UploadPartCopyCommand({
            Bucket: this.bucket,
            Key: to,
            UploadId,
            PartNumber: number,
            CopySource: source,
            CopySourceRange: `bytes=${start}-${end}`,
          })
        );
        parts.push({ PartNumber: number, ETag: part.CopyPartResult?.ETag });
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: to, UploadId, MultipartUpload: { Parts: parts } })
      );
    } catch (error) {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: to, UploadId })).catch(() => undefined);
      throw error;
    }
  }

  async move(from: StoredObject, to: string): Promise<void> {
    await this.copy(from, to);
    await this.remove([from.key]);
  }

  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } })
      );
    }
  }

  async removePrefix(prefix: string): Promise<void> {
    await this.remove((await this.list(prefix)).map((object) => object.key));
  }

  publicEndpointFor(host: string): string {
    if (this.publicEndpoint) return this.publicEndpoint;
    const url = new URL('http://localhost');
    url.hostname = host;
    url.port = String(this.publicPort);
    return url.origin;
  }

  private signerFor(host: string): S3Client {
    const endpoint = this.publicEndpointFor(host);
    let signer = this.signers.get(endpoint);
    if (!signer) {
      signer = new S3Client({ ...this.signerConfig, endpoint });
      this.signers.set(endpoint, signer);
    }
    return signer;
  }

  signedUrl(host: string, key: string, { contentType, disposition }: { contentType: string; disposition: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: disposition,
    });
    const signingDate = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
    return getSignedUrl(this.signerFor(host), command, { expiresIn: READ_URL_TTL, signingDate });
  }

  async startUpload(host: string, key: string, size: number, contentType: string): Promise<UploadPlan> {
    if (size > this.maxUploadBytes) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Files are limited to ${Math.round(this.maxUploadBytes / MiB)} MB`);
    }
    const signer = this.signerFor(host);
    if (size < MIN_PART) {
      const url = await getSignedUrl(signer, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), {
        expiresIn: UPLOAD_URL_TTL,
      });
      return { uploadId: null, partSize: Math.max(size, 1), partUrls: [url] };
    }
    const partSize = Math.max(MIN_PART, Math.ceil(size / MAX_PARTS / MiB) * MiB);
    const { UploadId } = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!UploadId) throw new Error('Storage returned no upload id');
    const partUrls = await Promise.all(
      Array.from({ length: Math.ceil(size / partSize) }, (_, i) =>
        getSignedUrl(signer, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId, PartNumber: i + 1 }), {
          expiresIn: UPLOAD_URL_TTL,
        })
      )
    );
    return { uploadId: UploadId, partSize, partUrls };
  }

  async finishUpload(key: string, uploadId: string | undefined): Promise<StoredObject> {
    if (uploadId) await this.completeMultipart(key, uploadId);
    const object = await this.head(key);
    if (!object) throw new BadRequestException('Upload not found or not finished');
    if (object.size > this.maxUploadBytes) {
      await this.remove([key]);
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Files are limited to ${Math.round(this.maxUploadBytes / MiB)} MB`);
    }
    return object;
  }

  async abortUpload(key: string, uploadId: string | undefined): Promise<void> {
    if (!uploadId) return;
    try {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
    } catch (error) {
      if (statusOf(error) !== 404) throw error;
    }
  }

  private async completeMultipart(key: string, uploadId: string): Promise<void> {
    const parts: CompletedPart[] = [];
    let marker: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker })
        );
        for (const part of page.Parts ?? []) parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      } while (marker);
    } catch (error) {
      if (statusOf(error) === 404) throw new BadRequestException('Upload not found or already finished');
      throw error;
    }
    if (!parts.length) throw new BadRequestException('No data was uploaded');
    await this.client.send(
      new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } })
    );
  }
}
