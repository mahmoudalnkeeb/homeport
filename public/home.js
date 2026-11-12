import {
  api,
  copyText,
  escapeHtml,
  formatBytes,
  formatDuration,
  icon,
  KIND_ICON,
  mountShell,
  sparkline,
  timeAgo,
} from '/ds/ui.js';

const $ = (id) => document.getElementById(id);
const pct = (ratio) => `${Math.round(ratio * 100)}`;
const tone = (ratio) => (ratio > 0.9 ? 'danger' : ratio > 0.75 ? 'warning' : '');
const EVENT_ICON = { upload: 'upload', save: 'save', delete: 'trash', rename: 'pencil', mkdir: 'folder-plus' };

let tools = [];
let lanUrl = '';

function cardHead(iconName, title, aside = '') {
  return `<div class="card-head">${icon(iconName)}<span>${escapeHtml(title)}</span><span class="spacer"></span>${aside}</div>`;
}

function meter(ratio) {
  return `<div class="meter" data-tone="${tone(ratio)}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(ratio)}"><span style="--value:${(ratio * 100).toFixed(1)}%"></span></div>`;
}

function renderSystem(system) {
  $('host').textContent = system.hostname;
  $('platform').textContent = `${system.platform} · ${system.arch} · up ${formatDuration(system.uptime)}`;
  $('updated').textContent = `updated ${new Date().toLocaleTimeString()}`;

  const cpu = system.cpu.usage;
  $('cpu').innerHTML = `
    ${cardHead('cpu', 'CPU', `<span class="faint">${system.cpu.cores} cores</span>`)}
    <div class="metric"><span class="stat-value">${cpu === null ? '—' : pct(cpu)}<small>%</small></span></div>
    ${sparkline(system.history.map((s) => s.cpu), { max: 1 })}
    <span class="stat-meta truncate" title="${escapeHtml(system.cpu.model)}">${escapeHtml(system.cpu.model)}</span>`;

  const mem = system.memory.used / system.memory.total;
  $('memory').innerHTML = `
    ${cardHead('memory', 'Memory', `<span class="faint">${formatBytes(system.memory.total)}</span>`)}
    <div class="metric"><span class="stat-value">${pct(mem)}<small>%</small></span></div>
    ${sparkline(system.history.map((s) => s.mem), { max: 1, color: 'var(--series-2)' })}
    <span class="stat-meta">${formatBytes(system.memory.used)} in use</span>`;

  const disk = system.disk;
  $('disk').innerHTML = disk
    ? `${cardHead('drive', 'Data disk', `<span class="faint">${formatBytes(disk.total)}</span>`)}
       <div class="metric"><span class="stat-value">${formatBytes(disk.free).replace(' ', '<small>')}</small></span><span class="faint">free</span></div>
       ${meter(disk.used / disk.total)}
       <span class="stat-meta truncate" title="${escapeHtml(disk.path)}">${pct(disk.used / disk.total)}% used · ${escapeHtml(disk.path)}</span>`
    : `${cardHead('drive', 'Data disk')}<p class="muted">Disk statistics are unavailable.</p>`;

  $('network').innerHTML = `
    ${cardHead('network', 'Network')}
    <ul class="rows">${
      system.urls.length
        ? system.urls
            .map(
              (url) => `<li class="row"><span class="row-main mono truncate">${escapeHtml(url)}</span>
                <button class="btn btn-ghost btn-icon btn-sm" data-copy="${escapeHtml(url)}" title="Copy address">${icon('copy')}</button></li>`
            )
            .join('')
        : '<li class="row muted">No LAN interfaces found</li>'
    }</ul>
    <span class="stat-meta">Node ${escapeHtml(system.node)} · server up ${formatDuration(system.processUptime)}</span>`;

  if (system.urls[0] && system.urls[0] !== lanUrl) {
    lanUrl = system.urls[0];
    $('lan').innerHTML = `<span class="chip">${icon('link')}${escapeHtml(lanUrl)}
      <button class="btn btn-ghost btn-icon btn-sm" data-copy="${escapeHtml(lanUrl)}" title="Copy LAN address">${icon('copy')}</button></span>`;
  }
}

