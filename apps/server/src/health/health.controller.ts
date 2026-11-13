import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/auth.decorators.js';
import { Serialize } from '../common/http/serialize.js';
import { HealthDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @Serialize(HealthDto)
  check() {
    return this.health.check();
  }
}
