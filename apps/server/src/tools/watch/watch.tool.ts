import type { ToolDefinition } from '../tool.js';
import { WatchModule } from './watch.module.js';

export const watchTool: ToolDefinition = {
  module: WatchModule,
  manifest: {
    id: 'watch',
    name: 'Watch',
    description: 'Movies and TV from library/movies and library/tv, with posters and resume on any device.',
    icon: 'film',
    permission: 'library:read',
    summaryUrl: '/api/watch/summary',
    quickActions: [{ label: 'Continue watching', icon: 'play', href: '/tools/watch' }],
  },
};
