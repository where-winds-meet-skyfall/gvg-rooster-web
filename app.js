'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
const SQUADS = {
  attack: { label: 'Attack', color: '#ef4444' },
  def:    { label: 'Defence',    color: '#3b82f6' }
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

let battleEditMode = false;
const battleReserves = new Set(); // імена гравців у резервному слоті
let battleSlots = null;           // { attack: { main:[×20], reserve:[×5] }, def: same }
let _battleSquadSnapshot = null;  // для кнопки «скинути»

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

function buildIconHtml(key, isAlt = false) {
  const b = getBuild(key);
  if (!b) return '';
  const icon = b.label.split(' ')[0];
  const name = b.label.replace(/^\S+\s*/, '');
  const cls  = isAlt ? 'sv-build-icon sv-build-icon--alt' : 'sv-build-icon';
  return `<span class="${cls}" style="--bc:${b.color}" title="${esc(name)}">${icon}</span>`;
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

/* ─── Battle View (redesigned) ─────────────────────────────────────────── */
function initBattleSlots() {
  const sorted = sortPlayers(PLAYERS);
  battleSlots = {
    attack: { main: Array(20).fill(null), reserve: Array(5).fill(null) },
    def:    { main: Array(20).fill(null), reserve: Array(5).fill(null) },
  };
  let ai = 0, ari = 0, di = 0, dri = 0;
  sorted.forEach(p => {
    if (p.squad === 'attack') {
      if (battleReserves.has(p.name)) { if (ari < 5)  battleSlots.attack.reserve[ari++] = p.name; }
      else                            { if (ai  < 20) battleSlots.attack.main[ai++]     = p.name; }
    } else if (p.squad === 'def') {
      if (battleReserves.has(p.name)) { if (dri < 5)  battleSlots.def.reserve[dri++]   = p.name; }
      else                            { if (di  < 20) battleSlots.def.main[di++]        = p.name; }
    }
  });
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
}

function bvRow(p, draggable) {
  const b     = getBuild(p.build);
  const bdg   = b ? `<span class="badge bv-badge" style="background:${b.color}">${esc(b.label)}</span>` : '';
  const icons = (p.roles || []).map(r => ROLE_ICONS[r] || '').filter(Boolean).join('');
  return `<div class="bv-row" data-player="${esc(p.name)}"${draggable ? ' draggable="true"' : ''}><span class="bv-name">${esc(p.name)}</span>${bdg}${icons ? `<span class="bv-roles">${icons}</span>` : ''}</div>`;
}

function bvCard(name) {
  const p = PLAYERS.find(x => x.name === name);
  const b = p ? getBuild(p.build) : null;
  const icons = p ? (p.roles || []).map(r => ROLE_ICONS[r] || '').filter(Boolean).join('') : '';
  const drag = battleEditMode ? ' draggable="true"' : '';
  const badgeHtml = b
    ? `<span class="bv-card-badge" style="background:${b.color}">${esc(b.label)}</span>`
    : `<span class="bv-card-badge bv-card-badge--empty"></span>`;
  return `<div class="bv-card" data-player="${esc(name)}"${drag}>${badgeHtml}<span class="bv-card-name">${esc(name)}</span><span class="bv-card-icons">${icons}</span></div>`;
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

  $statsBar.innerHTML = `<div class="stats-summary">
  <span class="stat-pill" style="background:#ef4444">⚔️ Attack: ${atkFilled}</span>
  <span class="stat-pill" style="background:#3b82f6">🛡️ Defence: ${defFilled}</span>
  ${free.length ? `<span class="stat-pill" style="background:#64748b">🔄 Вільні: ${free.length}</span>` : ''}
</div>`;
  $statsBar.classList.remove('hidden');

  const dz = battleEditMode ? ' data-droppable="true"' : '';
  const freeRows = free.map(p => bvRow(p, battleEditMode)).join('');
  const poolHtml = (free.length > 0 || battleEditMode)
    ? `<div class="bv-pool bv-zone" data-squad="__free__" data-reserve="false"${dz}><div class="bv-pool-hdr">🔄 Незакріплені${free.length ? ` · ${free.length}` : ''}</div>${freeRows || '<span class="bv-empty-hint">Всі гравці розподілені</span>'}</div>`
    : '';

  const sideHtml = battleEditMode
    ? `<aside class="bv-sidebar"><div class="bv-sidebar-hdr">Всі гравці</div><div class="bv-sidebar-list">${
        sortPlayers(PLAYERS).map(p => {
          const b    = getBuild(p.build);
          const inA  = battleSlots.attack.main.includes(p.name) || battleSlots.attack.reserve.includes(p.name);
          const inD  = battleSlots.def.main.includes(p.name)    || battleSlots.def.reserve.includes(p.name);
          const si   = inA ? '⚔' : inD ? '🛡' : '·';
          return `<div class="bv-sidebar-row" data-player="${esc(p.name)}" draggable="true"><span class="bv-dot" style="background:${b ? b.color : '#475569'}"></span><span class="bv-name">${esc(p.name)}</span><span class="bv-squad-lbl">${si}</span></div>`;
        }).join('')
      }</div></aside>`
    : '';

  const toolbarBtns = battleEditMode
    ? `<button class="btn-bv-edit active" data-action="bv-toggle-edit">✓ Готово</button><button class="btn-bv-reset" data-action="bv-reset">� Очистити пачки</button>`
    : `<button class="btn-bv-edit" data-action="bv-toggle-edit">✏️ Редагувати</button><button class="btn-bv-photo" data-action="bv-save-photo">📷 Зберегти фото</button>`;

  return `<div class="bv-wrap${battleEditMode ? ' bv-edit' : ''}">
  <div class="bv-main">
    <div class="bv-toolbar">${toolbarBtns}</div>
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

function svDrawArrow(ctx, x1, y1, x2, y2, color, alpha) {
  alpha = alpha ?? 1;
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.sqrt(dx * dx + dy * dy) < 6) return;
  const angle   = Math.atan2(dy, dx);
  const headLen = 18;
  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.strokeStyle  = color;
  ctx.fillStyle    = color;
  ctx.lineWidth    = 4;
  ctx.lineCap      = 'round';
  ctx.shadowColor  = color;
  ctx.shadowBlur   = 8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - headLen * 0.65 * Math.cos(angle), y2 - headLen * 0.65 * Math.sin(angle));
  ctx.stroke();
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
  const fSize     = 11;
  const padX      = 7, padY = 4;
  const radius    = 4;
  const emojiGap  = 3;
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
  ctx.shadowBlur  = 7;
  ctx.fillStyle   = color;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.roundRect(lx, ty, w, h, radius);
  ctx.fill();

  // border
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth   = 1.2;
  ctx.stroke();

  // emoji icon
  if (emoji) {
    ctx.font         = `${fSize + 1}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle    = '#fff';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur   = 2;
    ctx.fillText(emoji, lx + padX, y);
  }

  // name
  ctx.font         = `bold ${fSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle    = '#fff';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur   = 3;
  ctx.fillText(short, lx + padX + emojiW, y);

  ctx.restore();
}

function svDrawCanvas(preview) {
  const { canvas, ctx, mapImg, elements, arrowStart, color } = sv;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mapImg) {
    ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0d1126';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  elements.forEach(el => {
    if (el.type === 'arrow')  svDrawArrow(ctx, el.x1, el.y1, el.x2, el.y2, el.color);
    if (el.type === 'player') svDrawPlayer(ctx, el.x, el.y, el.name, el.color, el.build);
  });
  if (arrowStart) {
    // dot at start
    ctx.save();
    ctx.beginPath();
    ctx.arc(arrowStart.x, arrowStart.y, 6, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.restore();
    if (preview) svDrawArrow(ctx, arrowStart.x, arrowStart.y, preview.x, preview.y, color, 0.55);
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
      if (Math.hypot(el.x - x, el.y - y) <= 20) return i;
    } else if (el.type === 'arrow') {
      if (svDistToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= 14) return i;
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

  if (sv.tool === 'arrow') {
    if (!sv.arrowStart) {
      sv.arrowStart = pos;
    } else {
      sv.elements.push({ type: 'arrow', x1: sv.arrowStart.x, y1: sv.arrowStart.y, x2: pos.x, y2: pos.y, color: sv.color });
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
  if (sv.tool === 'arrow' && sv.arrowStart) {
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
    canvas.width  = sv.mapImg ? sv.mapImg.naturalWidth  : 1200;
    canvas.height = sv.mapImg ? sv.mapImg.naturalHeight : 750;
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
  const playerItems = PLAYERS.map(p => {
    const b = getBuild(p.build);
    const color = b?.color ?? '#64748b';
    const squadColor = p.squad ? (SQUADS[p.squad]?.color ?? '#64748b') : null;
    const dotHtml = squadColor ? `<span class="sv-squad-dot" style="background:${squadColor}"></span>` : '';
    const iconsHtml = `<span class="sv-build-icons">${buildIconHtml(p.build)}${buildIconHtml(p.altBuild, true)}</span>`;
    return `<div class="sv-player-item" data-name="${esc(p.name)}" style="--pc:${color}">
  ${dotHtml}<span class="sv-player-name">${esc(p.name)}</span>${iconsHtml}
</div>`;
  }).join('');

  const toolBtn = t => `<button class="sv-btn${sv.tool === t ? ' active' : ''}" data-sv-tool="${t}">`;
  const colorBtn = c => `<button class="sv-color-btn${sv.color === c ? ' active' : ''}" data-sv-color="${c}" style="--c:${c}">`;

  return `<div class="sv-wrap">
  <div class="sv-toolbar">
    <div class="sv-tool-group">
      ${toolBtn('arrow')}↗ Стрілка</button>
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
      <div class="sv-sidebar-title">Гравці</div>
      ${playerItems}
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

  switch (state.viewMode) {
    case 'grouped':  $roster.innerHTML = viewGrouped(sorted); break;
    case 'battle':   $roster.innerHTML = viewBattle();        break;
    case 'strategy': $roster.innerHTML = viewStrategy(); initStrategyCanvas(); break;
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

  // Escape — скасувати дію в режимі стратегії
  document.addEventListener('keydown', e => {
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

  // ─── Бойовий вигляд: редагування + DnD ─────────────────────────────────
  $roster.addEventListener('click', e => {
    if (e.target.closest('[data-action="bv-toggle-edit"]')) {
      if (!battleEditMode) {
        if (!battleSlots) initBattleSlots();
        snapshotBattle();
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
    } else {
      // підпало на вільний пул
      if (_dragFromSlot) {
        const { squad: fSq, zone: fZone, idx: fIdx } = _dragFromSlot;
        battleSlots[fSq][fZone][fIdx] = null;
      } else {
        removeFromSlots(name);
      }
      const p = PLAYERS.find(x => x.name === name);
      if (p) { p.squad = null; battleReserves.delete(name); }
    }
    render();
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
  render();
});
