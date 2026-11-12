import { join } from 'node:path';

import { Controller, Get, Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module.js';
import { FilesService } from '../files/files.service.js';
import { formatBytes } from '../format.js';
import type { ToolDefinition, ToolSummary } from '../tool.js';

@Controller('markdown')
export class MarkdownController {
  constructor(private readonly files: FilesService) {}

  @Get('summary')
  async summary(): Promise<ToolSummary> {
    const { count, files } = await this.files.recent('markdown', 6);
    return {
      tiles: [{ label: 'Notes', value: count.toLocaleString('en') }],
      recent: files.map((file) => ({
        label: file.name,
        href: `/tools/markdown/?file=${encodeURIComponent(file.path)}`,
        meta: `${formatBytes(file.size)} · ${file.modified}`,
      })),
    };
  }
}

@Module({
  imports: [FilesModule],
  controllers: [MarkdownController],
})
export class MarkdownModule {}

// dist/tools/markdown and src/tools/markdown both sit three levels below the project root.
const nodeModules = join(import.meta.dirname, '..', '..', '..', 'node_modules');

export const markdownTool: ToolDefinition = {
  module: MarkdownModule,
  uiDir: join(import.meta.dirname, 'ui'),
  // Served locally so the viewer keeps working on a LAN without internet access.
  assets: [
    { prefix: '/vendor/marked', dir: join(nodeModules, 'marked', 'lib') },
    { prefix: '/vendor/marked-highlight', dir: join(nodeModules, 'marked-highlight', 'src') },
    { prefix: '/vendor/highlight', dir: join(nodeModules, '@highlightjs', 'cdn-assets', 'es') },
    { prefix: '/vendor/dompurify', dir: join(nodeModules, 'dompurify', 'dist') },
    { prefix: '/vendor/svg-pan-zoom', dir: join(nodeModules, 'svg-pan-zoom', 'dist') },
    { prefix: '/vendor/mermaid', dir: join(nodeModules, 'mermaid', 'dist') },
  ],
  manifest: {
    id: 'markdown',
    name: 'Markdown',
    description: 'Write and read Markdown with live preview, code highlighting and Mermaid diagrams.',
    icon: 'file-text',
    summaryUrl: '/api/markdown/summary',
    quickActions: [{ label: 'New note', icon: 'plus', href: '/tools/markdown/?new=1' }],
  },
};
