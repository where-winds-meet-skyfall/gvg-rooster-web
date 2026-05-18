'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
const SQUADS = {
  attack: { label: 'Attack', color: '#ef4444' },
  def:    { label: 'Def',    color: '#3b82f6' }
};

const GEAR_TIERS = {
  low:  { label: 'Низький',  color: '#64748b' },
  mid:  { label: 'Середній', color: '#f59e0b' },
  high: { label: 'Високий',  color: '#22c55e' }
};

const state = {
  viewMode: 'list', // 'list' | 'grouped' | 'battle'
  filters: {
    builds:    new Set(), // обрані ключі основного білда
    altBuilds: new Set(), // обрані ключі альт-білда
    squads:    new Set(), // 'attack' | 'def'
    roles:     new Set(), // рядки ролей
    gears:     new Set(),
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
const $gearFilters  = document.getElementById('gear-filters');
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

const ROLE_ICONS = {
  'officer': '👑',
  'Jungle':  '🌿',
  'ninja':   '🥷',
};

function roleBadge(role) {
  const icon = ROLE_ICONS[role] ?? '';
  return `<span class="badge badge--role">${icon ? icon + ' ' : ''}${esc(role)}</span>`;
}

function gearBadge(level) {
  const t = GEAR_TIERS[level];
  if (!t) return level ? `<span class="gear-level">⚔ ${esc(String(level))}</span>` : '';
  return `<span class="gear-badge" style="border-color:${t.color};color:${t.color}">⚔ ${esc(t.label)}</span>`;
}

/* ─── Data processing ───────────────────────────────────────────────────── */
function filterPlayers(players) {
  const { builds, altBuilds, squads, roles, gears, readyOnly, name } = state.filters;
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
    if (gears.size     && !gears.has(p.gearLevel))                       return false;
    if (readyOnly      && !p.ready)                                      return false;
    return true;
  });
}

function sortPlayers(players) {
  const { field, dir } = state.sort;
  const m = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    if (field === 'gearLevel') {
      const ord = { low: 0, mid: 1, high: 2 };
      return m * ((ord[a.gearLevel] ?? 1) - (ord[b.gearLevel] ?? 1));
    }
    if (field === 'build') {
      const la = getBuild(a.build)?.label ?? a.build ?? '';
      const lb = getBuild(b.build)?.label ?? b.build ?? '';
      return m * la.localeCompare(lb, 'uk');
    }
    return m * a.name.localeCompare(b.name, 'uk');
  });
}

