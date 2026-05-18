'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
const SQUADS = {
  attack: { label: 'Attack', color: '#ef4444' },
  def:    { label: 'Def',    color: '#3b82f6' }
};

const state = {
  viewMode: 'list', // 'list' | 'grouped' | 'ready'
  filters: {
    builds:    new Set(), // выбранные ключи основного билда
    altBuilds: new Set(), // выбранные ключи альт-билда
    squads:    new Set(), // 'attack' | 'def'
    roles:     new Set(), // строки ролей
    gearMin:   '',
    gearMax:   '',
    readyOnly: false,
    name:      ''
  },
  sort: { field: 'name', dir: 'asc' }
};

/* ─── DOM refs ──────────────────────────────────────────────────────────── */
const $roster       = document.getElementById('roster');
const $legend       = document.getElementById('legend');
const $statsBar     = document.getElementById('stats-bar');
const $search       = document.getElementById('search');
const $buildFilters = document.getElementById('build-filters');
const $altFilters   = document.getElementById('alt-build-filters');
const $gearMin      = document.getElementById('gear-min');
const $gearMax      = document.getElementById('gear-max');
const $readyOnly     = document.getElementById('ready-only');
const $sortField     = document.getElementById('sort-field');
const $sortDir       = document.getElementById('sort-dir');
const $squadFilters  = document.getElementById('squad-filters');
const $roleFilters   = document.getElementById('role-filters');

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function getBuild(key) {
  return (key && BUILDS[key]) || null;
}

function badge(key, alt = false) {
  const b = getBuild(key);
  if (!b) return '';
  if (alt) {
    return `<span class="badge badge--alt" style="border-color:${b.color};color:${b.color}">${esc(b.label)}</span>`;
  }
  return `<span class="badge" style="background:${b.color}">${esc(b.label)}</span>`;
}

function squadBadge(squad) {
  const s = SQUADS[squad];
  if (!s) return '';
  return `<span class="badge badge--squad" style="background:${s.color}">${esc(s.label)}</span>`;
}

function roleBadge(role) {
  return `<span class="badge badge--role">${esc(role)}</span>`;
}

/* ─── Data processing ───────────────────────────────────────────────────── */
function filterPlayers(players) {
  const { builds, altBuilds, squads, roles, gearMin, gearMax, readyOnly, name } = state.filters;
  return players.filter(p => {
    if (name           && !p.name.toLowerCase().includes(name))          return false;
    if (builds.size    && !builds.has(p.build))                          return false;
    if (altBuilds.size && !altBuilds.has(p.altBuild))                    return false;
    if (squads.size    && !squads.has(p.squad ?? '__none__'))             return false;
    if (roles.size) {
      const pr = p.roles || [];
      const hasAny = [...roles].some(r => pr.includes(r));
      if (!hasAny) return false;
    }
    if (gearMin !== '' && p.gearLevel < +gearMin)                        return false;
    if (gearMax !== '' && p.gearLevel > +gearMax)                        return false;
    if (readyOnly      && !p.ready)                                      return false;
    return true;
  });
}

function sortPlayers(players) {
  const { field, dir } = state.sort;
  const m = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    if (field === 'gearLevel') return m * (a.gearLevel - b.gearLevel);
    if (field === 'build') {
      const la = getBuild(a.build)?.label ?? a.build ?? '';
      const lb = getBuild(b.build)?.label ?? b.build ?? '';
      return m * la.localeCompare(lb, 'ru');
    }
    return m * a.name.localeCompare(b.name, 'ru');
  });
}

