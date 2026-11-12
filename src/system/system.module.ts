import { Controller, Get, Module } from '@nestjs/common';

import { SystemService } from './system.service.js';

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  get() {
    return this.system.snapshot();
  }
}

@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
