import { extname } from 'node:path';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';

import { formatBytes } from '../format.js';
import type { ToolSummary } from '../tool.js';
import { FilesService } from './files.service.js';

const path = z.string().trim().max(1024);
const pathQuery = z.object({ path: path.default('') });
const rawQuery = pathQuery.extend({ download: z.stringbool().default(false) });
const writeTextBody = z.object({ path: path.min(1), content: z.string().max(10 * 1024 * 1024) });
const folderBody = z.object({ path: path.min(1) });
const renameBody = z.object({ path: path.min(1), name: z.string().trim().min(1).max(255) });

// Formats that can run script when opened directly; sandbox them so stored files cannot act as this origin.
const ACTIVE_CONTENT = new Set(['.html', '.htm', '.svg', '.xml', '.xhtml']);

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  list(@Query({ schema: pathQuery }) query: z.infer<typeof pathQuery>) {
    return this.files.list(query.path);
  }

  @Get('raw')
  async raw(@Query({ schema: rawQuery }) query: z.infer<typeof rawQuery>, @Res() res: Response) {
    const { absolute, name } = await this.files.file(query.path);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ACTIVE_CONTENT.has(extname(name).toLowerCase())) {
      res.setHeader('Content-Security-Policy', 'sandbox');
    }
    const done = (error?: Error) => {
      // Media players routinely abort range requests; only report failures nothing has been sent for.
      if (error && !res.headersSent) res.status(500).end();
    };
    if (query.download) {
      res.download(absolute, name, { dotfiles: 'allow' }, done);
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.sendFile(absolute, { dotfiles: 'allow' }, done);
  }

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 100))
  upload(
    @Query({ schema: pathQuery }) query: z.infer<typeof pathQuery>,
    @UploadedFiles() files: { originalname: string; path: string }[] | undefined
  ) {
    return this.files.upload(query.path, files ?? []);
  }

  @Put('text')
  writeText(@Body({ schema: writeTextBody }) body: z.infer<typeof writeTextBody>) {
    return this.files.writeText(body.path, body.content);
  }

  @Post('folder')
  @HttpCode(204)
  createFolder(@Body({ schema: folderBody }) body: z.infer<typeof folderBody>) {
    return this.files.createFolder(body.path);
  }

  @Post('rename')
  async rename(@Body({ schema: renameBody }) body: z.infer<typeof renameBody>) {
    return { path: await this.files.rename(body.path, body.name) };
  }

  @Delete()
  @HttpCode(204)
  remove(@Query({ schema: folderBody }) query: z.infer<typeof folderBody>) {
    return this.files.remove(query.path);
  }

  @Get('summary')
  async summary(): Promise<ToolSummary> {
    const stats = await this.files.stats();
    return {
      tiles: [
        { label: 'Stored', value: formatBytes(stats.totalBytes) },
        { label: 'Files', value: stats.files.toLocaleString('en') },
        { label: 'Folders', value: stats.folders.toLocaleString('en') },
      ],
      breakdown: stats.byKind.map(({ kind, bytes, count }) => ({
        label: kind,
        value: bytes,
        display: `${formatBytes(bytes)} · ${count}`,
      })),
      recent: stats.recent.map((file) => ({
        label: file.name,
        href: `/tools/files/?path=${encodeURIComponent(file.path.split('/').slice(0, -1).join('/'))}&open=${encodeURIComponent(file.path)}`,
        meta: `${formatBytes(file.size)} · ${file.modified}`,
      })),
    };
  }
}