/* ─── Card ──────────────────────────────────────────────────────────────── */
function playerCard(p) {
  const readyLabel = p.ready
    ? '<span class="ready-status ready">✓ Готов</span>'
    : '<span class="ready-status not-ready">✗ Нет</span>';
  const noteHtml = p.note
    ? `<div class="player-note">${esc(p.note)}</div>`
    : '';
  const roleHtml = (p.roles && p.roles.length)
    ? `<div class="player-roles">${p.roles.map(roleBadge).join('')}</div>`
    : '';
  const squadHtml = p.squad ? squadBadge(p.squad) : '';
  return `<div class="player-card ${p.ready ? 'is-ready' : ''}">
  <div class="card-header">
    <span class="player-name">${esc(p.name)}</span>
    <div class="card-header-right">${squadHtml}${readyLabel}</div>
  </div>
  <div class="card-body">
    <div class="player-badges">${badge(p.build)}${p.altBuild ? badge(p.altBuild, true) : ''}</div>
    <span class="gear-level">⚔ ${esc(String(p.gearLevel))}</span>
  </div>
  ${roleHtml}
  ${noteHtml}
</div>`;
}

/* ─── View renderers ────────────────────────────────────────────────────── */
function viewList(players) {
  if (!players.length) return '<p class="empty">Нет игроков по заданным критериям.</p>';
  return `<div class="player-grid">${players.map(playerCard).join('')}</div>`;
}

function viewGrouped(players) {
  const groups = {};
  // Порядок секций = порядок ключей в BUILDS
  Object.keys(BUILDS).forEach(k => { groups[k] = []; });
  players.forEach(p => {
    if (p.build in groups) {
      groups[p.build].push(p);
    } else {
      groups['__other__'] = groups['__other__'] || [];
      groups['__other__'].push(p);
    }
  });

  const sections = Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([key, arr]) => {
      const b     = BUILDS[key];
      const label = b?.label ?? 'Прочие';
      const color = b?.color ?? '#64748b';
      return `<section class="build-group">
  <h2 class="group-header" style="border-color:${color}">
    <span class="badge" style="background:${color}">${esc(label)}</span>
    <span class="group-count">${arr.length} игр.</span>
  </h2>
  <div class="player-grid">${arr.map(playerCard).join('')}</div>
</section>`;
    });

  return sections.length
    ? sections.join('\n')
    : '<p class="empty">Нет игроков.</p>';
}

function viewReady(players) {
  const readyPlayers = players.filter(p => p.ready);

  // Сводка по билдам
  const counts = {};
  readyPlayers.forEach(p => { counts[p.build] = (counts[p.build] || 0) + 1; });
  const pills = Object.entries(counts).map(([k, n]) => {
    const b = BUILDS[k];
    if (!b) return '';
    return `<span class="stat-pill" style="background:${b.color}">${esc(b.label)}: ${n}</span>`;
  }).join('');

  $statsBar.innerHTML = `<div class="stats-summary">
  <strong>Готовы: ${readyPlayers.length}</strong>${pills ? ' ' + pills : ''}
</div>`;
  $statsBar.classList.remove('hidden');

  return viewGrouped(readyPlayers);
}

/* ─── Main render ───────────────────────────────────────────────────────── */
function render() {
  $statsBar.classList.add('hidden');
  const filtered = filterPlayers(PLAYERS);
  const sorted   = sortPlayers(filtered);

  switch (state.viewMode) {
    case 'grouped': $roster.innerHTML = viewGrouped(sorted); break;
    case 'ready':   $roster.innerHTML = viewReady(sorted);   break;
    default:        $roster.innerHTML = viewList(sorted);
  }
}

/* ─── Legend & Pills ────────────────────────────────────────────────────── */
function initLegend() {
  const entries = Object.entries(BUILDS);
  if (!entries.length) {
    $legend.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">Билды не настроены — заполните BUILDS в data.js</span>';
    return;
  }

  // Group by category preserving order
  const catOrder = ['Heal', 'DD', 'Tank'];
  const groups = {};
  entries.forEach(([, b]) => {
    const cat = b.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(b);
  });

  const cats = [...catOrder, ...Object.keys(groups).filter(c => !catOrder.includes(c))];
  $legend.innerHTML = cats
    .filter(cat => groups[cat])
    .map(cat => {
      const items = groups[cat].map(b => {
        const tips = b.techniques ? b.techniques.join(' · ') : '';
        return `<div class="legend-item" title="${esc(tips)}">
  <span class="badge" style="background:${b.color}">${esc(b.label)}</span>
  ${tips ? `<span class="legend-tech">${esc(tips)}</span>` : ''}
</div>`;
      }).join('');
      return `<div class="legend-cat"><span class="legend-cat-label">${esc(cat)}</span>${items}</div>`;
    })
    .join('');
}

