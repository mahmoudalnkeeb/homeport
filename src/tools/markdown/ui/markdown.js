import DOMPurify from '/vendor/dompurify/purify.es.mjs';
import hljs from '/vendor/highlight/highlight.min.js';
import { Marked } from '/vendor/marked/marked.esm.js';
import { markedHighlight } from '/vendor/marked-highlight/index.js';
import {
  api,
  confirmDialog,
  escapeHtml,
  formatBytes,
  icon,
  mountShell,
  promptDialog,
  rawUrl,
  resolvedTheme,
  timeAgo,
  toast,
} from '/ds/ui.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'markdown-draft';
const VIEW_KEY = 'markdown-view';

const SAMPLE = [
  '# Hello Markdown',
  '',
  'Type on the left, or **open / drop** a `.md` file. Switch to **Read** for a distraction-free view.',
  'Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save into the homelab data folder.',
  '',
  '- [x] GitHub-flavored markdown',
  '- [x] Syntax highlighting',
  '- [x] Mermaid diagrams — drag to pan, use the toolbar to zoom or maximize',
  '',
  '| Feature | Library |',
  '| --- | --- |',
  '| Parsing | marked |',
  '| Styling | homelab design system |',
  '| Diagrams | mermaid + svg-pan-zoom |',
  '',
  '```js',
  'const greet = (name) => `Hello, ${name}!`;',
  '```',
  '',
  '```mermaid',
  'graph LR',
  '  A[Markdown] --> B(marked)',
  '  B --> C{mermaid block?}',
  '  C -->|yes| D[Diagram]',
  '  C -->|no| E[HTML]',
  '```',
].join('\n');

const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Drafts are best-effort.
    }
  },
};

// ───────────── Markdown pipeline ─────────────
const marked = new Marked(
  { gfm: true },
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang === 'mermaid') return code;
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  {
    // Mermaid blocks become <pre class="mermaid"> so mermaid.run() can find and render them.
    renderer: {
      code({ text, lang }) {
        if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
        return false;
      },
    },
  }
);

let mermaidModule;
async function loadMermaid() {
  mermaidModule ??= import('/vendor/mermaid/mermaid.esm.min.mjs').then((module) => module.default);
  const mermaid = await mermaidModule;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: resolvedTheme() === 'dark' ? 'dark' : 'neutral',
    fontFamily: getComputedStyle(document.body).fontFamily,
  });
  return mermaid;
}

// ───────────── Diagrams ─────────────
const editor = $('editor');
const output = $('output');
const workspace = $('workspace');
const panZooms = new Map(); // .diagram element -> svg-pan-zoom instance

function refitDiagrams() {
  for (const pz of panZooms.values()) {
    pz.resize();
    pz.fit();
    pz.center();
  }
}

function enhanceDiagram(pre) {
  const svg = pre.querySelector('svg');
  if (!svg) {
    pre.outerHTML = `<div class="diagram-error">Mermaid could not render this diagram.\n\n${escapeHtml(pre.textContent)}</div>`;
    return;
  }
  const box = document.createElement('div');
  box.className = 'diagram';
  const tool = (act, iconName, title) =>
    `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon(iconName)}</button>`;
  box.innerHTML = `<div class="diagram-tools">${tool('in', 'zoom-in', 'Zoom in')}${tool('out', 'zoom-out', 'Zoom out')}${tool('reset', 'reset', 'Reset view')}${tool('max', 'maximize', 'Maximize')}</div>`;
  pre.replaceWith(box);
  box.append(pre);

  // svg-pan-zoom needs a fixed-size viewport, so lock the box to the diagram's natural height.
  const height = Math.max(svg.getBoundingClientRect().height, 150);
  pre.style.setProperty('--h', `${Math.ceil(height) + 32}px`);
  svg.style.maxWidth = 'none';
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  panZooms.set(
    box,
    window.svgPanZoom(svg, {
      fit: true,
      center: true,
      minZoom: 0.2,
      maxZoom: 20,
      // Wheel zoom would hijack page scrolling inline; it's enabled only while maximized.
      mouseWheelZoomEnabled: false,
    })
  );
}

