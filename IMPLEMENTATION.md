# GvG Battle Card — F4 Redesign · Implementation Spec

Замена дизайна карточки `.bv-card` в боевом виде (`Бойова пачка`).
**Превью:** `Battle Card Redesign.html` (в этом проекте) — открой и сравни с текущим.

## Дизайн-правила (что мы делаем)

| Сущность | Как отображается |
|---|---|
| **Build** | тонкая (2px) верхняя черта цветом билда + крошечный лейбл в углу |
| **Имя игрока** | большое, по центру вертикально |
| **Officer** | маленькая золотая корона `♛` слева от имени, ~0.85em |
| **MVP** (`gearLevel === 'high'`) | две тонкие розовые косые черты, срезающие правый верхний угол |
| **Jungle** | компактный зелёный чип `✿ JNG` внизу |
| **Ninja** | компактный сланцевый чип `◆ NIN` внизу |
| **Gear low/mid** | не отображается (для боевой карточки нерелевантно) |

Что **исчезает**: 4 диагональные полосы (`.bv-stripe--officer/jungle/ninja/gear-*`), watermark-glyph внутри полос, `bv-card-panel`, `bv-card-header`, `bv-card-stripes`.

---

## 1. JS — `app.js`

Заменить функцию `bvCard(name, info)` (или то место, где сейчас собирается HTML `.bv-card` со строками 596–606 файла) на:

```js
function bvCard(name, info, opts = {}) {
  const draggable = opts.draggable !== false;
  const b         = info.build ? BUILDS[info.build] : null;
  const buildColor = b ? b.color : 'rgba(80,86,110,1)';
  const buildLabel = b ? esc(b.label) : '';
  const roles     = info.roles || [];
  const isOfficer = roles.includes('Officer');
  const isJungle  = roles.includes('Jungle');
  const isNinja   = roles.includes('Ninja');
  const isMvp     = info.gearLevel === 'high';

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
  const drag = draggable ? ' draggable="true"' : '';

  return `<div class="bv-card" data-player="${esc(name)}"${drag} style="--bc:${buildColor}">
  <div class="bv-card-build">${buildLabel}</div>
  <div class="bv-card-name">${officer}<span class="bv-name-text">${esc(name)}</span></div>
  ${tags}
  ${mvp}
</div>`;
}
```

**Важно:** сигнатура осталась прежней (`bvCard(name, info)`), все вызовы из кода продолжают работать без изменений. Если в существующем коде `info` приходит чем-то отличным от объекта игрока — адаптируй извлечение `roles`/`gearLevel`/`build` к своей схеме данных.

---

## 2. CSS — `style.css`

### 2.1. Удалить (или закомментировать) старые блоки

Удалить весь блок старого дизайна — это строки примерно 943–1085 в `style.css`. Конкретные селекторы:

```
.bv-card                       (текущий вид с --bc как background)
.bv-card[draggable="true"]
.bv-card-panel
.bv-card-header
.bv-card-stripes
.bv-stripe
.bv-stripe--empty
.bv-stripe--officer
.bv-stripe--jungle
.bv-stripe--ninja
.bv-stripe--gear-high
.bv-stripe--gear-low
.bv-stripe--officer::before
.bv-stripe--jungle::before
.bv-stripe--ninja::before
.bv-stripe--gear-low::before
.bv-stripe--gear-high::before
.bv-card-name
```

А также view-mode оверрайды (около строки 1095):

```
.bv-col--view .bv-card-name
.bv-col--view .bv-card-header
.bv-col--view .bv-card-panel
.bv-col--view .bv-card-stripes
.bv-col--view .bv-stripe--officer::before
.bv-col--view .bv-stripe--jungle::before
.bv-col--view .bv-stripe--ninja::before
.bv-col--view .bv-stripe--gear-low::before
.bv-col--view .bv-stripe--gear-high::before
```

### 2.2. Вставить новый блок

