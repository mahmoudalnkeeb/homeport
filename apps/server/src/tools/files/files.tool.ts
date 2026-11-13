import type { ToolDefinition } from '../tool.js';
import { FilesModule } from './files.module.js';

export const filesTool: ToolDefinition = {
  module: FilesModule,
  manifest: {
    id: 'files',
    name: 'Files',
    description: 'Browse, upload and stream files, with adaptive video and audio playback.',
    icon: 'folder',
    permission: 'files:read',
    summaryUrl: '/api/files/summary',
    quickActions: [
      { label: 'Upload to library', icon: 'upload', href: '/tools/files?upload=1' },
      { label: 'Browse media', icon: 'film', href: '/tools/files?path=video' },
    ],
  },
};
