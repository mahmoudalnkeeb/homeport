import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module.js';
import { MarkdownController } from './markdown.controller.js';
import { MarkdownService } from './markdown.service.js';

@Module({
  imports: [FilesModule],
  controllers: [MarkdownController],
  providers: [MarkdownService],
})
export class MarkdownModule {}
