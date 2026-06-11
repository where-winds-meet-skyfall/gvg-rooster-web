# План: Excel-редактор ростера

Мета: вбудована «таблиця як Excel» сторінка для зручного редагування гравців
пулом людей. Дані — єдине джерело правди в **Firebase** (`players/`), решта
вкладок читають їх через наявний `fbListenPlayers`. Поточні вкладки не ламаються.

## Рішення (зафіксовані)

- **Джерело правди** — Firebase `players/`, ключ гравця = `name`.
  Перейменування = delete+create ([app.js](app.js) `savePlayerData`) — прийнятно.
- **Модель розширюється**, старі поля лишаються. `Class for GvG = build`,
  `Main Class = altBuild` (переvикористовуємо, без дублів).
- **Нові поля:** `device`, `mainRole`, `arenaRank`, `prevSeasonMythic`, `mastery`.
- **Доступ:** сторінка-редактор за непублічним посиланням. **Редагування завжди**
  — сторінка робить анонімний вхід (`fbSignInAnon`), тож запис у `players/` працює
  без логіна (правило `.write: auth != null`). Доступ = знання URL (не захист).
  Анонімний вхід ≠ адмін (`isAnonymous`), тож на публічних вкладках адмін-контролів
  гостю не видно; battle/пресети лишаються лише під `fbIsAdmin()`.
  **Потрібно ввімкнути Anonymous у Firebase Console → Authentication → Sign-in method.**

## Довідники dropdown-ів (data.js)

| Поле | Тип | Значення |
|------|-----|----------|
| `device` | dropdown | PC/Note, Console, Tablet, Mobile, PC/Note/Mobile, PC/Tablet |
| `mainRole` | dropdown | Nameless, Heal, Strategic, Tank, Katana, Duals, Umbrella, Umbrella AOE, Fist |
| `arenaRank` | dropdown | 0-1000, 1001-2000, 2001-3000, Mythic |
| `prevSeasonMythic` | boolean | Yes / No |
| `mastery` | число | вільне введення |

## Фази

### Фаза 1 — Модель даних ✅ ЗАВЕРШЕНО
- [x] Довідники `DEVICE_OPTIONS`, `MAIN_ROLES`, `ARENA_RANKS` у [data.js](data.js).
- [x] Оновлено документацію моделі гравця в [data.js](data.js).
- [x] Нові поля додано в усі точки маппінгу:
  `playersToFirebaseMap` ([app.js:31](app.js#L31)),
  `applyFirebasePlayers` ([app.js:47](app.js#L47)),
  експорт ([app.js:381](app.js#L381)),
  імпорт ([app.js:419](app.js#L419)).
- [x] Виправлено баг: форма редагування гравця через `.set()` стирала нові поля —
  тепер переносить їх із наявного гравця ([app.js:1266](app.js#L1266)).

### Фаза 2 — Сидінг ✅ ЗАВЕРШЕНО
- [x] Кнопка під адміном: одноразова заливка гравців із data.js у Firebase
  (через наявний `fbSaveAllPlayers`). Після цього listener бере дані з БД.
  Кнопка `editor-seed` у редакторі, показується доки `!_playersInFirebase`.

### Фаза 3 — Редактор ✅ ЗАВЕРШЕНО
- [x] Новий `viewMode: 'editor'`, **прихований з таб-бара** — відкривається лише
  за окремим рутом `/aurora-forge/` ([aurora-forge/index.html](aurora-forge/index.html)).
  Сторінка дзеркалить кореневий index.html, але через `<base href="../">` тягне ті
  самі `style.css`/`app.js`/`data.js` (без дублювання логіки) і ставить
  `body[data-force-editor]`. Рендер лише під `fbIsAdmin()`, завжди в режимі
  редагування (inline). Рут переживає перезавантаження. З редактора видно звичайні
  вкладки, а зі звичайних сторінок потрапити в редактор не можна (нема ні вкладки,
  ні посилання).
- [x] Excel-подібна таблиця: рядки гравців, inline-комірки + dropdown-и
  (`viewEditor`, `edSelect` у [app.js](app.js)).
- [x] Запис по конкретному шляху `players/{name}/{field}` через
  `fbSavePlayerField` ([firebase.js](firebase.js)) — `editorWriteField`.
  Доки не засіяно — fallback на повний `fbSaveAllPlayers`.
- [x] Перейменування = delete+create через `savePlayerData` (`editorRename`).

### Фаза 4 — Навороти ✅ ЗАВЕРШЕНО
- [x] Клієнтське сортування — клік по заголовку колонки (`editorSort`,
  `editorSortedPlayers`, `EDITOR_COLUMNS`). Toggle asc/desc, стрілка ↑/↓.
- [x] Додавання рядка (`editorAddPlayer`, кнопка `editor-add`) — prompt імені,
  дефолтні поля, запис через `savePlayerData`.
- [x] Видалення рядка (`editorDeleteRow`, кнопка `editor-del` у кожному рядку) —
  confirm + `deletePlayerData`.
- [x] Експорт CSV (`editorExportCsv`, кнопка `editor-export-csv`) — з BOM для
  кирилиці в Excel, людиночитні значення (лейбли білдів/споряди, Yes/No).

### Фаза 5 — Полірування ✅ ЗАВЕРШЕНО
- [x] Стилізація під Aurora UI ([aurora-ui-DESIGN.md](aurora-ui-DESIGN.md)) —
  всі комірки/кнопки/заголовки на токенах (`--accent`, `--border`, `--surface-solid`,
  `0.75rem`), акцент на активному заголовку сортування (`th.is-sorted`).
- [x] Мобільний скрол: горизонтальний скрол через `.editor-wrap`, **закріплена
  перша колонка (ім'я)** щоб не губилась при скролі, брейкпоінт `max-width: 640px`
  зі щільнішими відступами.

## Точки коду (опорні)

| Що | Де |
|----|----|
| Firebase players API | [firebase.js:112-130](firebase.js#L112-L130) |
| Слухач players | [app.js:1744](app.js#L1744) |
| Застосування даних з БД | [app.js:47](app.js#L47) |
| Збереження/видалення гравця | [app.js:79-103](app.js#L79-L103) |
| Форма редагування гравця | [app.js:1266](app.js#L1266) |
| Перемикання viewMode | [app.js:1279](app.js#L1279) |
