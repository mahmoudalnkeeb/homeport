import { Module } from '@nestjs/common';

import { ActivityModule } from './activity/activity.module.js';
import { EnvModule } from './config/env.js';
import { SystemModule } from './system/system.module.js';
import { ToolsModule } from './tools/registry.js';

@Module({
  imports: [EnvModule, ActivityModule, SystemModule, ToolsModule],
})
export class AppModule {}
