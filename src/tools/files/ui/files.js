import {
  api,
  confirmDialog,
  escapeHtml,
  formatBytes,
  formatDate,
  icon,
  KIND_ICON,
  mountShell,
  promptDialog,
  rawUrl,
  timeAgo,
  toast,
} from '/ds/ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  path: params.get('path') ?? '',
  entries: [],
  filter: '',
  layout: localStorageGet('files-layout') ?? 'list',
};

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const join = (folder, name) => (folder ? `${folder}/${name}` : name);

// ───────────── Rendering ─────────────
function renderChrome() {
  $('new-folder').innerHTML = `${icon('folder-plus')}New folder`;
  $('upload-button').innerHTML = `${icon('upload')}Upload`;
  $('filter-icon').outerHTML = icon('search');
  $('drop-hint').innerHTML = `${icon('upload')}<strong>Drop to upload</strong><span class="muted" id="drop-target"></span>`;
  renderLayoutToggle();
}

function renderLayoutToggle() {
  $('layout').innerHTML = [
    ['list', 'list'],
    ['grid', 'grid'],
  ]
    .map(
      ([layout, iconName]) =>
        `<button type="button" data-layout="${layout}" aria-pressed="${state.layout === layout}" title="${layout === 'list' ? 'List' : 'Grid'} view">${icon(iconName)}</button>`
    )
    .join('');
}

function renderCrumbs() {
  const parts = state.path ? state.path.split('/') : [];
  const crumbs = [{ name: 'data', path: '' }, ...parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))];
  $('crumbs').innerHTML = crumbs
    .map((crumb, i) =>
      i === crumbs.length - 1
        ? `<li><span aria-current="page">${escapeHtml(crumb.name)}</span></li>`
        : `<li><a href="?path=${encodeURIComponent(crumb.path)}" data-nav="${escapeHtml(crumb.path)}">${escapeHtml(crumb.name)}</a></li>`
    )
    .join('');
  const dropTarget = $('drop-target');
  if (dropTarget) dropTarget.textContent = `into /${state.path}`;
}

function actionButtons(entry) {
  const button = (action, iconName, label) =>
    `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="${action}" data-path="${escapeHtml(entry.path)}" title="${label}" aria-label="${label} ${escapeHtml(entry.name)}">${icon(iconName)}</button>`;
  return [
    entry.kind === 'markdown' ? button('edit', 'file-text', 'Edit in Markdown') : '',
    entry.kind === 'folder' ? '' : button('download', 'download', 'Download'),
    button('rename', 'pencil', 'Rename'),
    button('delete', 'trash', 'Delete'),
  ].join('');
}

function visibleEntries() {
  const query = state.filter.toLowerCase();
  return query ? state.entries.filter((entry) => entry.name.toLowerCase().includes(query)) : state.entries;
}

function renderListing() {
  const entries = visibleEntries();
  const uploadPrompt =
    params.get('upload') === '1'
      ? `<div class="dropzone" style="margin-bottom: var(--space-3)">${icon('upload', 'icon-lg')}
          <strong>Drop files anywhere on this page</strong>
          <button class="btn btn-primary" type="button" data-action="pick">Choose files</button></div>`
      : '';

  if (!entries.length) {
    $('listing').innerHTML = `${uploadPrompt}<div class="card"><div class="empty">${icon(state.filter ? 'search' : 'folder')}
      <strong>${state.filter ? 'No matches' : 'This folder is empty'}</strong>
      <span>${state.filter ? 'Try a different filter.' : 'Drop files here or use Upload.'}</span></div></div>`;
    return;
  }

  if (state.layout === 'grid') {
    $('listing').innerHTML = `${uploadPrompt}<div class="tiles">${entries
      .map(
        (entry) => `<button class="tile" type="button" data-open="${escapeHtml(entry.path)}" title="${escapeHtml(entry.name)}">
          <span class="tile-thumb">${
            entry.kind === 'image'
              ? `<img src="${rawUrl(entry.path)}" alt="" loading="lazy" decoding="async">`
              : icon(KIND_ICON[entry.kind])
          }</span>
          <span class="tile-info"><span class="row-title" style="display:block">${escapeHtml(entry.name)}</span>
          <span class="row-meta">${entry.kind === 'folder' ? 'Folder' : formatBytes(entry.size)}</span></span></button>`
      )
      .join('')}</div>`;
    return;
  }

  $('listing').innerHTML = `${uploadPrompt}<div class="table-wrap"><table class="table">
    <thead><tr><th>Name</th><th>Type</th><th class="num">Size</th><th class="num">Modified</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${entries
      .map(
        (entry) => `<tr>
          <td><div class="name-cell"><span class="row-icon">${icon(KIND_ICON[entry.kind])}</span>
            <button type="button" data-open="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</button></div></td>
          <td class="kind-cell">${entry.kind}</td>
          <td class="num">${entry.kind === 'folder' ? '—' : formatBytes(entry.size)}</td>
          <td class="num" title="${formatDate(entry.modified)}">${timeAgo(entry.modified)}</td>
          <td><div class="row-actions">${actionButtons(entry)}</div></td></tr>`
      )
      .join('')}</tbody></table></div>`;
}

