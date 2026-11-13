import { Controller, Get } from '@nestjs/common';

import { RequirePermission } from '../auth/auth.decorators.js';
import { Serialize } from '../common/http/serialize.js';
import { SystemSnapshotDto } from './system.dto.js';
import { SystemService } from './system.service.js';

@RequirePermission('system:read')
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  @Serialize(SystemSnapshotDto)
  snapshot() {
    return this.system.snapshot();
  }
}
