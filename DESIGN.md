# Homelab design system

Live reference: `/ds/`. Source: `public/ds/`.

## Character

A calm instrument panel: dense, legible, warm graphite neutrals with one signal-amber accent. Numbers are monospaced and tabular. Dark and light themes are equal citizens. The theme follows the OS unless the user picks one in the sidebar, which is stored in `localStorage` under `lab-theme`.

## Files

| File        | Role                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `ds.css`    | Tokens, base, layout, components, prose and syntax colors               |
| `theme.js`  | Tiny blocking script for `<head>`; applies the saved theme before paint |
| `ui.js`     | ES module: `mountShell`, `icon`, `api`, `toast`, `confirmDialog`, `promptDialog`, `sparkline`, formatters, `rawUrl`, theme helpers |

## Tokens

Components consume **semantic** tokens only. Every token has a light value plus a dark value. The dark value is set under `prefers-color-scheme` and again under `[data-theme='dark']`.

- **Surfaces**: `--bg` (page) → `--surface` (cards, sidebar) → `--surface-2` (hover, sunken) → `--surface-3` (tracks)
- **Lines**: `--border`, `--border-strong`
- **Text**: `--text`, `--text-muted`, `--text-faint`. All meet WCAG AA on `--surface`.
- **Accent**: `--accent`, `--accent-hover`, `--accent-fg` (text on accent), `--accent-soft` (tinted fills), `--accent-text` (accent-colored text)
- **Status**: `--success`, `--warning`, `--danger`, `--danger-soft`
- **Charts**: `--series-1` … `--series-8`, categorical with matched lightness
- **Type**: `--font-sans`, `--font-mono`, sizes `--text-2xs` (11) … `--text-3xl` (36). The UI base is `--text-base` (14).
- **Space**: 4px grid, `--space-1` … `--space-12`. **Radius**: `--radius-sm` 5, `md` 8, `lg` 12, `full`.
- **Motion**: `--dur-fast` 120ms, `--dur-base` 200ms, `--ease-out`. Reduced motion is honoured globally.

## Components

`app` / `sidebar` / `main` (`.flush` for full-bleed editors) · `page-header` · `section` / `section-head` / `eyebrow` · `grid` + `span-*` · `stack` / `cluster` · `btn` (`-primary`, `-ghost`, `-danger`, `-sm`, `-icon`) · `input` / `input-group` / `field` · `segmented` (`aria-pressed`) · `card` / `card-head` · `stat-value` / `stat-meta` · `meter` (`data-tone`) · `stackbar` + `legend` · `barlist` · `spark` · `badge` / `chip` / `dot` · `rows` / `row` · `table-wrap` / `table` · `breadcrumbs` · `empty` · `skeleton` · `dropzone` · `dialog` (native `<dialog>`) · `toast` · `prose` · `kbd`

## Rules

- One primary button per view. Use ghost buttons in toolbars and danger only inside a confirmation.
- Never hard-code colors in tools. If a token is missing, add it to `ds.css` for both themes.
- Icons come from `icon(name)` (Lucide, ISC). Add new paths to `ICONS` in `ui.js`.
- Destructive actions go through `confirmDialog`. Rename and create go through `promptDialog`.
- Outcomes get a `toast`. Errors use `toast(message, 'error')` and keep the server's message.
- Empty states say what to do next.
