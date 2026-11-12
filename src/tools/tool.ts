import type { Type } from '@nestjs/common';

export interface QuickAction {
  label: string;
  icon: string;
  href: string;
}

/** Public description of a tool; drives the navigation, tool grid and homepage quick actions. */
export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** API path returning a ToolSummary for the homepage. */
  summaryUrl?: string;
  quickActions: QuickAction[];
}

export interface ToolSummary {
  tiles: { label: string; value: string; hint?: string }[];
  breakdown?: { label: string; value: number; display: string }[];
  recent?: { label: string; href: string; meta: string }[];
}

export interface ToolDefinition {
  manifest: ToolManifest;
  module: Type;
  /** Static UI served at /tools/<id>/. */
  uiDir: string;
  /** Extra static directories the UI needs, e.g. vendored browser libraries. */
  assets?: { prefix: string; dir: string }[];
}
