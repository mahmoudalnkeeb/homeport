import { Injectable } from '@nestjs/common';
import { hasPermission, type ToolInfo } from '@homeport/contracts';

import { Paginated } from '../common/http/pagination.js';
import type { Actor } from '../users/users.schema.js';
import { TOOLS } from './registry.js';

@Injectable()
export class ToolsService {
  list(actor: Actor): Paginated<ToolInfo> {
    return Paginated.all(
      TOOLS.filter(({ manifest }) => hasPermission(actor.role, manifest.permission)).map(({ manifest }) => ({
        ...manifest,
        href: `/tools/${manifest.id}`,
      }))
    );
  }
}
