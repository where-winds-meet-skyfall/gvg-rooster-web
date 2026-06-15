'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
const SQUADS = {
  attack: { label: 'Attack', color: '#ef4444' },
  def:    { label: 'Defence',    color: '#3b82f6' }
};

const GEAR_TIERS = {
  low:  { label: 'Потужний',      color: '#64748b' },
  mid:  { label: 'Дуже потужний', color: '#f59e0b' },
  high: { label: 'Легенда',       color: '#22c55e' }
};

const state = {
  viewMode: 'list', // 'list' | 'grouped' | 'battle' | 'strategy' | 'editor'
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

let _playersInFirebase = false;

function playersToFirebaseMap(list) {
  const map = {};
  list.forEach(p => {
    map[p.name] = {
      build:     p.build,
      altBuild:  p.altBuild ?? null,
      gearLevel: p.gearLevel,
      ready:     !!p.ready,
      squad:     p.squad ?? null,
      roles:     Array.isArray(p.roles) ? p.roles : [],
      note:      p.note || '',
      device:           p.device || '',
      mainRole:         p.mainRole || '',
      arenaRank:        p.arenaRank || '',
      prevSeasonMythic: !!p.prevSeasonMythic,
      mastery:          p.mastery ?? null,
    };
  });
  return map;
}

function applyFirebasePlayers(data) {
  if (!data) { _playersInFirebase = false; return; }
  _playersInFirebase = true;
  PLAYERS.length = 0;
  Object.entries(data).forEach(([name, p]) => {
    PLAYERS.push({
      name,
      build:     p.build     || Object.keys(BUILDS)[0],
      altBuild:  p.altBuild  ?? null,
      gearLevel: p.gearLevel || 'mid',
      ready:     p.ready     ?? true,
      squad:     p.squad     ?? null,
      roles:     Array.isArray(p.roles) ? p.roles : [],
      note:      p.note      || '',
      device:           p.device   || '',
      mainRole:         p.mainRole || '',
      arenaRank:        p.arenaRank || '',
      prevSeasonMythic: !!p.prevSeasonMythic,
      mastery:          p.mastery ?? null,
    });
  });
}

function syncSquadsFromSlots() {
  if (!battleSlots) return;
  PLAYERS.forEach(p => { p.squad = null; });
  for (const sq of ['attack', 'def']) {
    for (const zone of ['main', 'reserve']) {
      battleSlots[sq][zone].forEach(name => {
        if (!name) return;
        const p = PLAYERS.find(x => x.name === name);
        if (p) p.squad = sq;
      });
    }
  }
}

async function savePlayerData(name, data, originalName) {
  if (!fbIsAuthed()) return;
  if (_playersInFirebase) {
    if (originalName && originalName !== name) {
      await fbDeletePlayer(originalName);
    }
    await fbSavePlayer(name, data);
  } else {
    const map = playersToFirebaseMap(PLAYERS);
    if (originalName && originalName !== name) delete map[originalName];
    map[name] = data;
    await fbSaveAllPlayers(map);
  }
}

async function deletePlayerData(name) {
  if (!fbIsAuthed()) return;
  if (_playersInFirebase) {
    await fbDeletePlayer(name);
  } else {
    const map = playersToFirebaseMap(PLAYERS);
    delete map[name];
    await fbSaveAllPlayers(map);
  }
}

let battleEditMode = false;
const battleReserves = new Set(); // імена гравців у резервному слоті
let battleSlots = null;           // { attack: { main:[×20], reserve:[×5] }, def: same }
let _battleSquadSnapshot = null;  // для кнопки «скинути»
const battleSidebarFilter = { search: '', builds: new Set(), squads: new Set() };
const svSidebarFilter     = { search: '', builds: new Set(), squads: new Set() };

let battlePresets = {};
let activeBattlePresetId = null;

let strategyPresets = {};
let activeStrategyPresetId = null;

const BATTLE_STATE_KEY = 'gvg-battle-state';
const PLAYERS_CACHE_KEY = 'gvg-players'; // кеш списку гравців із Firebase — щоб не блимало старе число з data.js

// Початковий стан пачок (відповідає скрину 19.05.2026)
const INITIAL_BATTLE_STATE = {
  slots: {
    attack: {
      main: [
        'arhangels', 'OldRock', 'DzirT', 'datsann', 'Endurist',
        'Jianggi', 'LuoJue-Lin', 'Kelevra', 'SunRise', 'Geerion',
        'LuthiXia', 'StanislavZal', 'BayarD', 'EnEr', 'CantBeTouched',
        'Nixmoonky', null, null, null, null
      ],
      reserve: ['Сreckadrenalin ', null, null, null, null]
    },
    def: {
      main: [
        'Nanaaaaami', 'MasterFoobar', 'MariSkywalker', 'lHanLil', 'CyMþak',
        'LuminarA', 'LELUSH', 'Chifusama', 'Espeir', 'QiShye',
        'Aiswill', 'AUrory', 'PonIka', 'ArthurPencilgun', null,
        null, null, null, null, null
      ],
      reserve: ['Kirito_AL', 'BlindMary', null, null, null]
    }
  },
  reserves: ['Сreckadrenalin ', 'Kirito_AL', 'BlindMary']
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

// Firebase omits null array entries — fillNull відновлює їх при читанні,
// а mapNull очищує undefined перед записом.
function fillNull(src, len) {
  const out = Array(len).fill(null);
  if (Array.isArray(src)) src.forEach((v, i) => { if (i < len) out[i] = v ?? null; });
  return out;
}
function mapNull(arr) { return arr.map(v => v ?? null); }

function saveBattleState() {
  if (!battleSlots) return;
  const data = {
    slots: {
      attack: { main: mapNull(battleSlots.attack.main), reserve: mapNull(battleSlots.attack.reserve) },
      def:    { main: mapNull(battleSlots.def.main),    reserve: mapNull(battleSlots.def.reserve) }
    },
    reserves: [...battleReserves]
  };
  // Зберігаємо в Firebase (тільки для авторизованих)
  if (typeof fbSaveBattleState === 'function' && fbIsAdmin()) {
    fbSaveBattleState(data);
  }
  // Кешуємо локально для швидкого першого рендеру
  try { localStorage.setItem(BATTLE_STATE_KEY, JSON.stringify(data)); } catch {}
}

function applyBattleState(saved) {
  if (!saved) saved = INITIAL_BATTLE_STATE;
  battleSlots = {
    attack: { main: fillNull(saved.slots.attack.main, 20), reserve: fillNull(saved.slots.attack.reserve, 5) },
    def:    { main: fillNull(saved.slots.def.main, 20),    reserve: fillNull(saved.slots.def.reserve, 5) }
  };
  battleReserves.clear();
  (saved.reserves || []).forEach(name => { if (name) battleReserves.add(name); });
  PLAYERS.forEach(p => { p.squad = null; });
  for (const sq of ['attack', 'def']) {
    for (const zone of ['main', 'reserve']) {
      battleSlots[sq][zone].forEach(name => {
        if (!name) return;
        const p = PLAYERS.find(x => x.name === name);
        if (p) p.squad = sq;
      });
    }
  }
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

function buildIconHtml(key, isAlt = false) {
  const b = getBuild(key);
  if (!b) return '';
  const icon = b.label.split(' ')[0];
  const name = b.label.replace(/^\S+\s*/, '');
  const cls  = isAlt ? 'sv-build-icon sv-build-icon--alt' : 'sv-build-icon';
  return `<span class="${cls}" style="--bc:${b.color}" title="${esc(name)}">${icon}</span>`;
}

/* ─── Shared sidebar helpers ────────────────────────────────────────────── */
function getCurrentSidebarFilter() {
  return state.viewMode === 'strategy' ? svSidebarFilter : battleSidebarFilter;
}

function buildSidebarStickyHtml(title, filterState) {
  const usedKeys = new Set(PLAYERS.map(p => p.build).filter(Boolean));
  const filtersHtml = Object.entries(BUILDS)
    .filter(([key]) => usedKeys.has(key))
    .map(([key, b]) => {
      const active = filterState.builds.has(key) ? ' bv-filter-active' : '';
      return `<span class="sv-build-icon${active}" data-action="bv-build-filter" data-build-key="${esc(key)}" style="--bc:${b.color};cursor:pointer" title="${esc(b.label.replace(/^\S+\s*/, ''))}">${esc(b.label.split(' ')[0])}</span>`;
    }).join('');
  const squadBtns = [
    { key: 'attack', label: '⚔', title: 'Атака',  color: '#ef4444' },
    { key: 'def',    label: '🛡', title: 'Захист', color: '#3b82f6' },
    { key: 'free',   label: '🔄', title: 'Вільні', color: '#64748b' },
  ].map(({ key, label, title, color }) => {
    const active = filterState.squads.has(key) ? ' bv-filter-active' : '';
    return `<span class="sv-build-icon${active}" data-action="bv-squad-filter" data-squad-key="${key}" style="--bc:${color};cursor:pointer" title="${title}">${label}</span>`;
  }).join('');
  return `<div class="bv-sidebar-sticky">
    <div class="bv-sidebar-hdr">${esc(title)}</div>
    <div class="bv-sidebar-build-filters">${filtersHtml}</div>
    <div class="bv-sidebar-squad-filters">${squadBtns}</div>
    <div class="bv-sidebar-search-wrap">
      <input class="bv-sidebar-search" type="text" placeholder="Пошук…" autocomplete="off" value="${esc(filterState.search)}">
    </div>
  </div>`;
}

function squadRowClass(p) {
  return p.squad === 'attack' ? 'bv-row-attack' : p.squad === 'def' ? 'bv-row-def' : 'bv-row-free';
}

function squadSortedPlayers() {
  return [...PLAYERS].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

function squadBadge(squad) {
  const s = SQUADS[squad];
  if (!s) return '';
  return `<span class="badge badge--squad" style="background:${s.color}">${esc(s.label)}</span>`;
}

const ROLE_ICONS = {
  'Officer': '👑',
  'Jungle':  '🌿',
  'Ninja':   '🥷',
};

const ROLE_DESCRIPTIONS = {
  'Officer': {
    icon: '👑',
    desc: 'Управляє командними абілками, командує в голосі'
  },
  'Jungle': {
    icon: '🌿',
    desc: 'Чистить ліс на старті (якщо на вежі), менеджить ліс по таймінгах'
  },
  'Ninja': {
    icon: '🥷',
    desc: 'Загін швидкого реагування'
  },
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
  const isAdmin = typeof fbIsAdmin === 'function' && fbIsAdmin();
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
  const editBtn = isAdmin
    ? `<button class="btn-card-edit" data-action="edit-player" data-player="${esc(p.name)}" title="Редагувати гравця">✏</button>`
    : '';
  return `<div class="player-card ${p.ready ? 'is-ready' : ''}">
  <div class="card-header">
    <span class="player-name">${esc(p.name)}</span>
    <div class="card-header-right">${editBtn}${squadHtml}${readyLabel}</div>
  </div>
  <div class="card-body">
    <div class="player-badges">${badge(p.build)}${p.altBuild ? badge(p.altBuild, true) : ''}</div>
    ${gearBadge(p.gearLevel)}
  </div>
  ${roleHtml}
  ${noteHtml}
</div>`;
}

/* ─── Export / Import ───────────────────────────────────────────────────── */
function exportPlayers() {
  const data = PLAYERS.map(({ name, build, altBuild, gearLevel, ready, squad, roles, note,
                             device, mainRole, arenaRank, prevSeasonMythic, mastery }) => ({
    name, build, altBuild: altBuild ?? null, gearLevel,
    ready: !!ready, squad: squad ?? null,
    roles: roles || [], note: note || '',
    device: device || '', mainRole: mainRole || '', arenaRank: arenaRank || '',
    prevSeasonMythic: !!prevSeasonMythic, mastery: mastery ?? null,
  }));
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gvg-roster-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importPlayers(file) {
  let arr;
  try {
    arr = JSON.parse(await file.text());
  } catch {
    alert('Помилка: файл не є валідним JSON');
    return;
  }
  if (!Array.isArray(arr) || !arr.length) {
    alert('Помилка: очікується непорожній масив гравців');
    return;
  }
  const validBuilds = new Set(Object.keys(BUILDS));
  const seen = new Set();
  for (const p of arr) {
    if (!p.name || typeof p.name !== 'string') { alert('Помилка: кожен гравець повинен мати поле name'); return; }
    if (!p.build || !validBuilds.has(p.build)) { alert(`Помилка: невідомий білд "${p.build}" у гравця ${p.name}`); return; }
    if (seen.has(p.name)) { alert(`Помилка: дублікат імені "${p.name}"`); return; }
    seen.add(p.name);
  }
  if (!confirm(`Замінити поточних ${PLAYERS.length} гравців на ${arr.length} з файлу?`)) return;
  const map = {};
  arr.forEach(p => {
    map[p.name] = {
      build:     p.build,
      altBuild:  p.altBuild  ?? null,
      gearLevel: p.gearLevel || 'mid',
      ready:     p.ready     ?? true,
      squad:     p.squad     ?? null,
      roles:     Array.isArray(p.roles) ? p.roles : [],
      note:      p.note      || '',
      device:           p.device   || '',
      mainRole:         p.mainRole || '',
      arenaRank:        p.arenaRank || '',
      prevSeasonMythic: !!p.prevSeasonMythic,
      mastery:          p.mastery ?? null,
    };
  });
  try {
    await fbSaveAllPlayers(map);
  } catch (err) {
    alert('Помилка збереження: ' + (err?.message ?? err));
  }
}

/* ─── View renderers ────────────────────────────────────────────────────── */
function viewList(players) {
  const isAdmin = typeof fbIsAdmin === 'function' && fbIsAdmin();
  const adminBar = isAdmin ? `<div class="admin-toolbar">
    <button class="btn-admin-action" data-action="export-players">⤓ Експорт JSON</button>
    <label class="btn-admin-action btn-admin-import">
      ↑ Імпорт JSON
      <input type="file" accept=".json" class="import-file-input" style="display:none">
    </label>
  </div>` : '';
  const grid = players.length
    ? `<div class="player-grid">${players.map(playerCard).join('')}</div>`
    : '<p class="empty">Немає гравців за заданими критеріями.</p>';
  return adminBar + grid;
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

/* ─── Editor (Excel-подібна таблиця) ────────────────────────────────────── */
let editorSort = { field: 'name', dir: 'asc' };

// Колонки редактора: field — ключ гравця, sortable — чи клікабельний заголовок
const EDITOR_COLUMNS = [
  { field: 'name',             label: "Ім'я",      sortable: true },
  { field: 'build',            label: 'GvG білд',  sortable: true },
  { field: 'altBuild',         label: 'Альт білд',      sortable: true },
  { field: 'device',           label: 'Пристрій',  sortable: true },
  { field: 'gearLevel',        label: 'Потужність', sortable: true },
  { field: 'prevSeasonMythic', label: 'Mythic',    sortable: true },
  { field: 'ready',            label: 'Активний',    sortable: true },
  { field: 'squad',            label: 'Пачка',     sortable: true },
  { field: 'note',             label: 'Нотатка',   sortable: false },
];

// Значення для сортування: повертає число або рядок залежно від поля
function editorSortValue(p, field) {
  switch (field) {
    case 'build':
    case 'altBuild': return (BUILDS[p[field]]?.label ?? '').toLowerCase();
    case 'gearLevel': return Object.keys(GEAR_TIERS).indexOf(p.gearLevel);
    case 'arenaRank': return ARENA_RANKS.indexOf(p.arenaRank);
    case 'mastery':   return p.mastery ?? -1;
    case 'prevSeasonMythic':
    case 'ready':     return p[field] ? 1 : 0;
    default:          return (p[field] ?? '').toString().toLowerCase();
  }
}

function editorSortedPlayers() {
  const { field, dir } = editorSort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...PLAYERS].sort((a, b) => {
    const va = editorSortValue(a, field), vb = editorSortValue(b, field);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
    return String(va).localeCompare(String(vb), 'uk') * mult;
  });
}

function edSelect(name, field, value, options) {
  const cur = value ?? '';
  const opts = options.map(o => {
    const val = typeof o === 'object' ? o.value : o;
    const lab = typeof o === 'object' ? o.label : o;
    return `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(lab || '—')}</option>`;
  }).join('');
  return `<select class="ed-input" data-ed-name="${esc(name)}" data-ed-field="${field}">${opts}</select>`;
}

function viewEditor() {
  // Редактор відкривається лише за прихованим рутом /aurora-forge/ — доступ = знання URL.
  // Запис іде під анонімним входом (fbSignInAnon), окремий логін не потрібен.
  const seedBar = !_playersInFirebase
    ? `<div class="editor-seedbar">
        <span>Дані ще не залиті у Firebase — джерело поки data.js.</span>
        <button class="btn-admin-action" data-action="editor-seed">⬆ Залити у Firebase</button>
      </div>`
    : '';

  const buildOpts     = Object.entries(BUILDS).map(([k, b]) => ({ value: k, label: b.label }));
  const buildOptsOpt  = [{ value: '', label: '—' }, ...buildOpts];
  const gearOpts      = Object.entries(GEAR_TIERS).map(([k, t]) => ({ value: k, label: t.label }));
  const squadOpts     = [{ value: '', label: '—' }, { value: 'attack', label: 'Attack' }, { value: 'def', label: 'Defence' }];
  const deviceOpts    = [{ value: '', label: '—' }, ...DEVICE_OPTIONS.map(d => ({ value: d, label: d }))];

  const rows = editorSortedPlayers()
    .map(p => `<tr>
      <td class="ed-name"><input class="ed-input ed-input--name" value="${esc(p.name)}" data-ed-name="${esc(p.name)}" data-ed-field="name"></td>
      <td>${edSelect(p.name, 'build', p.build, buildOpts)}</td>
      <td>${edSelect(p.name, 'altBuild', p.altBuild, buildOptsOpt)}</td>
      <td>${edSelect(p.name, 'device', p.device, deviceOpts)}</td>
      <td>${edSelect(p.name, 'gearLevel', p.gearLevel, gearOpts)}</td>
      <td class="ed-center"><input type="checkbox" data-ed-name="${esc(p.name)}" data-ed-field="prevSeasonMythic"${p.prevSeasonMythic ? ' checked' : ''}></td>
      <td class="ed-center"><input type="checkbox" data-ed-name="${esc(p.name)}" data-ed-field="ready"${p.ready ? ' checked' : ''}></td>
      <td class="ed-squad ed-squad--${p.squad === 'attack' ? 'attack' : p.squad === 'def' ? 'def' : 'none'}">${edSelect(p.name, 'squad', p.squad, squadOpts)}</td>
      <td><input class="ed-input" value="${esc(p.note || '')}" data-ed-name="${esc(p.name)}" data-ed-field="note"></td>
      <td class="ed-center"><button class="ed-del" data-action="editor-del" data-ed-name="${esc(p.name)}" title="Видалити гравця">✕</button></td>
    </tr>`).join('');

  const headCells = EDITOR_COLUMNS.map(c => {
    if (!c.sortable) return `<th>${esc(c.label)}</th>`;
    const active = editorSort.field === c.field;
    const arrow = active ? (editorSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="ed-th-sort${active ? ' is-sorted' : ''}" data-ed-sort="${c.field}">${esc(c.label)}${arrow}</th>`;
  }).join('') + '<th></th>';

  const toolbar = `<div class="editor-toolbar">
    <button class="btn-admin-action" data-action="editor-add">+ Додати гравця</button>
    <button class="btn-admin-action" data-action="editor-export-excel">⤓ Експорт Excel</button>
    <button class="btn-admin-action" data-action="editor-export-csv">⤓ Експорт CSV</button>
    <span class="editor-count">${PLAYERS.length} гравців</span>
  </div>`;

  return seedBar + toolbar + `<div class="editor-wrap"><table class="editor-table">
    <thead><tr>${headCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

async function editorWriteField(name, field, rawValue) {
  if (!fbIsAuthed()) return;
  const p = PLAYERS.find(x => x.name === name);
  if (!p) return;
  let value = rawValue;
  if (field === 'prevSeasonMythic' || field === 'ready') value = !!rawValue;
  else if (field === 'mastery')                          value = rawValue === '' ? null : Number(rawValue);
  else if (field === 'altBuild' || field === 'squad')    value = rawValue || null;
  p[field] = value; // оптимістичне локальне оновлення
  try {
    if (_playersInFirebase) await fbSavePlayerField(name, field, value);
    else                    await fbSaveAllPlayers(playersToFirebaseMap(PLAYERS));
  } catch (err) {
    alert('Не вдалося зберегти: ' + (err?.message ?? err));
  }
}

async function editorRename(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName) { render(); return; }
  if (PLAYERS.some(x => x.name === newName)) {
    alert('Гравець з таким іменем уже існує');
    render();
    return;
  }
  const p = PLAYERS.find(x => x.name === oldName);
  if (!p) return;
  p.name = newName;
  const data = playersToFirebaseMap([p])[newName];
  try {
    await savePlayerData(newName, data, oldName);
  } catch (err) {
    alert('Не вдалося перейменувати: ' + (err?.message ?? err));
  }
}

async function editorAddPlayer() {
  if (!fbIsAuthed()) return;
  const name = (prompt("Ім'я нового гравця:") || '').trim();
  if (!name) return;
  if (PLAYERS.some(x => x.name === name)) { alert('Гравець з таким іменем уже існує'); return; }
  const p = {
    name, build: Object.keys(BUILDS)[0], altBuild: null, gearLevel: 'mid',
    ready: false, squad: null, roles: [], note: '',
    device: '', mainRole: '', arenaRank: '', prevSeasonMythic: false, mastery: null,
  };
  PLAYERS.push(p);
  render();
  try {
    await savePlayerData(name, playersToFirebaseMap([p])[name]);
  } catch (err) {
    alert('Не вдалося додати: ' + (err?.message ?? err));
  }
}

async function editorDeleteRow(name) {
  if (!fbIsAuthed()) return;
  if (!confirm(`Видалити гравця «${name}»?`)) return;
  const i = PLAYERS.findIndex(x => x.name === name);
  if (i !== -1) PLAYERS.splice(i, 1);
  render();
  try {
    await deletePlayerData(name);
  } catch (err) {
    alert('Не вдалося видалити: ' + (err?.message ?? err));
  }
}

function editorExportColumns() {
  return [
    ['name', "Ім'я"], ['build', 'Class'], ['altBuild', 'Alt'], ['mainRole', 'Main Role'],
    ['device', 'Device'], ['gearLevel', 'Gear'], ['arenaRank', 'Arena'],
    ['prevSeasonMythic', 'Prev Mythic'], ['mastery', 'Mastery'], ['ready', 'Ready'],
    ['squad', 'Squad'], ['note', 'Note'],
  ];
}

function editorExportValue(p, field) {
  switch (field) {
    case 'build':
    case 'altBuild':         return p[field] ? (BUILDS[p[field]]?.label ?? p[field]) : '';
    case 'gearLevel':        return GEAR_TIERS[p.gearLevel]?.label ?? p.gearLevel ?? '';
    case 'prevSeasonMythic': return p.prevSeasonMythic ? 'Yes' : 'No';
    case 'ready':            return p.ready ? 'Yes' : 'No';
    case 'squad':            return p.squad === 'attack' ? 'Attack' : p.squad === 'def' ? 'Defence' : '';
    case 'mastery':          return p.mastery ?? '';
    default:                 return p[field] ?? '';
  }
}

// Експорт CSV з BOM — щоб Excel правильно читав кирилицю
function editorExportCsv() {
  const cols = editorExportColumns();
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const BOM    = '﻿';
  const header = cols.map(c => cell(c[1])).join(',');
  const lines  = editorSortedPlayers().map(p => cols.map(c => cell(editorExportValue(p, c[0]))).join(','));
  const csv    = BOM + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gvg-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function editorExportExcel() {
  const cols = editorExportColumns();
  const xlsCell = v => {
    const s = v == null ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return esc(safe).replace(/\n/g, '<br>');
  };
  const header = cols.map(([, label]) => `<th>${xlsCell(label)}</th>`).join('');
  const rows = editorSortedPlayers()
    .map(p => `<tr>${cols.map(([field]) => `<td>${xlsCell(editorExportValue(p, field))}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
    th, td { border: 1px solid #b7c4d6; padding: 6px 8px; mso-number-format:"\\@"; }
    th { background: #dbeafe; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gvg-roster-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Preset Bars ───────────────────────────────────────────────────────── */
function presetBarBattle() {
  const canEdit = typeof fbIsAdmin === 'function' && fbIsAdmin();
  const sorted = Object.entries(battlePresets)
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  const liveOpt = `<option value="__live__"${activeBattlePresetId === null ? ' selected' : ''}>— Виберіть пресет —</option>`;
  const opts = sorted.map(([id, p]) =>
    `<option value="${esc(id)}"${activeBattlePresetId === id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  const hasSaved = activeBattlePresetId !== null;
  const adminBtns = canEdit ? [
    `<button class="btn-preset btn-preset--save" data-action="bv-preset-save">+ Зберегти</button>`,
    hasSaved ? `<button class="btn-preset btn-preset--activate" data-action="bv-preset-activate">↑ Активувати</button>` : '',
    hasSaved ? `<button class="btn-preset btn-preset--icon" data-action="bv-preset-rename" title="Перейменувати">✏</button>` : '',
    hasSaved ? `<button class="btn-preset btn-preset--icon btn-preset--del" data-action="bv-preset-delete" title="Видалити">🗑</button>` : '',
  ].join('') : '';
  return `<div class="preset-bar"><span class="preset-label">Пресет</span><select class="preset-select" data-action="bv-preset-select">${liveOpt}${opts}</select>${adminBtns}</div>`;
}

function presetBarStrategy() {
  const canEdit = typeof fbIsAdmin === 'function' && fbIsAdmin();
  const sorted = Object.entries(strategyPresets)
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  const noneOpt = `<option value="__none__"${activeStrategyPresetId === null ? ' selected' : ''}>— Виберіть пресет —</option>`;
  const opts = sorted.map(([id, p]) =>
    `<option value="${esc(id)}"${activeStrategyPresetId === id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  const hasSaved = activeStrategyPresetId !== null;
  const adminBtns = canEdit ? [
    `<button class="btn-preset btn-preset--save" data-action="sv-preset-save">+ Зберегти</button>`,
    hasSaved ? `<button class="btn-preset btn-preset--icon" data-action="sv-preset-rename" title="Перейменувати">✏</button>` : '',
    hasSaved ? `<button class="btn-preset btn-preset--icon btn-preset--del" data-action="sv-preset-delete" title="Видалити">🗑</button>` : '',
  ].join('') : '';
  return `<div class="preset-bar sv-preset-bar"><span class="preset-label">Пресет</span><select class="preset-select" data-action="sv-preset-select">${noneOpt}${opts}</select>${adminBtns}</div>`;
}

/* ─── Battle View (redesigned) ─────────────────────────────────────────── */
function initBattleSlots() {
  // Швидкий синхронний init з localStorage-кешу; Firebase оновить асинхронно
  let cached = null;
  try {
    const raw = localStorage.getItem(BATTLE_STATE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {}
  applyBattleState(cached);
}

function removeFromSlots(name) {
  for (const sq of ['attack', 'def']) {
    for (const zone of ['main', 'reserve']) {
      const idx = battleSlots[sq][zone].indexOf(name);
      if (idx !== -1) battleSlots[sq][zone][idx] = null;
    }
  }
}

function snapshotBattle() {
  _battleSquadSnapshot = {
    squads:   PLAYERS.map(p => ({ name: p.name, squad: p.squad })),
    slots:    {
      attack: { main: [...battleSlots.attack.main], reserve: [...battleSlots.attack.reserve] },
      def:    { main: [...battleSlots.def.main],    reserve: [...battleSlots.def.reserve]    },
    },
    reserves: new Set(battleReserves),
  };
}

function resetBattle() {
  PLAYERS.forEach(p => { if (p.squad === 'attack' || p.squad === 'def') p.squad = null; });
  battleSlots = {
    attack: { main: Array(20).fill(null), reserve: Array(5).fill(null) },
    def:    { main: Array(20).fill(null), reserve: Array(5).fill(null) },
  };
  battleReserves.clear();
  saveBattleState();
}

function bvRow(p, draggable) {
  const b     = getBuild(p.build);
  const bdg   = b ? `<span class="badge bv-badge" style="background:${b.color}">${esc(b.label)}</span>` : '';
  const icons = (p.roles || []).map(r => ROLE_ICONS[r] || '').filter(Boolean).join('');
  return `<div class="bv-row" data-player="${esc(p.name)}"${draggable ? ' draggable="true"' : ''}><span class="bv-name">${esc(p.name)}</span>${bdg}${icons ? `<span class="bv-roles">${icons}</span>` : ''}</div>`;
}

function bvCard(name) {
  const p          = PLAYERS.find(x => x.name === name);
  const b          = p ? getBuild(p.build) : null;
  const roles      = p ? (p.roles || []) : [];
  const isOfficer  = roles.includes('Officer');
  const isJungle   = roles.includes('Jungle');
  const isNinja    = roles.includes('Ninja');
  const isMvp      = !!(p && p.gearLevel === 'high');
  const drag       = battleEditMode ? ' draggable="true"' : '';
  const buildColor = b ? b.color : 'rgba(80, 86, 110, 1)';
  const buildLabel = b ? esc(b.label) : '';

  const officer = isOfficer
    ? `<span class="bv-officer-mark" title="Officer">♛</span>`
    : '';

  const tagBits = [];
  if (isJungle) {
    tagBits.push(
      `<span class="bv-tag bv-tag--jungle" title="Jungle">` +
      `<span class="bv-tag-glyph">✿</span>JNG</span>`
    );
  }
  if (isNinja) {
    tagBits.push(
      `<span class="bv-tag bv-tag--ninja" title="Ninja">` +
      `<span class="bv-tag-glyph">◆</span>NIN</span>`
    );
  }
  const tags = tagBits.length
    ? `<div class="bv-card-tags">${tagBits.join('')}</div>`
    : '';

  const mvp = isMvp ? `<div class="bv-mvp" aria-hidden="true"></div>` : '';

  return `<div class="bv-card" data-player="${esc(name)}"${drag} style="--bc:${buildColor}">
  <div class="bv-card-build">${buildLabel}</div>
  <div class="bv-card-name">${officer}<span class="bv-name-text">${esc(name)}</span></div>
  ${tags}
  ${mvp}
</div>`;
}

function bvSlot(squad, zone, idx) {
  const name = battleSlots[squad][zone][idx];
  const dz = battleEditMode ? ' data-droppable="true"' : '';
  return `<div class="bv-slot${name ? ' bv-slot--filled' : ' bv-slot--empty'}" data-slot-squad="${squad}" data-slot-zone="${zone}" data-slot-idx="${idx}"${dz}>${name ? bvCard(name) : ''}</div>`;
}

function bvColumn(squad) {
  const isAtk = squad === 'attack';
  const color = isAtk ? '#ef4444' : '#3b82f6';
  const icon  = isAtk ? '⚔️' : '🛡️';
  const label = isAtk ? 'Attack' : 'Defence';
  const mainFilled = battleSlots[squad].main.filter(Boolean).length;
  const resFilled  = battleSlots[squad].reserve.filter(Boolean).length;
  const mainSlots  = Array.from({length: 20}, (_, i) => bvSlot(squad, 'main', i)).join('');
  const resSlots   = Array.from({length: 5},  (_, i) => bvSlot(squad, 'reserve', i)).join('');
  const viewCls = battleEditMode ? '' : ' bv-col--view';
  return `<div class="bv-col${viewCls}">
  <div class="bv-col-hdr" style="border-color:${color};color:${color}">${icon} ${label}<span class="bv-count">${mainFilled}<span class="bv-max">/20</span></span></div>
  <div class="bv-grid">${mainSlots}</div>
  <div class="bv-res-lbl">Резерв<span class="bv-count">${resFilled}<span class="bv-max">/5</span></span></div>
  <div class="bv-grid bv-grid-res">${resSlots}</div></div>`;
}

function viewBattle() {
  if (!battleSlots) initBattleSlots();

  const inSlots = new Set([
    ...battleSlots.attack.main, ...battleSlots.attack.reserve,
    ...battleSlots.def.main,    ...battleSlots.def.reserve,
  ].filter(Boolean));
  const free = sortPlayers(PLAYERS).filter(p => !inSlots.has(p.name));

  const atkFilled = battleSlots.attack.main.filter(Boolean).length + battleSlots.attack.reserve.filter(Boolean).length;
  const defFilled = battleSlots.def.main.filter(Boolean).length    + battleSlots.def.reserve.filter(Boolean).length;

  const canEdit = typeof fbIsAdmin === 'function' && fbIsAdmin();
  const toolbarBtns = battleEditMode
    ? `<button class="btn-bv-edit active" data-action="bv-toggle-edit">✓ Готово</button><button class="btn-bv-reset" data-action="bv-reset">🗑 Очистити пачки</button>`
    : `${canEdit ? `<button class="btn-bv-edit" data-action="bv-toggle-edit">✏️ Редагувати</button>` : ''}<button class="btn-bv-photo" data-action="bv-save-photo">📷 Зберегти фото</button>`;

  $statsBar.innerHTML = `<div class="stats-summary">
  <span class="stat-pill" style="background:#ef4444">⚔️ Attack: ${atkFilled}</span>
  <span class="stat-pill" style="background:#3b82f6">🛡️ Defence: ${defFilled}</span>
  ${free.length ? `<span class="stat-pill" style="background:#64748b">🔄 Вільні: ${free.length}</span>` : ''}
  <div class="stats-actions">${toolbarBtns}</div>
</div>`;
  $statsBar.classList.remove('hidden');

  const dz = battleEditMode ? ' data-droppable="true"' : '';
  const freeRows = free.map(p => bvRow(p, battleEditMode)).join('');
  const poolHtml = (free.length > 0 || battleEditMode)
    ? `<div class="bv-pool bv-zone" data-drop-target="free-list" data-squad="__free__" data-reserve="false"${dz}><div class="bv-pool-hdr">🔄 Незакріплені${free.length ? ` · ${free.length}` : ''}</div>${freeRows || '<span class="bv-empty-hint">Всі гравці розподілені</span>'}</div>`
    : '';

  const sideHtml = battleEditMode ? (() => {
    const sf  = battleSidebarFilter;
    const sq  = sf.search.toLowerCase();
    const bf  = sf.builds;
    const sqf = sf.squads;
    const rowsHtml = squadSortedPlayers().map(p => {
      const b        = getBuild(p.build);
      const iconHtml = b
        ? `<span class="sv-build-icon" style="--bc:${b.color}" title="${esc(b.label.replace(/^\S+\s*/, ''))}">${esc(b.label.split(' ')[0])}</span>`
        : `<span class="sv-build-icon" style="--bc:#475569">?</span>`;
      const inA      = battleSlots.attack.main.includes(p.name) || battleSlots.attack.reserve.includes(p.name);
      const inD      = battleSlots.def.main.includes(p.name)    || battleSlots.def.reserve.includes(p.name);
      const squadKey = inA ? 'attack' : inD ? 'def' : 'free';
      const rowCls   = inA ? 'bv-row-attack' : inD ? 'bv-row-def' : 'bv-row-free';
      const nameOk   = !sq || p.name.toLowerCase().includes(sq);
      const buildOk  = bf.size === 0 || bf.has(p.build);
      const squadOk  = sqf.size === 0 || sqf.has(squadKey);
      const display  = (nameOk && buildOk && squadOk) ? '' : ' style="display:none"';
      return `<div class="bv-sidebar-row ${rowCls}"${display} data-player="${esc(p.name)}" data-build="${esc(p.build || '')}" data-squad="${squadKey}" draggable="true">${iconHtml}<span class="bv-name">${esc(p.name)}</span></div>`;
    }).join('');
    const sidebarDrop = battleEditMode ? ' data-droppable="true" data-drop-target="free-list"' : '';
    return `<aside class="bv-sidebar"${sidebarDrop}>
      ${buildSidebarStickyHtml('Всі гравці', sf)}
      <div class="bv-sidebar-list">${rowsHtml}</div>
    </aside>`;
  })() : '';

  return `<div class="bv-wrap${battleEditMode ? ' bv-edit' : ''}">
  <div class="bv-main">
    ${!battleEditMode ? presetBarBattle() : ''}
    <div class="bv-columns">
      ${bvColumn('attack')}
      ${bvColumn('def')}
    </div>
    ${poolHtml}
  </div>
  ${sideHtml}
</div>`;
}

/* ─── Strategy View ─────────────────────────────────────────────────────── */
const sv = {
  elements:       [],   // {type:'arrow',x1,y1,x2,y2,color} | {type:'player',x,y,name,color}
  tool:           'arrow',
  color:          '#ef4444',
  arrowStart:     null,
  selectedPlayer: null,
  mapImg:         null,
  canvas:         null,
  ctx:            null,
};

const STRATEGY_MARK_SCALE = 1.5;

function svGetPos(e) {
  const rect  = sv.canvas.getBoundingClientRect();
  const scaleX = sv.canvas.width  / rect.width;
  const scaleY = sv.canvas.height / rect.height;
  let cx, cy;
  if (e.changedTouches && e.changedTouches.length) {
    cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY;
  } else if (e.touches && e.touches.length) {
    cx = e.touches[0].clientX; cy = e.touches[0].clientY;
  } else {
    cx = e.clientX; cy = e.clientY;
  }
  return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}

function svDrawArrow(ctx, x1, y1, x2, y2, color, alpha, dashed) {
  alpha = alpha ?? 1;
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.sqrt(dx * dx + dy * dy) < 6) return;
  const angle   = Math.atan2(dy, dx);
  const headLen = 18 * STRATEGY_MARK_SCALE;
  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.strokeStyle  = color;
  ctx.fillStyle    = color;
  ctx.lineWidth    = 4 * STRATEGY_MARK_SCALE;
  ctx.lineCap      = dashed ? 'butt' : 'round';
  ctx.shadowColor  = color;
  ctx.shadowBlur   = 8 * STRATEGY_MARK_SCALE;
  if (dashed) ctx.setLineDash([12 * STRATEGY_MARK_SCALE, 8 * STRATEGY_MARK_SCALE]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - headLen * 0.65 * Math.cos(angle), y2 - headLen * 0.65 * Math.sin(angle));
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function svDrawPlayer(ctx, x, y, name, color, build) {
  const b         = getBuild(build);
  const emoji     = b ? b.label.split(' ')[0] : '';
  const short     = name.length > 10 ? name.slice(0, 9) + '…' : name;
  const fSize     = 11 * STRATEGY_MARK_SCALE;
  const padX      = 7 * STRATEGY_MARK_SCALE, padY = 4 * STRATEGY_MARK_SCALE;
  const radius    = 4 * STRATEGY_MARK_SCALE;
  const emojiGap  = 3 * STRATEGY_MARK_SCALE;
  ctx.save();

  // Measure emoji width
  let emojiW = 0;
  if (emoji) {
    ctx.font = `${fSize + 1}px system-ui, -apple-system, sans-serif`;
    emojiW = ctx.measureText(emoji).width + emojiGap;
  }

  ctx.font     = `bold ${fSize}px system-ui, -apple-system, sans-serif`;
  const tw     = ctx.measureText(short).width;
  const w      = tw + emojiW + padX * 2;
  const h      = fSize + padY * 2;
  const lx     = x - w / 2, ty = y - h / 2;

  // shadow + fill
  ctx.shadowColor = color;
  ctx.shadowBlur  = 7 * STRATEGY_MARK_SCALE;
  ctx.fillStyle   = color;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.roundRect(lx, ty, w, h, radius);
  ctx.fill();

  // border
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth   = 1.2 * STRATEGY_MARK_SCALE;
  ctx.stroke();

  // emoji icon
  if (emoji) {
    ctx.font         = `${fSize + 1}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle    = '#fff';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur   = 2 * STRATEGY_MARK_SCALE;
    ctx.fillText(emoji, lx + padX, y);
  }

  // name
  ctx.font         = `bold ${fSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle    = '#fff';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur   = 3 * STRATEGY_MARK_SCALE;
  ctx.fillText(short, lx + padX + emojiW, y);

  ctx.restore();
}

function svDrawCanvas(preview) {
  const { canvas, ctx, mapImg, elements, arrowStart, color } = sv;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mapImg) {
    ctx.drawImage(mapImg, 100, 200, mapImg.naturalWidth - 200, mapImg.naturalHeight - 400, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0d1126';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  elements.forEach(el => {
    if (el.type === 'arrow')  svDrawArrow(ctx, el.x1, el.y1, el.x2, el.y2, el.color, 1, el.dashed);
    if (el.type === 'player') svDrawPlayer(ctx, el.x, el.y, el.name, el.color, el.build);
  });
  if (arrowStart) {
    // dot at start
    ctx.save();
    ctx.beginPath();
    ctx.arc(arrowStart.x, arrowStart.y, 6 * STRATEGY_MARK_SCALE, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10 * STRATEGY_MARK_SCALE;
    ctx.fill();
    ctx.restore();
    if (preview) svDrawArrow(ctx, arrowStart.x, arrowStart.y, preview.x, preview.y, color, 0.55, sv.tool === 'arrowDashed');
  }
}

function svDistToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function svHitTest(x, y) {
  for (let i = sv.elements.length - 1; i >= 0; i--) {
    const el = sv.elements[i];
    if (el.type === 'player') {
      if (Math.hypot(el.x - x, el.y - y) <= 20 * STRATEGY_MARK_SCALE) return i;
    } else if (el.type === 'arrow') {
      if (svDistToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= 14 * STRATEGY_MARK_SCALE) return i;
    }
  }
  return -1;
}

function svUpdateSidebar() {
  const sidebar = document.querySelector('.sv-sidebar');
  if (!sidebar) return;
  const placed = new Set(sv.elements.filter(el => el.type === 'player').map(el => el.name));
  sidebar.querySelectorAll('.sv-player-item').forEach(item => {
    item.classList.toggle('sv-player--placed',   placed.has(item.dataset.name));
    item.classList.toggle('sv-player--selected', item.dataset.name === sv.selectedPlayer);
  });
  // update hint
  const hint = document.querySelector('.sv-hint');
  if (hint) hint.style.display = sv.arrowStart ? '' : 'none';
}

function svHandleClick(e) {
  if (e.type === 'touchend') e.preventDefault();
  const pos = svGetPos(e);

  if (sv.tool === 'arrow' || sv.tool === 'arrowDashed') {
    if (!sv.arrowStart) {
      sv.arrowStart = pos;
    } else {
      const el = { type: 'arrow', x1: sv.arrowStart.x, y1: sv.arrowStart.y, x2: pos.x, y2: pos.y, color: sv.color };
      if (sv.tool === 'arrowDashed') el.dashed = true;
      sv.elements.push(el);
      sv.arrowStart = null;
      svDrawCanvas();
    }
    svUpdateSidebar();
  } else if (sv.tool === 'player') {
    if (sv.selectedPlayer) {
      sv.elements = sv.elements.filter(el => !(el.type === 'player' && el.name === sv.selectedPlayer));
      const _p = PLAYERS.find(x => x.name === sv.selectedPlayer);
      const _c = _p?.squad === 'attack' ? '#ef4444' : _p?.squad === 'def' ? '#3b82f6' : '#64748b';
      sv.elements.push({ type: 'player', x: pos.x, y: pos.y, name: sv.selectedPlayer, color: _c, build: _p?.build });
      sv.selectedPlayer = null;
      svDrawCanvas();
      svUpdateSidebar();
    }
  } else if (sv.tool === 'erase') {
    const idx = svHitTest(pos.x, pos.y);
    if (idx !== -1) { sv.elements.splice(idx, 1); svDrawCanvas(); svUpdateSidebar(); }
  }
}

function svHandleMove(e) {
  if ((sv.tool === 'arrow' || sv.tool === 'arrowDashed') && sv.arrowStart) {
    if (e.cancelable) e.preventDefault();
    svDrawCanvas(svGetPos(e));
  }
}

function svLoadMap(onReady) {
  const img = new Image();
  img.onload = () => { sv.mapImg = img; onReady(); };
  img.src = MAP_DATA_URL;
}

function initStrategyCanvas() {
  const canvas = document.getElementById('sv-canvas');
  if (!canvas) return;
  sv.canvas = canvas;
  sv.ctx    = canvas.getContext('2d');

  const setupCanvas = () => {
    canvas.width  = sv.mapImg ? sv.mapImg.naturalWidth  - 200 : 1000;
    canvas.height = sv.mapImg ? sv.mapImg.naturalHeight - 400 : 350;
    svDrawCanvas();
  };

  if (!sv.mapImg) {
    svLoadMap(setupCanvas);
  } else {
    setupCanvas();
  }

  canvas.addEventListener('click',     svHandleClick);
  canvas.addEventListener('touchend',  svHandleClick, { passive: false });
  canvas.addEventListener('mousemove', svHandleMove);
  canvas.addEventListener('touchmove', svHandleMove, { passive: false });

  // Sidebar player selection
  document.querySelector('.sv-sidebar')?.addEventListener('click', e => {
    const item = e.target.closest('.sv-player-item');
    if (!item) return;
    const name = item.dataset.name;
    if (sv.tool !== 'player') {
      sv.tool = 'player';
      document.querySelectorAll('[data-sv-tool]').forEach(b => b.classList.toggle('active', b.dataset.svTool === 'player'));
    }
    sv.selectedPlayer = sv.selectedPlayer === name ? null : name;
    svUpdateSidebar();
  });

  // Toolbar
  document.querySelector('.sv-toolbar')?.addEventListener('click', e => {
    const toolBtn = e.target.closest('[data-sv-tool]');
    if (toolBtn) {
      sv.tool = toolBtn.dataset.svTool;
      sv.arrowStart = null;
      sv.selectedPlayer = null;
      document.querySelectorAll('[data-sv-tool]').forEach(b => b.classList.toggle('active', b === toolBtn));
      svUpdateSidebar();
      svDrawCanvas();
    }
    const colorBtn = e.target.closest('[data-sv-color]');
    if (colorBtn) {
      sv.color = colorBtn.dataset.svColor;
      document.querySelectorAll('[data-sv-color]').forEach(b => b.classList.toggle('active', b === colorBtn));
    }
    const actionBtn = e.target.closest('[data-sv-action]');
    if (actionBtn) {
      const act = actionBtn.dataset.svAction;
      if (act === 'undo') {
        sv.elements.pop(); sv.arrowStart = null; svDrawCanvas(); svUpdateSidebar();
      } else if (act === 'clear') {
        sv.elements = []; sv.arrowStart = null; svDrawCanvas(); svUpdateSidebar();
      } else if (act === 'save') {
        svDrawCanvas();
        try {
          const link = document.createElement('a');
          link.download = 'strategy.png';
          link.href = sv.canvas.toDataURL('image/png');
          link.click();
        } catch {
          alert('Не вдалося зберегти: натисніть "📂 Карта" і виберіть файл map.jpeg щоб активувати збереження.');
        }
      }
    }
  });

  svUpdateSidebar();
}

function viewStrategy() {
  const sf  = svSidebarFilter;
  const sq  = sf.search.toLowerCase();
  const bf  = sf.builds;
  const sqf = sf.squads;
  const playerItems = squadSortedPlayers().map(p => {
    const b          = getBuild(p.build);
    const color      = b?.color ?? '#64748b';
    const rowCls     = squadRowClass(p);
    const iconsHtml  = `<span class="sv-build-icons">${buildIconHtml(p.build)}${buildIconHtml(p.altBuild, true)}</span>`;
    const squadKey   = p.squad ?? 'free';
    const nameOk     = !sq || p.name.toLowerCase().includes(sq);
    const buildOk    = bf.size === 0 || bf.has(p.build);
    const squadOk    = sqf.size === 0 || sqf.has(squadKey);
    const displayStr = (nameOk && buildOk && squadOk) ? '' : ';display:none';
    return `<div class="sv-player-item ${rowCls}" data-name="${esc(p.name)}" data-build="${esc(p.build || '')}" data-squad="${squadKey}" style="--pc:${color}${displayStr}"><span class="sv-player-name">${esc(p.name)}</span>${iconsHtml}</div>`;
  }).join('');

  const toolBtn = t => `<button class="sv-btn${sv.tool === t ? ' active' : ''}" data-sv-tool="${t}">`;
  const colorBtn = c => `<button class="sv-color-btn${sv.color === c ? ' active' : ''}" data-sv-color="${c}" style="--c:${c}">`;

  return `<div class="sv-wrap">
  ${presetBarStrategy()}
  <div class="sv-toolbar">
    <div class="sv-tool-group">
      ${toolBtn('arrow')}↗ Стрілка</button>
      ${toolBtn('arrowDashed')}⇢ Пунктир</button>
      ${toolBtn('player')}📍 Гравець</button>
      ${toolBtn('erase')}✕ Ластик</button>
    </div>
    <div class="sv-color-group">
      ${colorBtn('#ef4444')}⚔ Атака</button>
      ${colorBtn('#3b82f6')}🛡 Деф</button>
    </div>
    <div class="sv-action-group">
      <button class="sv-btn" data-sv-action="undo">↩ Undo</button>
      <button class="sv-btn" data-sv-action="clear">⊘ Очистити</button>
      <button class="sv-btn sv-btn--save" data-sv-action="save">⤓ Зберегти</button>
    </div>
  </div>
  <div class="sv-body">
    <div class="sv-canvas-wrap">
      <canvas id="sv-canvas"></canvas>
      <div class="sv-hint" style="${sv.arrowStart ? '' : 'display:none'}">Клікніть, щоб поставити кінець стрілки • Esc — скасувати</div>
    </div>
    <div class="sv-sidebar">
      ${buildSidebarStickyHtml('Гравці', svSidebarFilter)}
      <div class="bv-sidebar-list">${playerItems}</div>
    </div>
  </div>
</div>`;
}

/* ─── Main render ───────────────────────────────────────────────────────── */
function render() {
  $statsBar.classList.add('hidden');
  const filtered = filterPlayers(PLAYERS);
  const sorted   = sortPlayers(filtered);

  const $pc = document.getElementById('player-count');
  if ($pc) $pc.textContent = PLAYERS.length;

  const isStrategy = state.viewMode === 'strategy';
  document.body.classList.toggle('view-strategy', isStrategy);

  // Кнопка "+ Гравець" тільки на вкладці "Гравці" для адміна
  const addBtn = document.getElementById('add-player-btn');
  if (addBtn) {
    const isAdmin = typeof fbIsAdmin === 'function' && fbIsAdmin();
    addBtn.style.display = (state.viewMode === 'list' && isAdmin) ? '' : 'none';
  }

  switch (state.viewMode) {
    case 'grouped':  $roster.innerHTML = viewGrouped(sorted); break;
    case 'battle':   $roster.innerHTML = viewBattle();        break;
    case 'strategy': $roster.innerHTML = viewStrategy(); initStrategyCanvas(); break;
    case 'editor':   $roster.innerHTML = viewEditor();       break;
    default:         $roster.innerHTML = viewList(sorted);
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
  const buildsHtml = cats
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

  const rolesHtml = Object.entries(ROLE_DESCRIPTIONS)
    .map(([key, r]) =>
      `<div class="legend-role-item">
  <span class="badge badge--role">${r.icon} ${esc(key)}</span>
  <span class="legend-role-desc">${esc(r.desc)}</span>
</div>`
    ).join('');

  $legend.innerHTML = buildsHtml
    + `<div class="legend-cat legend-cat--roles"><span class="legend-cat-label">Ролі</span>${rolesHtml}</div>`;
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

const SQUAD_ICONS = { attack: '⚔', def: '🛡' };
function initSquadPills() {
  $squadFilters.innerHTML = Object.entries(SQUADS).map(([key, s]) =>
    `<button class="pill" data-key="${esc(key)}" data-filter="squads" style="--pill-color:${s.color}">${(SQUAD_ICONS[key] ?? '') + ' ' + esc(s.label)}</button>`
  ).join('')
  + `<button class="pill" data-key="__none__" data-filter="squads" style="--pill-color:#64748b">· Нерозподілені</button>`;
}

function initRolePills() {
  const allRoles = [...new Set(PLAYERS.flatMap(p => p.roles || []))];
  $roleFilters.innerHTML = allRoles.map(r => {
    const icon = ROLE_ICONS[r] ?? '';
    return `<button class="pill" data-key="${esc(r)}" data-filter="roles" style="--pill-color:#94a3b8">${icon ? icon + ' ' : ''}${esc(r)}</button>`;
  }).join('');
  if (!allRoles.length) $roleFilters.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem">немає ролей</span>';
}

const GEAR_ICONS = { low: '▱', mid: '▰▱', high: '▰▰' };
function initGearPills() {
  $gearFilters.innerHTML = Object.entries(GEAR_TIERS).map(([key, t]) =>
    `<button class="pill" data-key="${esc(key)}" data-filter="gears" style="--pill-color:${t.color}">${(GEAR_ICONS[key] ?? '') + ' ' + esc(t.label)}</button>`
  ).join('');
}

/* ─── Player modal ──────────────────────────────────────────────────────── */
function showPlayerModal(player) {
  const modal = document.getElementById('player-modal');
  const form  = document.getElementById('player-form');
  if (!modal || !form) return;

  document.getElementById('player-modal-title').textContent =
    player ? `Редагувати: ${player.name}` : 'Новий гравець';
  form.dataset.originalName = player?.name ?? '';

  document.getElementById('pm-name').value       = player?.name      ?? '';
  document.getElementById('pm-build').value      = player?.build     ?? Object.keys(BUILDS)[0];
  document.getElementById('pm-altbuild').value   = player?.altBuild  ?? '';
  document.getElementById('pm-gear').value       = player?.gearLevel ?? 'mid';
  document.getElementById('pm-ready').checked    = player?.ready     ?? true;
  document.getElementById('pm-squad').value      = player?.squad     ?? '';
  document.getElementById('pm-note').value       = player?.note      ?? '';

  form.querySelectorAll('input[name="pm-role"]').forEach(cb => {
    cb.checked = (player?.roles ?? []).includes(cb.value);
  });

  document.getElementById('pm-delete').style.display = player ? '' : 'none';
  document.getElementById('pm-error').textContent    = '';
  modal.classList.add('is-open');
  document.getElementById('pm-name').focus();
}

function initPlayerModal() {
  const modal = document.getElementById('player-modal');
  if (!modal) return;

  // Заповнити select-и білдів з BUILDS
  const buildOpts = Object.entries(BUILDS)
    .map(([k, b]) => `<option value="${esc(k)}">${esc(b.label)}</option>`)
    .join('');
  document.getElementById('pm-build').innerHTML    = buildOpts;
  document.getElementById('pm-altbuild').innerHTML = `<option value="">— Немає —</option>${buildOpts}`;

  document.getElementById('player-modal-close').addEventListener('click', () => {
    modal.classList.remove('is-open');
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('is-open');
  });

  document.getElementById('add-player-btn')?.addEventListener('click', () => {
    showPlayerModal(null);
  });

  document.getElementById('pm-delete').addEventListener('click', async () => {
    const name = document.getElementById('player-form').dataset.originalName;
    if (!name) return;
    if (!confirm(`Видалити гравця "${name}"?`)) return;
    const btn = document.getElementById('pm-delete');
    btn.disabled = true;
    try {
      await deletePlayerData(name);
      modal.classList.remove('is-open');
    } catch (err) {
      document.getElementById('pm-error').textContent = 'Помилка: ' + (err?.message ?? err);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('player-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form      = e.target;
    const submitBtn = document.getElementById('pm-submit');
    const errorEl   = document.getElementById('pm-error');

    const originalName = form.dataset.originalName;
    const name         = document.getElementById('pm-name').value.trim();

    if (!name) { errorEl.textContent = "Ім'я обов'язкове"; return; }
    if (/[.$#[\]/]/.test(name)) {
      errorEl.textContent = "Ім'я не може містити: . $ # [ ] /";
      return;
    }
    if (name !== originalName && PLAYERS.some(p => p.name === name)) {
      errorEl.textContent = 'Гравець з таким іменем вже існує';
      return;
    }

    const roles = [...form.querySelectorAll('input[name="pm-role"]:checked')].map(cb => cb.value);
    // поля з Excel-редактора не керуються цією формою — переносимо їх із наявного гравця, щоб .set() їх не стер
    const existing = PLAYERS.find(p => p.name === originalName) || {};
    const data = {
      build:     document.getElementById('pm-build').value,
      altBuild:  document.getElementById('pm-altbuild').value || null,
      gearLevel: document.getElementById('pm-gear').value,
      ready:     document.getElementById('pm-ready').checked,
      squad:     document.getElementById('pm-squad').value || null,
      roles,
      note:      document.getElementById('pm-note').value.trim(),
      device:           existing.device   || '',
      mainRole:         existing.mainRole || '',
      arenaRank:        existing.arenaRank || '',
      prevSeasonMythic: !!existing.prevSeasonMythic,
      mastery:          existing.mastery ?? null,
    };

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Збереження…';
    errorEl.textContent   = '';

    try {
      await savePlayerData(name, data, originalName);
      modal.classList.remove('is-open');
    } catch (err) {
      errorEl.textContent = 'Помилка: ' + (err?.message ?? err);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Зберегти';
    }
  });
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

  // Escape — скасувати дію в режимі стратегії / закрити модальне вікно
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('player-modal')?.classList.remove('is-open');
    }
    if (e.key === 'Escape' && state.viewMode === 'strategy') {
      sv.arrowStart = null;
      sv.selectedPlayer = null;
      svDrawCanvas();
      svUpdateSidebar();
    }
  });

  // Легенда
  const $legendToggle = document.getElementById('legend-toggle');
  $legendToggle.addEventListener('click', () => {
    const hidden = $legend.classList.toggle('hidden');
    $legendToggle.querySelector('.legend-arrow').textContent = hidden ? '▸' : '▾';
    $legendToggle.setAttribute('aria-expanded', String(!hidden));
  });

  // ─── Адмін-дії в списку гравців (export / import / edit) ────────────────
  $roster.addEventListener('click', e => {
    if (e.target.closest('[data-action="export-players"]')) {
      exportPlayers();
      return;
    }
    const editBtn = e.target.closest('[data-action="edit-player"]');
    if (editBtn) {
      const player = PLAYERS.find(p => p.name === editBtn.dataset.player);
      if (player) showPlayerModal(player);
      return;
    }
    if (e.target.closest('[data-action="editor-seed"]')) {
      fbSaveAllPlayers(playersToFirebaseMap(PLAYERS))
        .catch(err => alert('Не вдалося залити: ' + (err?.message ?? err)));
      return;
    }
    if (e.target.closest('[data-action="editor-add"]')) { editorAddPlayer(); return; }
    if (e.target.closest('[data-action="editor-export-excel"]')) { editorExportExcel(); return; }
    if (e.target.closest('[data-action="editor-export-csv"]')) { editorExportCsv(); return; }
    const delBtn = e.target.closest('[data-action="editor-del"]');
    if (delBtn) { editorDeleteRow(delBtn.dataset.edName); return; }
    const sortTh = e.target.closest('[data-ed-sort]');
    if (sortTh) {
      const f = sortTh.dataset.edSort;
      if (editorSort.field === f) editorSort.dir = editorSort.dir === 'asc' ? 'desc' : 'asc';
      else editorSort = { field: f, dir: 'asc' };
      render();
      return;
    }
  });

  $roster.addEventListener('change', e => {
    const fileInput = e.target.closest('.import-file-input');
    if (fileInput && fileInput.files[0]) {
      importPlayers(fileInput.files[0]);
      fileInput.value = ''; // дозволяє повторний вибір того ж файлу
      return;
    }
    // Редактор: запис зміненої комірки
    const ed = e.target.closest('[data-ed-field]');
    if (ed) {
      const { edName: name, edField: field } = ed.dataset;
      if (field === 'name') editorRename(name, ed.value);
      else editorWriteField(name, field, ed.type === 'checkbox' ? ed.checked : ed.value);
    }
  });

  // ─── Бойовий вигляд: редагування + DnD ─────────────────────────────────
  document.addEventListener('click', e => {
    if (e.target.closest('[data-action="bv-toggle-edit"]')) {
      if (!battleEditMode) {
        if (!battleSlots) initBattleSlots();
        snapshotBattle();
      } else {
        battleSidebarFilter.search = '';
        battleSidebarFilter.builds.clear();
        battleSidebarFilter.squads.clear();
      }
      battleEditMode = !battleEditMode;
      render();
    }
    if (e.target.closest('[data-action="bv-reset"]')) {
      resetBattle();
      render();
    }
    if (e.target.closest('[data-action="bv-save-photo"]')) {
      const el = document.querySelector('.bv-columns');
      if (!el || typeof html2canvas === 'undefined') return;
      const btn = e.target.closest('[data-action="bv-save-photo"]');
      btn.disabled = true;
      btn.textContent = '⏳ Зберігаю...';

      // Build a clean clone without empty trailing slots / empty reserve
      const clone = el.cloneNode(true);
      clone.style.cssText = `position:fixed;left:-9999px;top:0;width:${el.offsetWidth}px`;
      document.body.appendChild(clone);

      // Strip trailing empty slots from main grids
      clone.querySelectorAll('.bv-grid:not(.bv-grid-res)').forEach(grid => {
        const slots = Array.from(grid.querySelectorAll('.bv-slot'));
        let lastFilled = -1;
        slots.forEach((s, i) => { if (s.classList.contains('bv-slot--filled')) lastFilled = i; });
        slots.forEach((s, i) => { if (i > lastFilled) s.remove(); });
      });

      // Remove reserve section entirely if nothing is filled there
      clone.querySelectorAll('.bv-col').forEach(col => {
        const resGrid = col.querySelector('.bv-grid-res');
        if (!resGrid) return;
        const hasFilled = resGrid.querySelector('.bv-slot--filled');
        if (!hasFilled) {
          resGrid.remove();
          const resLbl = col.querySelector('.bv-res-lbl');
          if (resLbl) resLbl.remove();
        }
      });

      html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#1a1d27' })
        .then(canvas => {
          const link = document.createElement('a');
          link.download = 'gvg-battle.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        })
        .finally(() => {
          document.body.removeChild(clone);
          render();
        });
    }
  });

  function applySidebarFilter() {
    const sf  = getCurrentSidebarFilter();
    const q   = sf.search.toLowerCase();
    const bf  = sf.builds;
    const sqf = sf.squads;
    document.querySelectorAll('.bv-sidebar-list > *').forEach(row => {
      const name    = row.dataset.player || row.dataset.name || '';
      const nameOk  = !q   || name.toLowerCase().includes(q);
      const buildOk = bf.size  === 0 || bf.has(row.dataset.build  || '');
      const squadOk = sqf.size === 0 || sqf.has(row.dataset.squad || 'free');
      row.style.display = (nameOk && buildOk && squadOk) ? '' : 'none';
    });
  }

  $roster.addEventListener('input', e => {
    const input = e.target.closest('.bv-sidebar-search');
    if (!input) return;
    getCurrentSidebarFilter().search = input.value;
    applySidebarFilter();
  });

  $roster.addEventListener('click', e => {
    const fi = e.target.closest('[data-action="bv-build-filter"]');
    if (fi) {
      const sf  = getCurrentSidebarFilter();
      const key = fi.dataset.buildKey;
      if (sf.builds.has(key)) { sf.builds.delete(key); fi.classList.remove('bv-filter-active'); }
      else                    { sf.builds.add(key);    fi.classList.add('bv-filter-active');    }
      applySidebarFilter();
      return;
    }
    const si = e.target.closest('[data-action="bv-squad-filter"]');
    if (si) {
      const sf  = getCurrentSidebarFilter();
      const key = si.dataset.squadKey;
      if (sf.squads.has(key)) { sf.squads.delete(key); si.classList.remove('bv-filter-active'); }
      else                    { sf.squads.add(key);    si.classList.add('bv-filter-active');    }
      applySidebarFilter();
    }
  });

  let _dragPlayer = null;
  let _dragFromSlot = null;
  $roster.addEventListener('dragstart', e => {
    const card = e.target.closest('[data-player][draggable="true"]');
    if (!card) return;
    _dragPlayer = card.dataset.player;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragPlayer);
    card.classList.add('bv-dragging');
    // determine source slot
    const slot = card.closest('[data-slot-squad]');
    _dragFromSlot = slot
      ? { squad: slot.dataset.slotSquad, zone: slot.dataset.slotZone, idx: parseInt(slot.dataset.slotIdx) }
      : null;
  });
  $roster.addEventListener('dragend', () => {
    document.querySelectorAll('.bv-dragging').forEach(el => el.classList.remove('bv-dragging'));
    _dragPlayer = null;
    _dragFromSlot = null;
  });
  $roster.addEventListener('dragover', e => {
    const zone = e.target.closest('[data-droppable="true"]');
    if (!zone) return;
    e.preventDefault();
    document.querySelectorAll('.bv-drag-over').forEach(el => el.classList.remove('bv-drag-over'));
    zone.classList.add('bv-drag-over');
  });
  $roster.addEventListener('dragleave', e => {
    const zone = e.target.closest('[data-droppable="true"]');
    if (!zone || zone.contains(e.relatedTarget)) return;
    zone.classList.remove('bv-drag-over');
  });
  $roster.addEventListener('drop', e => {
    e.preventDefault();
    const zone = e.target.closest('[data-droppable="true"]');
    if (!zone) return;
    zone.classList.remove('bv-drag-over');
    const name = e.dataTransfer.getData('text/plain') || _dragPlayer;
    if (!name) return;

    if (zone.hasAttribute('data-slot-squad')) {
      // слот-ціль
      const toSquad = zone.dataset.slotSquad;
      const toZone  = zone.dataset.slotZone;
      const toIdx   = parseInt(zone.dataset.slotIdx);
      const toName  = battleSlots[toSquad][toZone][toIdx];

      if (_dragFromSlot) {
        // переміщення з одного слоту в інший (з можливим swap)
        const { squad: fSq, zone: fZone, idx: fIdx } = _dragFromSlot;
        battleSlots[fSq][fZone][fIdx]         = toName || null;
        battleSlots[toSquad][toZone][toIdx]   = name;
        const p = PLAYERS.find(x => x.name === name);
        if (p) p.squad = toSquad;
        if (toZone === 'reserve') battleReserves.add(name); else battleReserves.delete(name);
        if (toName) {
          const pTo = PLAYERS.find(x => x.name === toName);
          if (pTo) pTo.squad = fSq;
          if (fZone === 'reserve') battleReserves.add(toName); else battleReserves.delete(toName);
        }
      } else {
        // з вільного пулу або sidebar → слот
        removeFromSlots(name);
        if (toName) {
          const pTo = PLAYERS.find(x => x.name === toName);
          if (pTo) { pTo.squad = null; battleReserves.delete(toName); }
        }
        battleSlots[toSquad][toZone][toIdx] = name;
        const p = PLAYERS.find(x => x.name === name);
        if (p) p.squad = toSquad;
        if (toZone === 'reserve') battleReserves.add(name); else battleReserves.delete(name);
      }
    } else if (zone.dataset.dropTarget === 'free-list') {
      // підпало на вільний пул
      if (_dragFromSlot) {
        const { squad: fSq, zone: fZone, idx: fIdx } = _dragFromSlot;
        battleSlots[fSq][fZone][fIdx] = null;
      } else {
        removeFromSlots(name);
      }
      const p = PLAYERS.find(x => x.name === name);
      if (p) { p.squad = null; battleReserves.delete(name); }
    } else {
      return;
    }
    saveBattleState();
    render();
  });

  // ─── Preset: зміна вибору через select ──────────────────────────────────
  $roster.addEventListener('change', e => {
    const bvSel = e.target.closest('[data-action="bv-preset-select"]');
    if (bvSel) {
      const id = bvSel.value;
      activeBattlePresetId = id === '__live__' ? null : id;
      if (activeBattlePresetId === null) {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(BATTLE_STATE_KEY)); } catch {}
        applyBattleState(cached);
      } else {
        applyBattleState(battlePresets[activeBattlePresetId]);
      }
      render();
      return;
    }
    const svSel = e.target.closest('[data-action="sv-preset-select"]');
    if (svSel) {
      const id = svSel.value;
      activeStrategyPresetId = id === '__none__' ? null : id;
      sv.elements = activeStrategyPresetId
        ? JSON.parse(JSON.stringify(strategyPresets[activeStrategyPresetId]?.elements || []))
        : [];
      render();
    }
  });

  // ─── Preset: кнопки збереження / активації / перейменування / видалення ──
  $roster.addEventListener('click', e => {
    if (e.target.closest('[data-action="bv-preset-save"]')) {
      const name = prompt('Назва пресету:');
      if (!name?.trim()) return;
      if (!battleSlots) return;
      const data = {
        slots: {
          attack: { main: mapNull(battleSlots.attack.main), reserve: mapNull(battleSlots.attack.reserve) },
          def:    { main: mapNull(battleSlots.def.main),    reserve: mapNull(battleSlots.def.reserve) }
        },
        reserves: [...battleReserves]
      };
      fbSaveBattlePreset(name.trim(), data).then(id => { activeBattlePresetId = id; render(); });
      return;
    }
    if (e.target.closest('[data-action="bv-preset-activate"]') && activeBattlePresetId) {
      // застосовує поточний пресет як живий стан
      saveBattleState();
      activeBattlePresetId = null;
      render();
      return;
    }
    if (e.target.closest('[data-action="bv-preset-rename"]') && activeBattlePresetId) {
      const cur = battlePresets[activeBattlePresetId]?.name || '';
      const name = prompt('Нова назва:', cur);
      if (!name?.trim() || name.trim() === cur) return;
      fbUpdateBattlePreset(activeBattlePresetId, { name: name.trim() });
      return;
    }
    if (e.target.closest('[data-action="bv-preset-delete"]') && activeBattlePresetId) {
      if (!confirm(`Видалити пресет "${battlePresets[activeBattlePresetId]?.name}"?`)) return;
      fbDeleteBattlePreset(activeBattlePresetId);
      activeBattlePresetId = null;
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(BATTLE_STATE_KEY)); } catch {}
      applyBattleState(cached);
      render();
      return;
    }
    if (e.target.closest('[data-action="sv-preset-save"]')) {
      const name = prompt('Назва пресету:');
      if (!name?.trim()) return;
      fbSaveStrategyPreset(name.trim(), JSON.parse(JSON.stringify(sv.elements))).then(id => {
        activeStrategyPresetId = id;
        render();
      });
      return;
    }
    if (e.target.closest('[data-action="sv-preset-rename"]') && activeStrategyPresetId) {
      const cur = strategyPresets[activeStrategyPresetId]?.name || '';
      const name = prompt('Нова назва:', cur);
      if (!name?.trim() || name.trim() === cur) return;
      fbUpdateStrategyPreset(activeStrategyPresetId, { name: name.trim() });
      return;
    }
    if (e.target.closest('[data-action="sv-preset-delete"]') && activeStrategyPresetId) {
      if (!confirm(`Видалити пресет "${strategyPresets[activeStrategyPresetId]?.name}"?`)) return;
      fbDeleteStrategyPreset(activeStrategyPresetId);
      activeStrategyPresetId = null;
      sv.elements = [];
      render();
      return;
    }
  });
}

/* ─── Aurora background (random on load) ───────────────────────────────── */
const AURORA_PRESETS = [
  // 0%
  `radial-gradient(ellipse 80% 60% at 15% 40%, rgba(0,128,255,0.14) 0%, transparent 65%),
   radial-gradient(ellipse 60% 50% at 85% 15%, rgba(255,20,147,0.11) 0%, transparent 60%),
   radial-gradient(ellipse 70% 60% at 55% 85%, rgba(0,217,255,0.10) 0%, transparent 65%),
   radial-gradient(ellipse 50% 40% at 80% 65%, rgba(139,92,246,0.10) 0%, transparent 55%)`,
  // 33%
  `radial-gradient(ellipse 70% 50% at 30% 20%, rgba(0,128,255,0.16) 0%, transparent 65%),
   radial-gradient(ellipse 80% 60% at 75% 75%, rgba(255,20,147,0.09) 0%, transparent 65%),
   radial-gradient(ellipse 60% 40% at 20% 70%, rgba(0,217,255,0.12) 0%, transparent 60%),
   radial-gradient(ellipse 60% 50% at 90% 30%, rgba(139,92,246,0.11) 0%, transparent 60%)`,
  // 66%
  `radial-gradient(ellipse 60% 70% at 50% 55%, rgba(0,128,255,0.12) 0%, transparent 60%),
   radial-gradient(ellipse 50% 40% at 20% 45%, rgba(255,20,147,0.13) 0%, transparent 55%),
   radial-gradient(ellipse 80% 50% at 80% 20%, rgba(0,217,255,0.11) 0%, transparent 70%),
   radial-gradient(ellipse 40% 60% at 35% 85%, rgba(139,92,246,0.12) 0%, transparent 55%)`,
  // 100%
  `radial-gradient(ellipse 90% 50% at 70% 30%, rgba(0,128,255,0.12) 0%, transparent 70%),
   radial-gradient(ellipse 60% 60% at 40% 80%, rgba(255,20,147,0.10) 0%, transparent 60%),
   radial-gradient(ellipse 50% 70% at 90% 60%, rgba(0,217,255,0.13) 0%, transparent 65%),
   radial-gradient(ellipse 70% 40% at 10% 20%, rgba(139,92,246,0.09) 0%, transparent 55%)`,
];
document.documentElement.style.setProperty(
  '--aurora-bg',
  AURORA_PRESETS[Math.floor(Math.random() * AURORA_PRESETS.length)]
);

/* ─── Bootstrap ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLegend();
  initBuildPills();
  initSquadPills();
  initRolePills();
  initGearPills();
  initEvents();
  initPlayerModal();

  // Синхронно підтягуємо кеш гравців — щоб одразу показати актуальне число,
  // а не старий хардкод із data.js до відповіді Firebase.
  try {
    const cachedPlayers = JSON.parse(localStorage.getItem(PLAYERS_CACHE_KEY));
    if (cachedPlayers) applyFirebasePlayers(cachedPlayers);
  } catch {}

  // Редактор «Таблиця» доступний лише зі своєї прихованої сторінки (папка-рут),
  // яка ставить body[data-force-editor]. Жодна вкладка тоді не активна.
  if (document.body.dataset.forceEditor) {
    state.viewMode = 'editor';
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    // Анонімний вхід — щоб запис у Firebase працював без логіна (доступ = знання URL).
    // Після входу onAuthStateChanged викличе render() повторно.
    if (typeof fbSignInAnon === 'function') {
      fbSignInAnon().catch(err => console.error('anon sign-in failed:', err));
    }
  }
  render();

  // Слухаємо Firebase — оновлюємо стан для всіх підключених користувачів
  if (typeof fbListenBattleState === 'function') {
    fbListenBattleState(fbState => {
      if (!fbState) return;
      if (battleEditMode) return; // не перебиваємо поточне редагування
      // оновлюємо живий стан тільки якщо не переглядаємо пресет
      if (activeBattlePresetId === null) {
        applyBattleState(fbState);
        try { localStorage.setItem(BATTLE_STATE_KEY, JSON.stringify(fbState)); } catch {}
        if (state.viewMode === 'battle') render();
      }
    });
  }

  if (typeof fbListenBattlePresets === 'function') {
    fbListenBattlePresets(presets => {
      battlePresets = presets;
      if (activeBattlePresetId && !battlePresets[activeBattlePresetId]) {
        // активний пресет видалили
        activeBattlePresetId = null;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(BATTLE_STATE_KEY)); } catch {}
        applyBattleState(cached);
      }
      if (state.viewMode === 'battle') render();
    });
  }

  if (typeof fbListenStrategyPresets === 'function') {
    fbListenStrategyPresets(presets => {
      strategyPresets = presets;
      if (activeStrategyPresetId && !strategyPresets[activeStrategyPresetId]) {
        activeStrategyPresetId = null;
        sv.elements = [];
      }
      if (state.viewMode === 'strategy') render();
    });
  }

  if (typeof fbListenPlayers === 'function') {
    fbListenPlayers(data => {
      if (!data) return; // немає даних — лишаємо data.js
      try { localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(data)); } catch {}
      applyFirebasePlayers(data);
      syncSquadsFromSlots();
      initRolePills();
      render();
    });
  }
});
