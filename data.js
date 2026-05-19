/**
 * КОНФІГУРАЦІЯ БІЛДІВ
 * єдине місце, де задаються доступні білди та їхні кольори.
 * Ключі в PLAYERS.build / PLAYERS.altBuild мають збігатися з ключами тут.
 * Формат: ключ: { label: "Назва", color: "#hex" }
 *
 * Приклад:
 *   tank:    { label: "Tank",    color: "#3b82f6" },
 *   healer:  { label: "Healer",  color: "#22c55e" },
 *   melee:   { label: "Melee DD", color: "#ef4444" },
 *   ranged:  { label: "Ranged DD", color: "#f59e0b" },
 *   support: { label: "Support",  color: "#a855f7" },
 */
const BUILDS = {
  // ── Heal ──────────────────────────────────────────
  heal: {
    label:      "💚 Heal",
    color:      "#22c55e",
    category:   "Heal",
    techniques: ["Panacea (Fan)", "Soulshade (Umbrella)"],
    weapons:    ["Fan", "Umbrella"]
  },

  // ── DD ────────────────────────────────────────────
  umbrella_dd: {
    label:      "☂️ Umbrella",
    color:      "#f97316",
    category:   "DD",
    techniques: ["Inkwell (Fan)", "Vernal (Umbrella)"],
    weapons:    ["Fan", "Umbrella"]
  },
  umbrella_dd_aoe: {
    label:      "🌀 Umbrella AOE",
    color:      "#a855f7",
    category:   "DD",
    techniques: ["Unfettered (Whip)", "Everspring (Umbrella)"],
    weapons:    ["Whip", "Umbrella"]
  },
  nameless: {
    label:      "🗡️ Nameless",
    color:      "#3b82f6",
    category:   "DD",
    techniques: ["Nameless Sword", "Nameless Spear"],
    weapons:    ["Sword", "Spear"]
  },
  strategic: {
    label:      "🧠 Strategic",
    color:      "#60a5fa",
    category:   "DD",
    techniques: ["Strategic Sword", "Heavensquaker Spear"],
    weapons:    ["Sword", "Spear"]
  },
  duals: {
    label:      "🔱 Duals",
    color:      "#d946ef",
    category:   "DD",
    techniques: ["Infernal Twinblades", "Mortal Rope Dart"],
    weapons:    ["Twinblades", "Rope Dart"]
  },

  // ── Tank ──────────────────────────────────────────
  tank: {
    label:      "🛡️ Tank",
    color:      "#eab308",
    category:   "Tank",
    techniques: ["Thundercy Blade (Mo Blade)", "Stormbreaker (Spear)"],
    weapons:    ["Mo Blade", "Spear"]
  },
  katana: {
    label:      "⚔️ Katana",
    color:      "#be123c",
    category:   "DD",
    techniques: ["Snowparting (Mo Blade)", "Phalanxbane (Katana)"],
    weapons:    ["Mo Blade", "Katana"]
  }
};

/**
 * СПИСОК ГРАВЦІВ ГІЛЬДІЇ
 * Поля:
 *   name      — ігрове ім'я
 *   build     — ключ основного білда з BUILDS
 *   altBuild  — ключ альт-білда з BUILDS, або null
 *   gearLevel — рівень спорядження: "low" | "mid" | "high"
 *   ready     — готовий до бою 30×30 (true / false)
 *   squad     — пачка: "attack" | "def" | null (нерозподілений)
 *   roles     — масив додаткових ролей: [] | ["officer"] | ["Jungle"] | ["ninja"] тощо
 *   note      — тактична нотатка ("фокус", фланг, захист точки тощо), або ""
 *
 * Приклад:
 *   { name: "Tankmaster", build: "tank",   altBuild: null,      gearLevel: "mid", ready: true,  squad: "def",    roles: ["officer"], note: "фокус" },
 *   { name: "HolyLight",  build: "heal",   altBuild: null,      gearLevel: "mid", ready: true,  squad: "attack", roles: [],          note: "" },
 *   { name: "ShadowX",    build: "duals",  altBuild: null,      gearLevel: "mid", ready: false, squad: null,     roles: ["Jungle"],   note: "фланг" },
 */
const PLAYERS = [
  { name: "LELUSH",          build: "tank",            altBuild: "umbrella_dd",    gearLevel: "mid", ready: true,  squad: "def",    roles: ["Officer", "Jungle"], note: "гібрид: Mo Blade + Inkwell Fan; чистий танк" },
  { name: "QiShye",          build: "nameless",        altBuild: "heal",             gearLevel: "mid", ready: true,  squad: "def",    roles: ["Jungle"], note: "" },
  { name: "SunRise",         build: "nameless",        altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: ["Jungle"], note: "" },
  { name: "Nixmoonky",       build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "LuthiXia",        build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: ["Officer"], note: "" },
  { name: "MasterFoobar",    build: "tank",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "чистий танк" },
  { name: "PonIka",          build: "nameless",          altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: ["Jungle"], note: "" },
  { name: "AUrory",          build: "umbrella_dd",     altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "ArthurPencilgun", build: "duals",           altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "lHanLil",         build: "nameless",        altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "Chifusama",       build: "katana",          altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: ["Officer", "Jungle"], note: "" },
  { name: "EnEr",            build: "umbrella_dd_aoe", altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: ["Jungle"], note: "" },
  { name: "CantBeTouched",   build: "katana",          altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: ["Officer", "Jungle"], note: "" },
  { name: "MariSkywalker",   build: "katana",          altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "Kelevra",         build: "nameless",        altBuild: null,             gearLevel: "high", ready: true,  squad: "attack", roles: ["Officer"], note: "" },
  { name: "datsann",         build: "nameless",        altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "CyMþak",          build: "strategic",       altBuild: "nameless",       gearLevel: "mid", ready: true,  squad: "def",    roles: ["Jungle"], note: "" },
  { name: "Kirito_AL",       build: "umbrella_dd_aoe", altBuild: "katana",         gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "LuminarA",        build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "LuoJue-Lin",      build: "tank",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "фулл танк" },
  { name: "BayarD",          build: "strategic",       altBuild: null,             gearLevel: "high", ready: true,  squad: "attack", roles: [], note: "може замінити спис на стяжку" },
  { name: "Geerion",         build: "nameless",        altBuild: "umbrella_dd",    gearLevel: "high", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "Jianggi",         build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "OldRock",         build: "tank",            altBuild: "umbrella_dd",    gearLevel: "mid", ready: true,  squad: "attack", roles: ["Officer"], note: "" },
  { name: "Espeir",          build: "nameless",        altBuild: null,              gearLevel: "mid", ready: true,  squad: "def",    roles: ["Jungle"], note: "" },
  { name: "Endurist",        build: "nameless",        altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: ["Jungle"], note: "" },
  { name: "Aiswill",         build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "StanislavZal",    build: "duals",              altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "Гібрід: дуали + мо блейд(стяжка)" },
  { name: "arhangels",       build: "heal",              altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "BlindMary",       build: "strategic",              altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: ["Jungle"], note: "" },
  { name: "Nanaaaaami",      build: "heal",            altBuild: null,             gearLevel: "mid", ready: true,  squad: "def",    roles: [], note: "" },
  { name: "DzirT",           build: "nameless",        altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
  { name: "Сreckadrenalin ", build: "katana",          altBuild: null,             gearLevel: "mid", ready: true,  squad: "attack", roles: [], note: "" },
];