function setMaximized(box, on) {
  const pz = panZooms.get(box);
  const button = box.querySelector('[data-act="max"]');
  box.classList.toggle('maximized', on);
  button.innerHTML = icon(on ? 'minimize' : 'maximize');
  button.title = on ? 'Restore (Esc)' : 'Maximize';
  if (on) pz.enableMouseWheelZoom();
  else pz.disableMouseWheelZoom();
  pz.resize();
  pz.fit();
  pz.center();
}

output.addEventListener('click', (event) => {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const box = button.closest('.diagram');
  const pz = panZooms.get(box);
  const act = button.dataset.act;
  if (act === 'in') pz.zoomIn();
  if (act === 'out') pz.zoomOut();
  if (act === 'reset') {
    pz.resetZoom();
    pz.fit();
    pz.center();
  }
  if (act === 'max') setMaximized(box, !box.classList.contains('maximized'));
});

let renderId = 0;
async function render() {
  const id = ++renderId;
  for (const pz of panZooms.values()) pz.destroy();
  panZooms.clear();

  output.innerHTML = DOMPurify.sanitize(marked.parse(editor.value));
  const nodes = output.querySelectorAll('pre.mermaid');
  if (!nodes.length) return;
  try {
    const mermaid = await loadMermaid();
    if (id !== renderId) return; // a newer render started while mermaid loaded
    await mermaid.run({ nodes, suppressErrors: true });
  } catch {
    // Failed diagrams have no <svg>; enhanceDiagram shows them as an inline error block.
  }
  if (id === renderId) nodes.forEach(enhanceDiagram);
}

// ───────────── Document state ─────────────
const doc = { path: null, name: 'Untitled.md', saved: '' };

function isDirty() {
  return editor.value !== doc.saved;
}

function updateHeader(meta) {
  $('doc-name').textContent = doc.name;
  $('dirty').hidden = !isDirty();
  document.title = `${isDirty() ? '• ' : ''}${doc.name} · Markdown`;
  if (meta !== undefined) $('doc-meta').textContent = meta;
}

function setDocument({ path = null, name, content, meta }) {
  doc.path = path;
  doc.name = name;
  doc.saved = path ? content : '';
  editor.value = content;
  const url = new URL(location.href);
  url.searchParams.delete('new');
  if (path) url.searchParams.set('file', path);
  else url.searchParams.delete('file');
  history.replaceState(null, '', url);
  updateHeader(meta ?? (path ? `data/${path}` : 'Draft · stored in this browser'));
  render();
}

async function openServerFile(path) {
  try {
    const response = await fetch(rawUrl(path));
    if (!response.ok) throw new Error(response.status === 404 ? 'File not found' : `Could not open ${path}`);
    const content = await response.text();
    setDocument({ path, name: path.split('/').at(-1), content });
  } catch (error) {
    toast(error.message, 'error');
    newDocument();
  }
}

function newDocument(content = '# Untitled\n\n') {
  setDocument({ name: 'Untitled.md', content });
  storage.set(DRAFT_KEY, null);
  editor.focus();
  editor.setSelectionRange(2, 10);
}

function suggestPath() {
  if (doc.path) return doc.path;
  const heading = editor.value.match(/^#\s+(.+)$/m)?.[1] ?? 'untitled';
  const slug =
    doc.name !== 'Untitled.md'
      ? doc.name.replace(/\.(md|markdown|mdx|txt)$/i, '')
      : heading
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60) || 'untitled';
  return `notes/${slug}.md`;
}