async function load(path = state.path, { push = false } = {}) {
  try {
    const listing = await api(`/api/files?path=${encodeURIComponent(path)}`);
    state.path = listing.path;
    state.entries = listing.entries;
  } catch (error) {
    toast(error.message, 'error');
    if (path) return load('', { push });
    state.entries = [];
  }
  const url = new URL(location.href);
  url.searchParams.delete('open');
  if (state.path) url.searchParams.set('path', state.path);
  else url.searchParams.delete('path');
  history[push ? 'pushState' : 'replaceState'](null, '', url);
  renderCrumbs();
  renderListing();
}

// ───────────── Preview ─────────────
async function openPreview(entry) {
  const dialog = $('preview');
  const url = rawUrl(entry.path);
  $('preview-icon').innerHTML = icon(KIND_ICON[entry.kind]);
  $('preview-title').textContent = entry.name;
  $('preview-actions').innerHTML = `
    ${entry.kind === 'markdown' ? `<a class="btn btn-sm" href="/tools/markdown/?file=${encodeURIComponent(entry.path)}">${icon('pencil')}Open in Markdown</a>` : ''}
    <a class="btn btn-sm" href="${url}" target="_blank" rel="noopener">${icon('external')}New tab</a>
    <a class="btn btn-sm" href="${rawUrl(entry.path, true)}">${icon('download')}Download</a>
    <button class="btn btn-ghost btn-icon btn-sm" type="button" data-close title="Close">${icon('x')}</button>`;

  const body = $('preview-body');
  switch (entry.kind) {
    case 'image':
      body.innerHTML = `<img src="${url}" alt="${escapeHtml(entry.name)}">`;
      break;
    case 'video':
      body.innerHTML = `<video src="${url}" controls autoplay playsinline preload="metadata"></video>`;
      break;
    case 'audio':
      body.innerHTML = `<div class="empty">${icon('music', 'icon-lg')}<strong>${escapeHtml(entry.name)}</strong></div><audio src="${url}" controls autoplay></audio>`;
      break;
    case 'pdf':
      body.innerHTML = `<iframe src="${url}" title="${escapeHtml(entry.name)}"></iframe>`;
      break;
    case 'markdown':
    case 'text': {
      if (entry.size > 2 * 1024 * 1024) {
        body.innerHTML = `<div class="empty">${icon('file')}<span>Too large to preview (${formatBytes(entry.size)}). Download it instead.</span></div>`;
        break;
      }
      body.innerHTML = '<div class="skeleton" style="width:100%;height:60%"></div>';
      const text = await fetch(url).then((response) => response.text());
      body.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
      break;
    }
    default:
      body.innerHTML = `<div class="empty">${icon(KIND_ICON[entry.kind], 'icon-lg')}<strong>No preview for this file type</strong>
        <span>${formatBytes(entry.size)} · modified ${formatDate(entry.modified)}</span>
        <a class="btn btn-primary" href="${rawUrl(entry.path, true)}">${icon('download')}Download</a></div>`;
  }
  if (!dialog.open) dialog.showModal();
}

$('preview').addEventListener('close', () => {
  // Stop playback when the dialog closes.
  $('preview-body').innerHTML = '';
});
$('preview').addEventListener('click', (event) => {
  if (event.target === event.currentTarget || event.target.closest('[data-close]')) $('preview').close();
});

