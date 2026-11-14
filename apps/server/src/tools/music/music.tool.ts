import type { ToolDefinition } from '../tool.js';
import { MusicModule } from './music.module.js';

export const musicTool: ToolDefinition = {
  module: MusicModule,
  manifest: {
    id: 'music',
    name: 'Music',
    description: 'Albums and artists from library/music, read from file tags, with a gapless queue.',
    icon: 'music',
    permission: 'library:read',
    summaryUrl: '/api/music/summary',
    quickActions: [{ label: 'Albums', icon: 'music', href: '/tools/music' }],
  },
};
