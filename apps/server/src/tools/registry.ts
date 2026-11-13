import { filesTool } from './files/files.tool.js';
import { markdownTool } from './markdown/markdown.tool.js';
import type { ToolDefinition } from './tool.js';

export const TOOLS: ToolDefinition[] = [filesTool, markdownTool];
