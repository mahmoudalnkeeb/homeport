import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ATTACHMENT_CATEGORIES,
  attachmentUrl,
  categoryOf,
  hasPermission,
  homeOf,
  isStreamable,
  kindOf,
  pathAccess,
  USERS_FOLDER,
  type Attachment,
  type AttachmentCategoryStats,
  type ToolSummary,
  type UploadFinishBody,
  type UploadStartBody,
  type UploadTicket,
} from '@homeport/contracts';
import { and, count, desc, eq, ilike, inArray, not, or, sql, type SQL } from 'drizzle-orm';

import { ActivityService } from '../../activity/activity.service.js';
import { Paginated, pageWindow } from '../../common/http/pagination.js';
import { InjectDb, type Database } from '../../database/database.js';
import { mediaStreams, type MediaStream } from '../../media/media.schema.js';
import { MediaService, toStreamInfo } from '../../media/media.service.js';
import { assertValidName, ATTACHMENTS_PREFIX, contentTypeOf, FILES_PREFIX } from '../../storage/storage.keys.js';
import { StorageService } from '../../storage/storage.service.js';
import { users, type Actor } from '../../users/users.schema.js';
import { formatBytes } from '../format.js';
import type { AttachmentQueryDto } from './attachments.dto.js';
import { attachments, type AttachmentRow } from './attachments.schema.js';

const TARGET = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(.+)$/;
const RECENT = 8;

const keyFor = (id: string, filename: string) => `${ATTACHMENTS_PREFIX}${categoryOf(filename)}/${id}/${filename}`;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
const pathOf = (key: string) => (key.startsWith(FILES_PREFIX) ? key.slice(FILES_PREFIX.length) : null);
const lastSegment = (key: string) => key.split('/').pop() ?? '';
const keyStartsWith = (prefix: string) => sql`starts_with(${attachments.key}, ${prefix})`;

function visibleTo(actor: Actor): SQL | undefined {
  if (actor.role === 'admin') return undefined;
  return or(not(keyStartsWith(`${FILES_PREFIX}${USERS_FOLDER}/`)), keyStartsWith(`${FILES_PREFIX}${homeOf(actor.username)}/`));
}

function parseTarget(target: string): { id: string; filename: string } {
  const match = TARGET.exec(target);
  if (!match?.[1] || !match[2]) throw new BadRequestException('Invalid upload target');
  assertValidName(match[2]);
  return { id: match[1], filename: match[2] };
}

