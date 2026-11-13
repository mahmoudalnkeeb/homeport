import type { ToolDefinition } from '../tool.js';
import { MarkdownModule } from './markdown.module.js';

export const markdownTool: ToolDefinition = {
  module: MarkdownModule,
  manifest: {
    id: 'markdown',
    name: 'Markdown',
    description: 'Write and read Markdown with live preview, code highlighting and Mermaid diagrams.',
    icon: 'file-text',
    permission: 'files:read',
    summaryUrl: '/api/markdown/summary',
    quickActions: [{ label: 'New note', icon: 'plus', href: '/tools/markdown?new=1' }],
  },
};
