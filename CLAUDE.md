# CLAUDE.md — Інструкції для AI-асистента

## Про проект

Веб-ростер гільдії для гри WWM (режим GvG 30×30).
Статичний сайт, задеплоєний на **GitHub Pages**.
Бекенд — **Firebase Realtime Database** (зберігання стану пачок, авторизація).

Основна аудиторія: учасники гільдії, перегляд переважно з телефону (Discord-контекст).

---

## Дизайн-система

**Завжди слідувати [aurora-ui-DESIGN.md](aurora-ui-DESIGN.md)**

Ключові правила:
- Стиль: Aurora UI — темний фон, Northern Lights ефект, flowing radial-gradients
- Палітра: Electric Blue `#0080FF`, Magenta `#FF1493`, Cyan `#00D9FF`, Violet `#8B5CF6`
- Темний фон: `#07091a`, поверхні: `rgba(255,255,255,0.04–0.07)`
- Кути: `0.75rem` (cards, buttons, inputs)
- Шрифт: System UI stack, без зовнішніх шрифтів
- Анімації: тільки `transform` і `opacity`, 200–480ms
- **Заборонено:** чистий чорний, oversaturated кольори, емодзі як іконки (але емодзі в бейджах білдів — ОК, це ігрові назви)

---

## Мова

З [TZ-guild-roster.md](TZ-guild-roster.md):
- UI-мітки, кнопки, заголовки — **українською**
- Назви білдів — **англійською** (назви з гри)
- Коментарі в коді — **українською**
- **Російська мова не використовується ніде**

---

## Стек і архітектура

```
index.html      — розмітка, підключення скриптів, login-modal
style.css       — всі стилі (один файл, без препроцесорів)
data.js         — BUILDS конфіг + PLAYERS масив (джерело правди про гравців)
app.js          — вся логіка UI, render, battle view, drag-and-drop
firebase.js     — Firebase init, Email/Password авторизація, DB read/write
mapdata.js      — base64 зображення карти для вкладки Стратегія
html2canvas.min.js — скріншот бойової пачки
```

**Без бандлерів, без фреймворків, без npm.** Чистий Vanilla JS.
Firebase підключається через CDN compat-скрипти в `index.html`.

---

## Firebase

**Проект:** `gvg-rooster` (europe-west1)
**Database URL:** `https://gvg-rooster-default-rtdb.europe-west1.firebasedatabase.app`

### Авторизація
- Метод: **Email/Password**
- Внутрішній формат email: `{username}@gvg-roster.app`
- Поточний адмін: `skyfall@gvg-roster.app`
- Пароль зберігається тільки у Firebase, в коді немає
- Функції: `fbIsAdmin()`, `fbSignIn(username, password)`, `fbSignOut()`

### Database Rules (встановити в Firebase Console)
```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null"
  }
}
```

### Структура даних в DB
```
battleState/
  slots/
    attack/ { main: [20 імен|null], reserve: [5 імен|null] }
    def/    { main: [20 імен|null], reserve: [5 імен|null] }
  reserves: [імена гравців у резерві]
```

---

## Ключові змінні app.js

| Змінна | Тип | Опис |
|--------|-----|------|
| `PLAYERS` | `Array` | Масив гравців з data.js, мутується при drag-and-drop |
| `BUILDS` | `Object` | Конфіг білдів з data.js |
| `battleSlots` | `Object\|null` | Поточний стан слотів пачок |
| `battleReserves` | `Set` | Імена гравців у резерві |
| `battleEditMode` | `boolean` | Чи активний режим редагування |
| `state.viewMode` | `string` | `'list'\|'grouped'\|'battle'\|'strategy'` |
| `INITIAL_BATTLE_STATE` | `Object` | Хардкод початкового стану (fallback якщо Firebase і localStorage порожні) |
| `BATTLE_STATE_KEY` | `string` | Ключ localStorage для кешу |

### Потік збереження стану пачок
1. Drag-and-drop або reset → `saveBattleState()`
2. `saveBattleState()` → пише в Firebase (якщо `fbIsAdmin()`) + кешує в localStorage
3. `fbListenBattleState()` слухає зміни → `applyBattleState()` → `render()` для всіх підключених
4. При першому відкритті: `initBattleSlots()` → localStorage-кеш або `INITIAL_BATTLE_STATE`

---

## Модель даних гравця (data.js)

```js
{
  name:      "string",           // ігрове ім'я (точне написання)
  build:     "keyFromBUILDS",    // основний білд
  altBuild:  "keyFromBUILDS"|null,
  gearLevel: "low"|"mid"|"high",
  ready:     boolean,
  squad:     "attack"|"def"|null, // оновлюється при редагуванні пачок
  roles:     ["Officer","Jungle","Ninja"], // масив, може бути []
  note:      "string"            // тактична нотатка
}
```

**Важливо:** `squad` в data.js — початковий стан. Після першого відкриття бойового вигляду реальний стан береться з Firebase/localStorage і `squad` перебудовується через `applyBattleState()`.

---

## Правила редагування коду

- **Не додавати** npm, webpack, TypeScript, фреймворки — проект навмисно без білду
- **Не додавати** коментарі що пояснюють ЩО робить код — тільки ЧОМУ (якщо неочевидно)
- **Не додавати** зайвої обробки помилок для неможливих сценаріїв
- **Не реструктурувати** код без явного запиту — зберігати поточну архітектуру
- CSS — в `style.css`, без inline-стилів для layout (inline тільки для динамічних кольорів)
- Зміни в `data.js` (додати/прибрати гравця) не потребують змін в інших файлах

---

## Поточні вкладки (viewMode)

| Вкладка | viewMode | Опис |
|---------|----------|------|
| Гравці | `list` | Список всіх гравців з фільтрами |
| По білдах | `grouped` | Групування по основному білду |
| Бойова пачка | `battle` | Drag-and-drop слоти Attack/Defence, 20 основних + 5 резерв |
| Стратегія | `strategy` | Canvas з картою, малювання стрілок і розстановка гравців |

---

## Деплой

GitHub Pages з гілки `master`, папка `/root`.
Після `git push` — сайт оновлюється автоматично (~1 хв).
Firebase-дані не залежать від деплою.
