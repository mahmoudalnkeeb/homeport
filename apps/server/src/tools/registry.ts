import { attachmentsTool } from './attachments/attachments.tool.js';
import { filesTool } from './files/files.tool.js';
import { markdownTool } from './markdown/markdown.tool.js';
import { musicTool } from './music/music.tool.js';
import type { ToolDefinition } from './tool.js';
import { watchTool } from './watch/watch.tool.js';

export const TOOLS: ToolDefinition[] = [filesTool, attachmentsTool, markdownTool, watchTool, musicTool];
