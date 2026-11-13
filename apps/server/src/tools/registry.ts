import { attachmentsTool } from './attachments/attachments.tool.js';
import { filesTool } from './files/files.tool.js';
import { markdownTool } from './markdown/markdown.tool.js';
import type { ToolDefinition } from './tool.js';

export const TOOLS: ToolDefinition[] = [filesTool, attachmentsTool, markdownTool];