// ───────────── Mutations ─────────────
function uploadFiles(files) {
  if (!files.length) return;
  const target = state.path;
  const panel = $('uploads');
  const item = document.createElement('div');
  item.className = 'upload-item';
  const total = [...files].reduce((sum, file) => sum + file.size, 0);
  const label = files.length === 1 ? files[0].name : `${files.length} files`;
  item.innerHTML = `<span class="truncate">${escapeHtml(label)}</span><span class="mono faint" data-progress>0%</span>
    <div class="meter"><span style="--value:0%"></span></div>`;
  panel.hidden = false;
  panel.append(item);

  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/files/upload?path=${encodeURIComponent(target)}`);
  xhr.upload.addEventListener('progress', (event) => {
    const ratio = event.lengthComputable ? event.loaded / event.total : 0;
    item.querySelector('.meter span').style.setProperty('--value', `${(ratio * 100).toFixed(1)}%`);
    item.querySelector('[data-progress]').textContent = `${Math.round(ratio * 100)}% of ${formatBytes(total)}`;
  });
  xhr.addEventListener('loadend', () => {
    item.remove();
    if (!panel.children.length) panel.hidden = true;
    if (xhr.status >= 200 && xhr.status < 300) {
      toast(`Uploaded ${label}`);
      if (state.path === target) load();
      return;
    }
    let message = 'Upload failed';
    try {
      message = JSON.parse(xhr.responseText).message ?? message;
    } catch {
      // keep generic message
    }
    toast(message, 'error');
  });
  xhr.send(form);
}

async function runAction(action, path) {
  const entry = state.entries.find((candidate) => candidate.path === path);
  if (!entry) return;
  try {
    if (action === 'download') location.href = rawUrl(path, true);
    if (action === 'edit') location.href = `/tools/markdown/?file=${encodeURIComponent(path)}`;
    if (action === 'rename') {
      const name = await promptDialog({ title: 'Rename', label: 'New name', value: entry.name, confirmLabel: 'Rename' });
      if (!name || name === entry.name) return;
      await api('/api/files/rename', { method: 'POST', json: { path, name } });
      toast(`Renamed to ${name}`);
      await load();
    }
    if (action === 'delete') {
      const ok = await confirmDialog({
        title: `Delete ${entry.kind === 'folder' ? 'folder' : 'file'}?`,
        message: `“${entry.name}”${entry.kind === 'folder' ? ' and everything inside it' : ''} will be permanently deleted.`,
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      await api(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      toast(`Deleted ${entry.name}`);
      await load();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ───────────── Events ─────────────
document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    load(nav.dataset.nav, { push: true });
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open) {
    const entry = state.entries.find((candidate) => candidate.path === open.dataset.open);
    if (entry?.kind === 'folder') load(entry.path, { push: true });
    else if (entry) openPreview(entry);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action?.dataset.action === 'pick') $('upload-input').click();
  else if (action) runAction(action.dataset.action, action.dataset.path);

  const layout = event.target.closest('[data-layout]');
  if (layout) {
    state.layout = layout.dataset.layout;
    try {
      localStorage.setItem('files-layout', state.layout);
    } catch {
      // layout preference just won't persist
    }
    renderLayoutToggle();
    renderListing();
  }
});

$('upload-button').addEventListener('click', () => $('upload-input').click());
$('upload-input').addEventListener('change', (event) => {
  uploadFiles([...event.target.files]);
  event.target.value = '';
});
$('new-folder').addEventListener('click', async () => {
  const name = await promptDialog({ title: 'New folder', label: 'Folder name', value: '', confirmLabel: 'Create' });
  if (!name) return;
  try {
    await api('/api/files/folder', { method: 'POST', json: { path: join(state.path, name) } });
    await load(join(state.path, name), { push: true });
  } catch (error) {
    toast(error.message, 'error');
  }
});
$('filter').addEventListener('input', (event) => {
  state.filter = event.target.value;
  renderListing();
});
window.addEventListener('popstate', () => load(new URLSearchParams(location.search).get('path') ?? ''));

let dragDepth = 0;
const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
document.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});
document.addEventListener('dragover', (event) => {
  if (hasFiles(event)) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  uploadFiles([...event.dataTransfer.files]);
});

// ───────────── Boot ─────────────
renderChrome();
mountShell('files');
await load();
const openPath = params.get('open');
if (openPath) {
  const entry = state.entries.find((candidate) => candidate.path === openPath);
  if (entry) openPreview(entry);
}
