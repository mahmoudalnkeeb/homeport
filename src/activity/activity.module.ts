import { Controller, Get, Global, Module } from '@nestjs/common';

import { ActivityService } from './activity.service.js';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  get() {
    return this.activity.snapshot();
  }
}

// Global so any tool can record events without each module re-importing it.
@Global()
@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