function toAttachment(row: { attachment: AttachmentRow; owner: string | null; stream: MediaStream | null }): Attachment {
  const { attachment } = row;
  return {
    id: attachment.id,
    name: attachment.name,
    filename: attachment.filename,
    category: attachment.category,
    kind: kindOf(attachment.filename),
    contentType: contentTypeOf(attachment.filename),
    size: attachment.size,
    owner: row.owner,
    createdAt: attachment.createdAt.toISOString(),
    url: attachmentUrl(attachment.id),
    path: pathOf(attachment.key),
    stream: row.stream ? toStreamInfo(row.stream) : null,
  };
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly activity: ActivityService
  ) {}

  private query() {
    return this.db
      .select({ attachment: attachments, owner: users.username, stream: mediaStreams })
      .from(attachments)
      .leftJoin(users, eq(users.id, attachments.ownerId))
      .leftJoin(mediaStreams, eq(mediaStreams.sourceKey, attachments.key));
  }

  private async require(actor: Actor, id: string): Promise<AttachmentRow> {
    const [row] = await this.db.select().from(attachments).where(eq(attachments.id, id));
    const path = row ? pathOf(row.key) : null;
    if (!row || (path !== null && pathAccess(actor, path) === 'none')) throw new NotFoundException('Attachment not found');
    return row;
  }

  private assertCanManage(actor: Actor, row: AttachmentRow): void {
    if (actor.role !== 'admin' && row.ownerId !== actor.id) {
      throw new ForbiddenException('Only the owner or an admin can change this attachment');
    }
  }

  async list(actor: Actor, { category, q, mine, ...page }: AttachmentQueryDto): Promise<Paginated<Attachment>> {
    const conditions: SQL[] = [];
    if (category) conditions.push(eq(attachments.category, category));
    if (q) conditions.push(ilike(attachments.name, `%${escapeLike(q)}%`));
    if (mine) conditions.push(eq(attachments.ownerId, actor.id));
    const visible = visibleTo(actor);
    if (visible) conditions.push(visible);
    const where = conditions.length ? and(...conditions) : undefined;
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.query().where(where).orderBy(desc(attachments.createdAt), desc(attachments.id)).limit(window.pageSize).offset(offset),
      this.db.select({ value: count() }).from(attachments).where(where),
    ]);
    return Paginated.of(rows.map(toAttachment), window, total?.value ?? 0);
  }

  async get(actor: Actor, id: string): Promise<Attachment> {
    const [row] = await this.query().where(and(eq(attachments.id, id), visibleTo(actor)));
    if (!row) throw new NotFoundException('Attachment not found');
    return toAttachment(row);
  }

  async categories(actor: Actor): Promise<Paginated<AttachmentCategoryStats>> {
    const rows = await this.db
      .select({ category: attachments.category, count: count(), bytes: sql<string>`coalesce(sum(${attachments.size}), 0)` })
      .from(attachments)
      .where(visibleTo(actor))
      .groupBy(attachments.category);
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    return Paginated.all(
      ATTACHMENT_CATEGORIES.map((category) => ({
        category,
        count: byCategory.get(category)?.count ?? 0,
        bytes: Number(byCategory.get(category)?.bytes ?? 0),
      }))
    );
  }

  async object(actor: Actor, id: string): Promise<{ key: string; name: string }> {
    const row = await this.require(actor, id);
    return { key: row.key, name: row.filename };
  }

  async startUpload(host: string, { name, size }: UploadStartBody): Promise<UploadTicket> {
    assertValidName(name);
    const id = randomUUID();
    const contentType = contentTypeOf(name);
    return { target: `${id}/${name}`, contentType, ...(await this.storage.startUpload(host, keyFor(id, name), size, contentType)) };
  }

  async finishUpload(actor: Actor, { target, uploadId }: UploadFinishBody): Promise<Attachment> {
    const { id, filename } = parseTarget(target);
    const key = keyFor(id, filename);
    const object = await this.storage.finishUpload(key, uploadId);
    await this.db
      .insert(attachments)
      .values({ id, category: categoryOf(filename), name: filename, filename, key, size: object.size, ownerId: actor.id })
      .onConflictDoNothing();
    const kind = kindOf(filename);
    if (isStreamable(kind)) await this.media.enqueue(key, kind);
    await this.activity.record('attachments', 'upload', filename, actor.username);
    return this.get(actor, id);
  }

  async abortUpload({ target, uploadId }: UploadFinishBody): Promise<void> {
    const { id, filename } = parseTarget(target);
    await this.storage.abortUpload(keyFor(id, filename), uploadId);
  }

  async rename(actor: Actor, id: string, name: string): Promise<Attachment> {
    const row = await this.require(actor, id);
    this.assertCanManage(actor, row);
    await this.db.update(attachments).set({ name, updatedAt: new Date() }).where(eq(attachments.id, id));
    await this.activity.record('attachments', 'rename', `${row.name} → ${name}`, actor.username);
    return this.get(actor, id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const row = await this.require(actor, id);
    this.assertCanManage(actor, row);
    if (pathOf(row.key) !== null) throw new BadRequestException('This attachment lives in Files; delete it there');
    await this.storage.remove([row.key]);
    await this.media.forget([row.key]);
    await this.db.delete(attachments).where(eq(attachments.id, id));
    await this.activity.record('attachments', 'delete', row.name, actor.username);
  }

  async track(actor: Actor, key: string, size: number): Promise<void> {
    const filename = lastSegment(key);
    await this.db
      .insert(attachments)
      .values({ id: randomUUID(), category: categoryOf(filename), name: filename, filename, key, size, ownerId: actor.id })
      .onConflictDoUpdate({ target: attachments.key, set: { size, updatedAt: new Date() } });
  }

  async resize(key: string, size: number): Promise<void> {
    await this.db.update(attachments).set({ size, updatedAt: new Date() }).where(eq(attachments.key, key));
  }

  async move(from: string, to: string): Promise<void> {
    const filename = lastSegment(to);
    await this.db
      .update(attachments)
      .set({
        key: to,
        filename,
        category: categoryOf(filename),
        name: sql`case when ${attachments.name} = ${attachments.filename} then ${filename} else ${attachments.name} end`,
        updatedAt: new Date(),
      })
      .where(eq(attachments.key, from));
  }

  async movePrefix(from: string, to: string): Promise<void> {
    await this.db
      .update(attachments)
      .set({ key: sql`${to} || substr(${attachments.key}, ${from.length + 1})`, updatedAt: new Date() })
      .where(keyStartsWith(from));
  }

  async forget(keys: string[]): Promise<void> {
    if (keys.length) await this.db.delete(attachments).where(inArray(attachments.key, keys));
  }

  async forgetPrefix(prefix: string): Promise<void> {
    await this.db.delete(attachments).where(keyStartsWith(prefix));
  }

  async summary(actor: Actor): Promise<ToolSummary> {
    const mine = !hasPermission(actor.role, 'system:read');
    const [{ items: stats }, { items: recent }] = await Promise.all([
      this.categories(actor),
      this.list(actor, { mine, page: 1, pageSize: RECENT }),
    ]);
    const totalBytes = stats.reduce((sum, stat) => sum + stat.bytes, 0);
    const totalCount = stats.reduce((sum, stat) => sum + stat.count, 0);
    return {
      tiles: [
        { label: 'Attachments', value: totalCount.toLocaleString('en') },
        { label: 'Stored', value: formatBytes(totalBytes) },
      ],
      breakdown: stats
        .filter((stat) => stat.count > 0)
        .sort((a, b) => b.bytes - a.bytes)
        .map((stat) => ({ label: stat.category, value: stat.bytes, display: `${formatBytes(stat.bytes)} · ${stat.count}` })),
      recent: recent.map((attachment) => ({
        label: attachment.name,
        href: `/tools/attachments?open=${attachment.id}`,
        size: attachment.size,
        modified: attachment.createdAt,
      })),
    };
  }
}
