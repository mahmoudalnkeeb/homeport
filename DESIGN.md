# Homelab design system: `@homelab/ui`

Source: `packages/ui/`. Live reference: `/ds` (internal, not linked in the UI).

## Character

A calm instrument panel: dense, legible, warm graphite neutrals with one signal-amber accent. Numbers are monospaced and tabular. Dark and light themes are equal citizens. The theme follows the OS unless the user picks one in the sidebar, which is stored in `localStorage` under `lab-theme`.

## How tools use it

```tsx
import { Button, Card, PageHeader, confirm, toast } from '@homelab/ui';
```

- **Components are the API.** Tools compose `@homelab/ui` components. A tool's own CSS file is only for layout specific to that tool (e.g. the Markdown workspace grid). It must not restyle buttons, cards or inputs, and it must not hard-code colors, sizes or radii. Use tokens.
- **Missing piece?** Add it to `packages/ui` (component + styles + an example on `/ds`), then use it. Don't fork it inside a tool.
- `@homelab/ui/styles.css` is imported once, by `apps/web/src/main.tsx`.

## Package contents

| File                         | Role                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `src/styles/tokens.css`      | Design tokens, light + dark                                          |
| `src/styles/components.css`  | Base, layout and component styles                                    |
| `src/components/layout.tsx`  | `AppShell` (sidebar on desktop; top bar + bottom tabs under 800px), `AuthLayout`, `Avatar`, `PageHeader`, `Section`, `ThemeControl` |
| `src/components/controls.tsx`| `Button`, `LinkButton`, `IconButton`, `Segmented`, `Input`, `Field`, `Kbd` |
| `src/components/data.tsx`    | `Card`, `Grid`, `Stack`, `Cluster`, `Stat`, `Meta`, `Meter`, `Breakdown`, `BarList`, `Sparkline`, `Badge`, `Chip`, `StatusDot`, `Rows`/`Row`, `EmptyState`, `Skeleton`, `Breadcrumbs`, `DataTable` |
| `src/components/feedback.tsx`| `Dialog` (bottom sheet under 640px), `ActionSheet`, `FeedbackHost`, `toast()`, `confirm()`, `prompt()`, `copyText()` |
| `src/icons.tsx`              | `Icon`, `IconName`, `KIND_ICON` (Lucide paths, ISC)                  |
| `src/theme.ts`               | `initTheme`, `setTheme`, `useTheme`, `resolvedTheme`                 |
| `src/format.ts`              | `formatBytes`, `formatDuration`, `timeAgo`, `formatDate`             |

## Tokens

Components consume **semantic** tokens only. Every token has a light value plus a dark value. The dark value is set under `prefers-color-scheme` and again under `[data-theme='dark']`.

- **Surfaces**: `--bg` (page) → `--surface` (cards, sidebar) → `--surface-2` (hover, sunken) → `--surface-3` (tracks)
- **Lines**: `--border`, `--border-strong`
- **Text**: `--text`, `--text-muted`, `--text-faint`. All meet WCAG AA on `--surface`.
- **Accent**: `--accent`, `--accent-hover`, `--accent-fg` (text on accent), `--accent-soft` (tinted fills), `--accent-text` (accent-colored text)
- **Status**: `--success`, `--warning`, `--danger`, `--danger-soft`
- **Charts**: `--series-1` … `--series-8`, categorical with matched lightness (`seriesColor(i)`)
- **Type**: `--font-sans`, `--font-mono`, sizes `--text-2xs` (11) … `--text-3xl` (36). The UI base is `--text-base` (14).
- **Space**: 4px grid, `--space-1` … `--space-12`. **Radius**: `--radius-sm` 5, `md` 8, `lg` 12, `full`.
- **Motion**: `--dur-fast` 120ms, `--dur-base` 200ms, `--ease-out`. Reduced motion is honoured globally.

## Rules

- One primary button per view. Use ghost buttons in toolbars and `variant="danger"` only inside a confirmation.
- Destructive actions go through `confirm()`. Rename and create go through `prompt()`. Outcomes get a `toast()`, and errors use `toast(message, 'error')` with the server's message.
- Every `IconButton` has a `label`; it becomes the accessible name and the tooltip.
- Empty states say what to do next.
- Icons come from `<Icon name>`. Add new Lucide paths to `ICONS` in `icons.tsx`.
- Hide actions the signed-in user can't take (`useAuth().can()` / `canWrite(path)`) instead of showing them disabled. When a whole view is read-only, say so once in a banner.
- Phones (under 800px): row actions go in an `ActionSheet` behind a `⋯` button, never in hover-only controls. Touch targets are at least 40px (`--control-h`), and inputs stay at 16px so iOS doesn't zoom. Fixed bars pad with `env(safe-area-inset-*)`.
