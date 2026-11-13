import { Module } from '@nestjs/common';

import { SessionsModule } from '../sessions/sessions.module.js';
import { FilesModule } from '../tools/files/files.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SessionsModule, FilesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