/* ─── Card ──────────────────────────────────────────────────────────────── */
function playerCard(p) {
  const readyLabel = p.ready
    ? '<span class="ready-status ready">✓ Готовий</span>'
    : '<span class="ready-status not-ready">✗ Ні</span>';
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
    ${gearBadge(p.gearLevel)}
  </div>
  ${roleHtml}
  ${noteHtml}
</div>`;
}

/* ─── View renderers ────────────────────────────────────────────────────── */
function viewList(players) {
  if (!players.length) return '<p class="empty">Немає гравців за заданими критеріями.</p>';
  return `<div class="player-grid">${players.map(playerCard).join('')}</div>`;
}

function viewGrouped(players) {
  const groups = {};
  // Порядок секцій = порядок ключів у BUILDS
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
      const label = b?.label ?? 'Інші';
      const color = b?.color ?? '#64748b';
      return `<details class="build-group">
  <summary class="group-header" style="border-color:${color}">
    <span class="badge" style="background:${color}">${esc(label)}</span>
    <span class="group-count">${arr.length} гравців</span>
  </summary>
  <div class="player-grid">${arr.map(playerCard).join('')}</div>
</details>`;
    });

  return sections.length
    ? sections.join('\n')
    : '<p class="empty">Немає гравців.</p>';
}

/* ─── Battle View ───────────────────────────────────────────────────────── */
function battlePlayerRow(p) {
  const noteHtml  = p.note ? `<span class="battle-player-note">${esc(p.note)}</span>` : '';
  const roleHtml  = (p.roles && p.roles.length)
    ? `<div class="battle-player-extras">${p.roles.map(roleBadge).join('')}</div>`
    : '';
  return `<div class="battle-player-row">
  <span class="battle-player-name">${esc(p.name)}</span>
  <div class="battle-player-badges">${badge(p.build)}${p.altBuild ? badge(p.altBuild, true) : ''}</div>
  <span class="battle-gear">${gearBadge(p.gearLevel)}</span>
  ${roleHtml}${noteHtml}
</div>`;
}

function renderBattleSquad(squad, players) {
  const squadInfo = squad ? SQUADS[squad] : { label: 'Нерозподілені', color: '#64748b' };
  const icon = squad === 'attack' ? '⚔' : squad === 'def' ? '🛡' : '?';

  // Group by build (preserving BUILDS order)
  const groups = {};
  Object.keys(BUILDS).forEach(k => { groups[k] = []; });
  players.forEach(p => {
    if (p.build in groups) groups[p.build].push(p);
    else { groups['__other__'] = groups['__other__'] || []; groups['__other__'].push(p); }
  });

  const buildSections = Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([key, arr]) => {
      const b     = BUILDS[key];
      const label = b?.label ?? 'Інші';
      const color = b?.color ?? '#64748b';
      return `<div class="battle-build-group">
  <div class="battle-build-header" style="border-color:${color}">
    <span class="badge" style="background:${color}">${esc(label)}</span>
    <span class="group-count">${arr.length}</span>
  </div>
  <div class="battle-rows">${arr.map(battlePlayerRow).join('')}</div>
</div>`;
    });

  return `<section class="battle-squad-section">
  <h2 class="battle-squad-header" style="--squad-color:${squadInfo.color}">
    <span class="battle-squad-icon">${icon}</span>
    <span class="battle-squad-name">${esc(squadInfo.label)}</span>
    <span class="group-count">${players.length} гравців</span>
  </h2>
  <div class="battle-builds">${buildSections.join('\n')}</div>
</section>`;
}

function viewBattle(players) {
  const ready = players.filter(p => p.ready);
  if (!ready.length) return '<p class="empty">Немає готових гравців.</p>';

  const attack  = ready.filter(p => p.squad === 'attack');
  const def     = ready.filter(p => p.squad === 'def');
  const noSquad = ready.filter(p => !p.squad);

  // Stats bar
  const counts = {};
  ready.forEach(p => { counts[p.build] = (counts[p.build] || 0) + 1; });
  const buildPills = Object.entries(counts).map(([k, n]) => {
    const b = BUILDS[k];
    return b ? `<span class="stat-pill" style="background:${b.color}">${esc(b.label)}: ${n}</span>` : '';
  }).join('');

  $statsBar.innerHTML = `<div class="stats-summary">
  <strong>Готові: ${ready.length}</strong>
  ${attack.length  ? `<span class="stat-pill" style="background:#ef4444">Attack: ${attack.length}</span>`  : ''}
  ${def.length     ? `<span class="stat-pill" style="background:#3b82f6">Def: ${def.length}</span>`        : ''}
  ${noSquad.length ? `<span class="stat-pill" style="background:#64748b">?: ${noSquad.length}</span>`      : ''}
  ${buildPills}
</div>`;
  $statsBar.classList.remove('hidden');

  const sections = [];
  if (attack.length)  sections.push(renderBattleSquad('attack', attack));
  if (def.length)     sections.push(renderBattleSquad('def',    def));
  if (noSquad.length) sections.push(renderBattleSquad(null,     noSquad));

  return sections.join('\n');
}

/* ─── Main render ───────────────────────────────────────────────────────── */
function render() {
  $statsBar.classList.add('hidden');
  const filtered = filterPlayers(PLAYERS);
  const sorted   = sortPlayers(filtered);

  switch (state.viewMode) {
    case 'grouped': $roster.innerHTML = viewGrouped(sorted); break;
    case 'battle':  $roster.innerHTML = viewBattle(sorted);  break;
    default:        $roster.innerHTML = viewList(sorted);
  }
}

/* ─── Legend & Pills ────────────────────────────────────────────────────── */
function initLegend() {
  const entries = Object.entries(BUILDS);
  if (!entries.length) {
    $legend.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">Білди не налаштовані — заповніть BUILDS у data.js</span>';
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
  + `<button class="pill" data-key="__none__" data-filter="squads" style="--pill-color:#64748b">Нерозподілені</button>`;
}

function initRolePills() {
  const allRoles = [...new Set(PLAYERS.flatMap(p => p.roles || []))];
  $roleFilters.innerHTML = allRoles.map(r =>
    `<button class="pill" data-key="${esc(r)}" data-filter="roles" style="--pill-color:#94a3b8">${esc(r)}</button>`
  ).join('');
  if (!allRoles.length) $roleFilters.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem">немає ролей</span>';
}

function initGearPills() {
  $gearFilters.innerHTML = Object.entries(GEAR_TIERS).map(([key, t]) =>
    `<button class="pill" data-key="${esc(key)}" data-filter="gears" style="--pill-color:${t.color}">${esc(t.label)}</button>`
  ).join('');
}

/* ─── Events ────────────────────────────────────────────────────────────── */
function initEvents() {
  // Вкладки режиму
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

  // Пошук за іменем (з невеликою затримкою)
  let searchTimer;
  $search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.name = $search.value.trim().toLowerCase();
      render();
    }, 150);
  });

  // Пільи фільтрів (делегування)
  document.addEventListener('click', e => {
    const pill = e.target.closest('.pill[data-filter]');
    if (!pill) return;
    const { key, filter } = pill.dataset;
    const setMap = {
      builds:    state.filters.builds,
      altBuilds: state.filters.altBuilds,
      squads:    state.filters.squads,
      roles:     state.filters.roles,
      gears:     state.filters.gears
    };
    const set = setMap[filter];
    if (!set) return;
    if (set.has(key)) set.delete(key); else set.add(key);
    pill.classList.toggle('active', set.has(key));
    render();
  });

  // Тільки готові
  $readyOnly.addEventListener('change', () => { state.filters.readyOnly = $readyOnly.checked; render(); });

  // Сортування
  $sortField.addEventListener('change', () => { state.sort.field = $sortField.value; render(); });
  $sortDir.addEventListener('click', () => {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    $sortDir.textContent = state.sort.dir === 'asc' ? '↑' : '↓';
    render();
  });

  // Скидання фільтрів
  document.getElementById('reset-filters').addEventListener('click', () => {
    state.filters = { builds: new Set(), altBuilds: new Set(), squads: new Set(), roles: new Set(), gears: new Set(), readyOnly: false, name: '' };
    $search.value      = '';
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
  initGearPills();
  initEvents();
  render();
});