```css
/* ─── Battle Card · F4 redesign ─────────────────────────────────────── */
.bv-card {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: #0d1126;
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  user-select: none;
  transition: transform 0.14s ease, box-shadow 0.18s ease, border-color 0.18s;
  box-shadow:
    0 3px 10px -3px rgba(0,0,0,0.55),
    inset 0 0 0 1px rgba(255,255,255,0.02);
}
.bv-card[draggable="true"] { cursor: grab; }
.bv-card[draggable="true"]:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--bc, var(--accent)) 45%, transparent);
  box-shadow:
    0 6px 18px -4px rgba(0,0,0,0.65),
    0 0 14px -2px color-mix(in srgb, var(--bc, var(--accent)) 35%, transparent);
}
.bv-card.bv-dragging { opacity: 0.3; }

/* верхняя тонкая черта — build color */
.bv-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--bc, var(--accent));
  opacity: 0.85;
  z-index: 3;
}

/* build label в углу */
.bv-card-build {
  position: absolute;
  top: 5px; left: 10px; right: 10px;
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bc, var(--accent));
  opacity: 0.92;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  z-index: 3;
}

/* строка с именем + офицерской короной */
.bv-card-name {
  position: absolute;
  top: 18px; bottom: 18px;
  left: 10px; right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f7faff;
  line-height: 1.05;
  letter-spacing: 0.2px;
  z-index: 2;
  overflow: hidden;
}
.bv-card-name .bv-name-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
.bv-officer-mark {
  font-size: 0.85em;
  color: #eab308;
  text-shadow: 0 0 6px rgba(234,179,8,0.45);
  flex-shrink: 0;
  line-height: 1;
}

/* нижний ряд — компактные чипы Jungle/Ninja (есть, только если роль есть) */
.bv-card-tags {
  position: absolute;
  left: 8px; right: 8px;
  bottom: 4px;
  display: flex;
  gap: 4px;
  height: 14px;
  align-items: center;
  z-index: 2;
}
.bv-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  height: 14px;
  border-radius: 999px;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 14px;
  white-space: nowrap;
}
.bv-tag-glyph { font-size: 0.7rem; line-height: 1; }
.bv-tag--jungle {
  background: rgba(34,197,94,0.14);
  border: 1px solid rgba(34,197,94,0.42);
  color: #4ade80;
}
.bv-tag--ninja {
  background: rgba(148,163,184,0.16);
  border: 1px solid rgba(148,163,184,0.42);
  color: #cbd5e1;
}

/* MVP — две тонкие розовые косые в правом верхнем углу */
.bv-mvp {
  position: absolute;
  top: 0; right: 0;
  width: 56px;
  height: 56px;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}
.bv-mvp::before,
.bv-mvp::after {
  content: '';
  position: absolute;
  right: -18px;
  width: 80px;
  height: 1px;
  transform: rotate(-45deg);
  transform-origin: right center;
}
.bv-mvp::before {
  top: 8px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(236,72,153,0.7) 55%,
    rgba(236,72,153,0.95) 100%);
}
.bv-mvp::after {
  top: 15px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(236,72,153,0.45) 55%,
    rgba(236,72,153,0.65) 100%);
}

/* View mode — слоты 96px, всё чуть больше */
.bv-col--view .bv-slot         { height: 96px; }
.bv-col--view .bv-card-name    { font-size: 1.15rem; top: 22px; bottom: 22px; }
.bv-col--view .bv-card-build   { font-size: 0.66rem; top: 7px; letter-spacing: 0.15em; }
.bv-col--view .bv-card-tags    { height: 16px; bottom: 6px; }
.bv-col--view .bv-tag          { height: 16px; line-height: 16px; padding: 0 7px; font-size: 0.6rem; }
.bv-col--view .bv-tag-glyph    { font-size: 0.78rem; }
.bv-col--view .bv-mvp          { width: 72px; height: 72px; }
.bv-col--view .bv-mvp::before  { top: 12px; }
.bv-col--view .bv-mvp::after   { top: 21px; }
```

---

## 3. Что НЕ трогать

- Существующие классы вокруг карточки: `.bv-slot`, `.bv-slot--empty`, `.bv-slot--filled`, `.bv-grid`, `.bv-zone`, `.bv-drag-over`, `.bv-col-hdr`. Они продолжают работать.
- HTML-структуру `.bv-grid` и слотов.
- Drag&drop логику в `app.js`.
- Семантику `data-player` атрибута (используется в DnD).

---

## 4. Проверка после применения

1. Все 8 цветов билдов читаются как верхняя черта + лейбл (Heal зелёный, Tank жёлтый, Nameless синий и т.д.).
2. У `OldRock`, `LuthiXia`, `LELUSH`, `Kelevra` — золотая корона перед ником.
3. У игроков с `gearLevel: 'high'` (`Kelevra`, `Geerion`, `BayarD`, `Endurist`, `CantBeTouched`, `AUrory`) — две розовые косые в правом верхнем углу.
4. У `SunRise`, `EnEr`, `Endurist`, `LELUSH`, `Chifusama` — зелёный чип `✿ JNG` внизу.
5. У `StanislavZal`, `ArthurPencilgun`, `AUrory` — серый чип `◆ NIN` внизу.
6. У `AUrory` (Officer + Jungle + Ninja + MVP) одновременно: корона перед ником, две косые в углу, оба чипа внизу — и при этом не перегружено.
7. В режиме `View` (если у вас он включается через `.bv-col--view`) карточки увеличены, элементы пропорционально подросли.

---

## 5. Известные граничные случаи

- **Длинные ники** (`ArthurPencilgun`, `MariSkywalker`, `CantBeTouched`) — `.bv-name-text` обрезается ellipsis. На очень узких слотах (`<120px`) корона забирает место — это сознательно: в существующем интерфейсе слоты не уже 130–160px.
- **Officer + MVP на одной карточке** — корона слева не пересекается с косыми в правом верхнем углу даже на самой узкой ширине.
- **CSS `color-mix`** в hover — поддерживается всеми современными браузерами (Safari 16.4+). Если нужна поддержка старее, замени hover-стили на статические `rgba(74,158,255,0.45)` / `rgba(0,0,0,0.4)`.

---

## 6. Опционально: пин MVP-бейджа

Если хочется ещё подчеркнуть MVP — добавь крошечный pink-dot прямо к концу строки имени:

```css
.bv-card[data-mvp="true"] .bv-name-text::after {
  content: '';
  display: inline-block;
  width: 5px; height: 5px;
  margin-left: 5px;
  border-radius: 50%;
  background: #ec4899;
  box-shadow: 0 0 6px rgba(236,72,153,0.7);
  vertical-align: middle;
}
```

И в JS добавить `data-mvp="${isMvp}"` на `.bv-card`. Но это опционально — две косые в углу уже достаточно сильный сигнал.