function areaName(area) {
  if (area === 'home') return 'Overview';
  if (area === 'design-system') return 'Design system';
  return tools.find((tool) => tool.id === area)?.name ?? area;
}

function renderActivity(activity) {
  const lastHour = activity.lastHour.reduce((a, b) => a + b, 0);
  $('traffic').innerHTML = `
    ${cardHead('activity', 'Requests', '<span class="faint">last 60 min</span>')}
    <div class="metric"><span class="stat-value">${lastHour.toLocaleString()}</span></div>
    ${sparkline(activity.lastHour, { type: 'bar', color: 'var(--series-3)' })}
    <span class="stat-meta">${activity.totalRequests.toLocaleString()} since start · ${timeAgo(activity.since)}</span>`;

  const top = activity.perArea[0]?.count ?? 1;
  $('areas').innerHTML = `
    ${cardHead('layers', 'Usage by area')}
    ${
      activity.perArea.length
        ? `<ul class="barlist">${activity.perArea
            .slice(0, 6)
            .map(
              ({ area, count }) => `<li><span class="truncate">${escapeHtml(areaName(area))}</span><span class="mono faint">${count}</span>
                <div class="meter"><span style="--value:${((count / top) * 100).toFixed(1)}%"></span></div></li>`
            )
            .join('')}</ul>`
        : '<p class="muted">No traffic yet.</p>'
    }`;

  const feed = $('feed');
  if (feed) {
    feed.innerHTML = activity.events.length
      ? activity.events
          .slice(0, 12)
          .map(
            (event) => `<li class="row"><span class="row-icon">${icon(EVENT_ICON[event.action] ?? 'activity')}</span>
              <span class="row-main"><span class="row-title">${escapeHtml(event.detail)}</span>
              <span class="row-meta">${escapeHtml(event.action)} · ${escapeHtml(areaName(event.tool))} · ${timeAgo(event.at)}</span></span></li>`
          )
          .join('')
      : '<li class="empty">' + icon('clock') + '<span>Uploads, saves and deletes show up here.</span></li>';
  }
}

function renderStorage(tool, summary) {
  const total = summary.breakdown.reduce((sum, item) => sum + item.value, 0) || 1;
  const color = (i) => `var(--series-${(i % 8) + 1})`;
  $('storage').innerHTML = `
    ${cardHead('folder', `Storage · ${tool.name}`, `<a href="${tool.href}">Open</a>`)}
    <div class="cluster" style="gap: var(--space-8)">
      ${summary.tiles.map((tile) => `<div><div class="stat-value">${escapeHtml(tile.value)}</div><div class="stat-meta">${escapeHtml(tile.label)}</div></div>`).join('')}
    </div>
    ${
      summary.breakdown.length
        ? `<div class="stackbar" role="img" aria-label="Storage by file type">${summary.breakdown
            .map((item, i) => `<span style="--c:${color(i)};flex:${item.value / total}" title="${escapeHtml(item.label)}: ${escapeHtml(item.display)}"></span>`)
            .join('')}</div>
          <ul class="legend">${summary.breakdown
            .map(
              (item, i) => `<li><span class="swatch" style="--c:${color(i)}"></span>${icon(KIND_ICON[item.label] ?? 'file')}
                <span style="text-transform:capitalize">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(item.display)}</span></li>`
            )
            .join('')}</ul>`
        : `<div class="empty">${icon('upload')}<span>No files yet — upload something to get started.</span></div>`
    }`;
}

