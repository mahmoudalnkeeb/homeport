import type { ToolDefinition } from '../tool.js';
import { AttachmentsModule } from './attachments.module.js';

export const attachmentsTool: ToolDefinition = {
  module: AttachmentsModule,
  manifest: {
    id: 'attachments',
    name: 'Attachments',
    description: 'A shared library of reusable media and documents, sorted by type, with stable links to embed anywhere.',
    icon: 'paperclip',
    permission: 'attachments:read',
    summaryUrl: '/api/attachments/summary',
    quickActions: [
      { label: 'Upload attachment', icon: 'upload', href: '/tools/attachments?upload=1' },
      { label: 'Videos', icon: 'film', href: '/tools/attachments?category=video' },
    ],
  },
};
