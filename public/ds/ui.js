// Homelab design system runtime: app shell, icons, feedback and formatting helpers.
// Icon paths are from Lucide (ISC license).

const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'folder-plus':
    '<path d="M12 10v6M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3Zm0 3v2"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  memory:
    '<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9M16 11V9M12 11V9M2 15h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.837V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.1a2 2 0 0 0 0-3.837Z"/>',
  drive:
    '<path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  network:
    '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
  palette:
    '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'arrow-right': '<path d="M5 12h14m-7-7 7 7-7 7"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7M12 19V5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  list: '<path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  layers:
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
};

export const KIND_ICON = {
  folder: 'folder',
  image: 'image',
  video: 'film',
  audio: 'music',
  pdf: 'pdf',
  markdown: 'file-text',
  text: 'code',
  archive: 'archive',
  other: 'file',
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.file}</svg>`;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

// ───────────── Formatting ─────────────
export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(iso) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Infinity, 'year'],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// ───────────── Data ─────────────
export async function api(path, { method = 'GET', json, body, signal } = {}) {
  const response = await fetch(path, {
    method,
    signal,
    headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: json === undefined ? body : JSON.stringify(json),
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const error = await response.json();
      message = Array.isArray(error.message) ? error.message.join(', ') : (error.message ?? message);
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

/** Builds the raw-file URL the Files tool serves. */
export const rawUrl = (path, download = false) =>
  `/api/files/raw?path=${encodeURIComponent(path)}${download ? '&download=true' : ''}`;

// ───────────── Feedback ─────────────
function toastRoot() {
  let root = document.querySelector('.toasts');
  if (!root) {
    root = document.createElement('div');
    root.className = 'toasts';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    document.body.append(root);
  }
  return root;
}

export function toast(message, tone = 'success') {
  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.tone = tone;
  node.innerHTML = `${icon(tone === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
  toastRoot().append(node);
  setTimeout(() => node.remove(), tone === 'error' ? 6000 : 3200);
}

export async function copyText(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Clipboard is unavailable on this connection', 'error');
  }
}

function openDialog({ title, body, confirmLabel, tone }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-head"><h2>${escapeHtml(title)}</h2></div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-foot">
        <button class="btn" value="cancel" formnovalidate>Cancel</button>
        <button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" value="ok">${escapeHtml(confirmLabel)}</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const input = dialog.querySelector('input');
      resolve(dialog.returnValue === 'ok' ? (input ? input.value.trim() : true) : null);
      dialog.remove();
    });
  });
}

export const confirmDialog = ({ title, message, confirmLabel = 'Confirm', tone = 'danger' }) =>
  openDialog({ title, body: `<p class="muted">${escapeHtml(message)}</p>`, confirmLabel, tone }).then(Boolean);

export function promptDialog({ title, label, value = '', hint = '', confirmLabel = 'Save' }) {
  const promise = openDialog({
    title,
    confirmLabel,
    body: `<label class="field"><span class="field-label">${escapeHtml(label)}</span>
      <input class="input" required value="${escapeHtml(value)}" autocomplete="off" spellcheck="false">
      ${hint ? `<span class="field-hint">${escapeHtml(hint)}</span>` : ''}</label>`,
  });
  const input = document.querySelector('dialog[open] input');
  input?.focus();
  // Select the file stem so typing replaces the name but keeps the extension.
  const dot = value.lastIndexOf('.');
  input?.setSelectionRange(0, dot > 0 ? dot : value.length);
  return promise;
}

// ───────────── Charts ─────────────
/** Line or bar sparkline as an inline SVG string. Values are plotted against `max` (defaults to data max). */
export function sparkline(values, { max, type = 'line', color } = {}) {
  const w = 100;
  const h = 40;
  const style = color ? ` style="--c:${color}"` : '';
  if (!values.length) return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"${style}></svg>`;
  const top = max ?? Math.max(...values, 1);
  if (type === 'bar') {
    const step = w / values.length;
    const bars = values
      .map((v, i) => {
        const bh = v > 0 ? Math.max((v / top) * h, 2) : 1;
        return `<rect class="bar${v > 0 ? '' : ' zero'}" x="${(i * step + step * 0.15).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(step * 0.7).toFixed(2)}" height="${bh.toFixed(2)}" rx="0.6"/>`;
      })
      .join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"${style}>${bars}</svg>`;
  }
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / top) * (h - 2) - 1).toFixed(2)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"${style}>
    <path class="area" d="M0,${h} L${points.join(' L')} L${w},${h} Z"/>
    <path class="line" d="M${points.join(' L')}"/></svg>`;
}

// ───────────── Theme ─────────────
const THEMES = ['system', 'light', 'dark'];

export function currentTheme() {
  return document.documentElement.dataset.theme ?? 'system';
}

/** The theme actually rendered, resolving "system" via the media query. */
export function resolvedTheme() {
  const theme = currentTheme();
  if (theme !== 'system') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('lab-theme', theme);
  } catch {
    // Not persisted; still applied for this page.
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: resolvedTheme() }));
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme() === 'system') window.dispatchEvent(new CustomEvent('themechange', { detail: resolvedTheme() }));
});

function themeControl() {
  const labels = { system: 'monitor', light: 'sun', dark: 'moon' };
  const control = document.createElement('div');
  control.className = 'segmented icon-only';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', 'Theme');
  const render = () => {
    control.innerHTML = THEMES.map(
      (theme) =>
        `<button type="button" data-theme-option="${theme}" aria-pressed="${currentTheme() === theme}" title="${theme[0].toUpperCase()}${theme.slice(1)} theme">${icon(labels[theme])}</button>`
    ).join('');
  };
  control.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-option]');
    if (!button) return;
    setTheme(button.dataset.themeOption);
    render();
  });
  render();
  return control;
}

// ───────────── Shell ─────────────
let toolsPromise;
export const loadTools = () => (toolsPromise ??= api('/api/tools').catch(() => []));

/** Renders the sidebar into #sidebar. `active` is "home" or a tool id; internal pages pass anything else. */
export async function mountShell(active) {
  const sidebar = document.getElementById('sidebar');
  const link = (href, iconName, label, id) =>
    `<a class="nav-link" href="${href}"${id === active ? ' aria-current="page"' : ''} title="${escapeHtml(label)}">${icon(iconName)}<span>${escapeHtml(label)}</span></a>`;

  const render = (tools) => {
    sidebar.innerHTML = `
      <a class="brand" href="/" aria-label="Homelab home"><span class="brand-mark">${icon('layers')}</span>homelab<small>v2</small></a>
      <nav class="nav" aria-label="Main">
        ${link('/', 'home', 'Overview', 'home')}
        <div class="nav-label">Tools</div>
        ${tools.map((tool) => link(tool.href, tool.icon, tool.name, tool.id)).join('')}
      </nav>
      <div class="sidebar-foot"></div>`;
    sidebar.querySelector('.sidebar-foot').append(themeControl());
  };

  render([]);
  const tools = await loadTools();
  render(tools);
  return tools;
}
