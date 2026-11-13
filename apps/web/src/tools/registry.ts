import type { ComponentType } from 'preact';
import { lazy } from 'preact-iso';

export interface ClientTool {
  page: ComponentType;
  flush?: boolean;
}

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  files: { page: lazy(() => import('./files/FilesPage')) },
  markdown: { page: lazy(() => import('./markdown/MarkdownPage')), flush: true },
};
