import { Module } from '@nestjs/common';

import { MediaModule } from '../../media/media.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { MusicModule } from '../music/music.module.js';
import { WatchModule } from '../watch/watch.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [MediaModule, AttachmentsModule, WatchModule, MusicModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
