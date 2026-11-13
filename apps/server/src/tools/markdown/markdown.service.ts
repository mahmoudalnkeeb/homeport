import { Injectable } from '@nestjs/common';
import { hasPermission, type ToolSummary } from '@homeport/contracts';

import type { Actor } from '../../users/users.schema.js';
import { FilesService } from '../files/files.service.js';

const RECENT_NOTES = 6;

@Injectable()
export class MarkdownService {
  constructor(private readonly files: FilesService) {}

  async summary(actor: Actor): Promise<ToolSummary> {
    const scope = hasPermission(actor.role, 'system:read') ? 'all' : 'home';
    const notes = await this.files.recentFiles(actor, scope, 'markdown');
    return {
      tiles: [{ label: 'Notes', value: notes.length.toLocaleString('en') }],
      recent: notes.slice(0, RECENT_NOTES).map((file) => ({
        label: file.name,
        href: `/tools/markdown?file=${encodeURIComponent(file.path)}`,
        size: file.size,
        modified: file.modified,
      })),
    };
  }
}