function initBuildPills() {
  const makePills = (container, filterKey) => {
    container.innerHTML = Object.entries(BUILDS).map(([key, b]) =>
      `<button class="pill" data-key="${esc(key)}" data-filter="${filterKey}" style="--pill-color:${b.color}">${esc(b.label)}</button>`
    ).join('');
  };
  makePills($buildFilters, 'builds');
  makePills($altFilters,   'altBuilds');
}

function initSquadPills() {
  $squadFilters.innerHTML = Object.entries(SQUADS).map(([key, s]) =>
    `<button class="pill" data-key="${esc(key)}" data-filter="squads" style="--pill-color:${s.color}">${esc(s.label)}</button>`
  ).join('')
  + `<button class="pill" data-key="__none__" data-filter="squads" style="--pill-color:#64748b">Не распределён</button>`;
}

function initRolePills() {
  const allRoles = [...new Set(PLAYERS.flatMap(p => p.roles || []))];
  $roleFilters.innerHTML = allRoles.map(r =>
    `<button class="pill" data-key="${esc(r)}" data-filter="roles" style="--pill-color:#94a3b8">${esc(r)}</button>`
  ).join('');
  if (!allRoles.length) $roleFilters.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem">нет ролей</span>';
}

/* ─── Events ────────────────────────────────────────────────────────────── */
function initEvents() {
  // Вкладки режима
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t === btn);
        t.setAttribute('aria-selected', String(t === btn));
      });
      render();
    });
  });

  // Поиск по имени (с небольшой задержкой)
  let searchTimer;
  $search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.name = $search.value.trim().toLowerCase();
      render();
    }, 150);
  });

  // Пиллы фильтров (делегирование)
  document.addEventListener('click', e => {
    const pill = e.target.closest('.pill[data-filter]');
    if (!pill) return;
    const { key, filter } = pill.dataset;
    const setMap = {
      builds:    state.filters.builds,
      altBuilds: state.filters.altBuilds,
      squads:    state.filters.squads,
      roles:     state.filters.roles
    };
    const set = setMap[filter];
    if (!set) return;
    if (set.has(key)) set.delete(key); else set.add(key);
    pill.classList.toggle('active', set.has(key));
    render();
  });

  // Уровень шмота
  $gearMin.addEventListener('input', () => { state.filters.gearMin = $gearMin.value; render(); });
  $gearMax.addEventListener('input', () => { state.filters.gearMax = $gearMax.value; render(); });

  // Только готовые
  $readyOnly.addEventListener('change', () => { state.filters.readyOnly = $readyOnly.checked; render(); });

  // Сортировка
  $sortField.addEventListener('change', () => { state.sort.field = $sortField.value; render(); });
  $sortDir.addEventListener('click', () => {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    $sortDir.textContent = state.sort.dir === 'asc' ? '↑' : '↓';
    render();
  });

  // Сброс фильтров
  document.getElementById('reset-filters').addEventListener('click', () => {
    state.filters = { builds: new Set(), altBuilds: new Set(), squads: new Set(), roles: new Set(), gearMin: '', gearMax: '', readyOnly: false, name: '' };
    $search.value      = '';
    $gearMin.value     = '';
    $gearMax.value     = '';
    $readyOnly.checked = false;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    render();
  });

  // Легенда
  const $legendToggle = document.getElementById('legend-toggle');
  $legendToggle.addEventListener('click', () => {
    const hidden = $legend.classList.toggle('hidden');
    $legendToggle.querySelector('.legend-arrow').textContent = hidden ? '▸' : '▾';
    $legendToggle.setAttribute('aria-expanded', String(!hidden));
  });
}

/* ─── Bootstrap ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLegend();
  initBuildPills();
  initSquadPills();
  initRolePills();
  initEvents();
  render();
});