function renderRecent(summaries) {
  const cards = summaries
    .filter(({ summary }) => summary.recent)
    .map(
      ({ tool, summary }) => `<article class="card span-4">
        ${cardHead(tool.icon, `Recent · ${tool.name}`, `<a href="${tool.href}">View all</a>`)}
        ${
          summary.recent.length
            ? `<ul class="rows">${summary.recent
                .slice(0, 6)
                .map((item) => {
                  const [size, modified] = item.meta.split(' · ');
                  return `<li><a class="row" href="${escapeHtml(item.href)}"><span class="row-icon">${icon(tool.id === 'markdown' ? 'file-text' : 'file')}</span>
                    <span class="row-main"><span class="row-title">${escapeHtml(item.label)}</span>
                    <span class="row-meta">${escapeHtml(size)} · ${modified ? timeAgo(modified) : ''}</span></span></a></li>`;
                })
                .join('')}</ul>`
            : `<div class="empty">${icon(tool.icon)}<span>Nothing here yet.</span></div>`
        }
      </article>`
    );
  $('recent').innerHTML = `${cards.join('')}
    <article class="card span-4">${cardHead('activity', 'Activity')}<ul class="rows feed" id="feed"></ul></article>`;
}

function renderTools(summaries) {
  $('tools').innerHTML = tools
    .map((tool) => {
      const summary = summaries.find((entry) => entry.tool.id === tool.id)?.summary;
      const tiles = summary?.tiles
        .map((tile) => `<span class="badge">${escapeHtml(tile.value)} ${escapeHtml(tile.label.toLowerCase())}</span>`)
        .join('');
      return `<a class="card tool-card" href="${tool.href}">
        <div class="cluster"><span class="row-icon">${icon(tool.icon, 'icon-lg')}</span><span class="spacer"></span>${icon('arrow-right', 'arrow')}</div>
        <h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description)}</p>
        ${tiles ? `<div class="cluster">${tiles}</div>` : ''}</a>`;
    })
    .join('');
}

function renderActions() {
  const actions = tools.flatMap((tool) =>
    tool.quickActions.map(
      (action) => `<a class="action" href="${escapeHtml(action.href)}"><span class="row-icon">${icon(action.icon)}</span>
        <span>${escapeHtml(action.label)}<small>${escapeHtml(tool.name)}</small></span></a>`
    )
  );
  actions.push(`<button type="button" class="action" id="copy-lan"><span class="row-icon">${icon('link')}</span>
    <span>Copy LAN address<small>Open from another device</small></span></button>`);
  $('actions').innerHTML = actions.join('');
}

async function refreshLive() {
  const [system, activity] = await Promise.allSettled([api('/api/system'), api('/api/activity')]);
  const online = system.status === 'fulfilled';
  $('status').textContent = online ? 'Online' : 'Unreachable';
  document.querySelector('.dot').style.background = online ? '' : 'var(--danger)';
  if (online) renderSystem(system.value);
  if (activity.status === 'fulfilled') {
    lastActivity = activity.value;
    renderActivity(lastActivity);
  }
}

// Summaries rebuild the activity card, so the latest snapshot is re-applied after each rebuild.
let lastActivity;
async function refreshSummaries() {
  const entries = await Promise.all(
    tools
      .filter((tool) => tool.summaryUrl)
      .map((tool) =>
        api(tool.summaryUrl)
          .then((summary) => ({ tool, summary }))
          .catch(() => null)
      )
  );
  const summaries = entries.filter(Boolean);
  const storage = summaries.find(({ summary }) => summary.breakdown);
  if (storage) renderStorage(storage.tool, storage.summary);
  renderRecent(summaries);
  renderTools(summaries);
  if (lastActivity) renderActivity(lastActivity);
}

document.addEventListener('click', (event) => {
  const copy = event.target.closest('[data-copy]');
  if (copy) copyText(copy.dataset.copy, 'Address copied');
  if (event.target.closest('#copy-lan')) copyText(lanUrl || location.origin, 'Address copied');
});

tools = await mountShell('home');
renderActions();
await refreshSummaries();
await refreshLive();
setInterval(() => {
  if (document.visibilityState === 'visible') refreshLive();
}, 5000);
setInterval(() => {
  if (document.visibilityState === 'visible') refreshSummaries();
}, 30000);
