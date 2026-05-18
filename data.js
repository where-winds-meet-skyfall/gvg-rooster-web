/**
 * КОНФИГ БИЛДОВ
 * Единственное место, где задаются доступные билды и их цвета.
 * Ключи в PLAYERS.build / PLAYERS.altBuild должны совпадать с ключами здесь.
 * Формат: ключ: { label: "Название", color: "#hex" }
 *
 * Пример:
 *   tank:    { label: "Танк",       color: "#3b82f6" },
 *   healer:  { label: "Хилер",      color: "#22c55e" },
 *   melee:   { label: "Ближний ДД", color: "#ef4444" },
 *   ranged:  { label: "Дальний ДД", color: "#f59e0b" },
 *   support: { label: "Саппорт",    color: "#a855f7" },
 */
const BUILDS = {
  // ── Heal ──────────────────────────────────────────
  heal: {
    label:      "Heal",
    color:      "#22c55e",
    category:   "Heal",
    techniques: ["Panacea (Fan)", "Soulshade (Umbrella)"],
    weapons:    ["Fan", "Umbrella"]
  },

  // ── DD ────────────────────────────────────────────
  umbrella_dd: {
    label:      "Umbrella DD",
    color:      "#4ade80",
    category:   "DD",
    techniques: ["Inkwell (Fan)", "Vernal (Umbrella)"],
    weapons:    ["Fan", "Umbrella"]
  },
  umbrella_dd_aoe: {
    label:      "Umbrella DD AOE",
    color:      "#a855f7",
    category:   "DD",
    techniques: ["Unfettered (Whip)", "Everspring (Umbrella)"],
    weapons:    ["Whip", "Umbrella"]
  },
  nameless: {
    label:      "Nameless",
    color:      "#3b82f6",
    category:   "DD",
    techniques: ["Nameless Sword", "Nameless Spear"],
    weapons:    ["Sword", "Spear"]
  },
  strategic: {
    label:      "Strategic",
    color:      "#60a5fa",
    category:   "DD",
    techniques: ["Strategic Sword", "Heavensquaker Spear"],
    weapons:    ["Sword", "Spear"]
  },
  duals: {
    label:      "Duals",
    color:      "#d946ef",
    category:   "DD",
    techniques: ["Infernal Twinblades", "Mortal Rope Dart"],
    weapons:    ["Twinblades", "Rope Dart"]
  },

  // ── Tank ──────────────────────────────────────────
  tank: {
    label:      "Tank",
    color:      "#9f1239",
    category:   "Tank",
    techniques: ["Thundercy Blade (Mo Blade)", "Stormbreaker (Spear)"],
    weapons:    ["Mo Blade", "Spear"]
  },
  katana: {
    label:      "Katana",
    color:      "#be123c",
    category:   "Tank",
    techniques: ["Snowparting (Mo Blade)", "Phalanxbane (Katana)"],
    weapons:    ["Mo Blade", "Katana"]
  }
};

/**
 * СПИСОК ИГРОКОВ ГИЛЬДИИ
 * Поля:
 *   name      — игровое имя
 *   build     — ключ основного билда из BUILDS
 *   altBuild  — ключ альт-билда из BUILDS, либо null
 *   gearLevel — уровень шмота (число)
 *   ready     — готов ли на бой 30×30 (true / false)
 *   squad     — пачка: "attack" | "def" | null (не распределён)
 *   roles     — массив доп. ролей: [] | ["officer"] | ["ranger"] | ["ninja"] и т.д.
 *   note      — тактическая заметка ("фокус", "фланг", "защита точки" и т.п.), либо ""
 *
 * Пример:
 *   { name: "Tankmaster", build: "tank",   altBuild: null,      gearLevel: 2100, ready: true,  squad: "def",    roles: ["officer"], note: "фокус" },
 *   { name: "HolyLight",  build: "heal",   altBuild: null,      gearLevel: 1950, ready: true,  squad: "attack", roles: [],          note: "" },
 *   { name: "ShadowX",    build: "duals",  altBuild: null,      gearLevel: 1780, ready: false, squad: null,     roles: ["ranger"],   note: "фланг" },
 */
const PLAYERS = [
  // Добавить игроков здесь
];