async function save({ saveAs = false } = {}) {
  let path = doc.path;
  if (!path || saveAs) {
    const input = await promptDialog({
      title: 'Save note',
      label: 'Path inside the data folder',
      value: suggestPath(),
      hint: 'Folders are created as needed. Existing files are overwritten.',
    });
    if (!input) return;
    path = input.replace(/^\/+/, '');
    if (!/\.(md|markdown|mdx)$/i.test(path)) path += '.md';
  }
  try {
    const saved = await api('/api/files/text', { method: 'PUT', json: { path, content: editor.value } });
    storage.set(DRAFT_KEY, null);
    setDocument({
      path: saved.path,
      name: saved.name,
      content: editor.value,
      meta: `data/${saved.path} · ${formatBytes(saved.size)} · saved ${timeAgo(saved.modified)}`,
    });
    toast(`Saved ${saved.path}`);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function loadLocalFile(file) {
  if (!file) return;
  file.text().then((content) => setDocument({ name: file.name, content, meta: 'Opened from this device · not saved yet' }));
}

// ───────────── Chrome & events ─────────────
const VIEWS = [
  ['write', 'pencil', 'Write'],
  ['split', 'columns', 'Split'],
  ['read', 'book', 'Read'],
];

function setView(view) {
  workspace.dataset.view = view;
  storage.set(VIEW_KEY, view);
  $('views').innerHTML = VIEWS.map(
    ([id, iconName, label]) =>
      `<button type="button" data-view="${id}" aria-pressed="${id === view}">${icon(iconName)}${label}</button>`
  ).join('');
  refitDiagrams();
}

$('doc-icon').innerHTML = icon('file-text');
$('new').innerHTML = `${icon('plus')}<span>New</span>`;
$('open-local').innerHTML = `${icon('upload')}<span>Open</span>`;
$('download').innerHTML = `${icon('download')}<span>Download</span>`;
$('save').innerHTML = `${icon('save')}<span>Save</span>`;
$('open-local').title = 'Open a Markdown file from this device';
$('download').title = 'Download as .md';
$('save').title = 'Save to the data folder (Ctrl+S)';

$('views').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (button) setView(button.dataset.view);
});
$('new').addEventListener('click', async () => {
  if (isDirty() && doc.path && !(await confirmDialog({ title: 'Discard changes?', message: `Unsaved edits to ${doc.name} will be lost.`, confirmLabel: 'Discard' }))) return;
  newDocument();
});
$('open-local').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (event) => {
  loadLocalFile(event.target.files[0]);
  event.target.value = '';
});
$('download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([editor.value], { type: 'text/markdown' }));
  link.download = doc.name;
  link.click();
  URL.revokeObjectURL(link.href);
});
$('save').addEventListener('click', (event) => save({ saveAs: event.shiftKey }));

let timer;
editor.addEventListener('input', () => {
  updateHeader();
  if (!doc.path) storage.set(DRAFT_KEY, editor.value);
  clearTimeout(timer);
  timer = setTimeout(render, 200);
});
editor.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || event.shiftKey) return;
  event.preventDefault();
  editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
  editor.dispatchEvent(new Event('input'));
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save({ saveAs: event.shiftKey });
  }
  const box = output.querySelector('.diagram.maximized');
  if (event.key === 'Escape' && box) setMaximized(box, false);
});

window.addEventListener('beforeunload', (event) => {
  if (doc.path && isDirty()) event.preventDefault();
});
window.addEventListener('resize', refitDiagrams);
window.addEventListener('themechange', render);

document.addEventListener('dragover', (event) => {
  event.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  loadLocalFile(event.dataTransfer.files[0]);
});

// ───────────── Boot ─────────────
mountShell('markdown');
setView(storage.get(VIEW_KEY) ?? 'split');
const params = new URLSearchParams(location.search);
if (params.get('file')) await openServerFile(params.get('file'));
else if (params.get('new')) newDocument();
else setDocument({ name: 'Untitled.md', content: storage.get(DRAFT_KEY) ?? SAMPLE });
