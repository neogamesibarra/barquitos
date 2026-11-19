// Estados del juego
const STATE_LOBBY = 0;

const STATE_ARENA = 1;

const STATE_PODIUM = 3;

// Modos de juego
const MODE_BATTLE = 0;

const MODE_TEAMS = 1;

const MODE_HORDE = 2;

const PLAYER_PROFILES = [
  { slot: 0, name: "Capitán 1", hull: "#E67E22", sail: "#FFF8E7", stripe: "#2ECC71", symbol: "circle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
  { slot: 1, name: "Capitán 2", hull: "#1E60D5", sail: "#82B1FF", stripe: "#0D47A1", symbol: "square", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
  { slot: 2, name: "Capitán 3", hull: "#D81B60", sail: "#FF80AB", stripe: "#FFD600", symbol: "triangle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
  { slot: 3, name: "Capitán 4", hull: "#75e363", sail: "#B9F6CA", stripe: "#218957", symbol: "diamond", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
  { slot: 4, name: "Capitán 5", hull: "#FDD835", sail: "#FFFDE7", stripe: "#F57F17", symbol: "star", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
  { slot: 5, name: "Capitán 6", hull: "#FF80AB", sail: "#FCE4EC", stripe: "#C51162", symbol: "heart", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
  { slot: 6, name: "Capitán 7", hull: "#261C1A", sail: "#FFCA28", stripe: "#111111", symbol: "crown", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
  { slot: 7, name: "Capitán 8", hull: "#E53935", sail: "#FFCDD2", stripe: "#00ACC1", symbol: "bolt", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" }
];

const TOTAL_ROUNDS = 10;

const arenaBounds = { x: 270, y: 35, w: 1380, h: 1010 };

// Ondas profundas superpuestas: fases compartidas por agua, deriva y puntería.
const SEA_WAVES = [
  { x: 0.30, y: 0.954, k: 0.023, rate: 1.35, amplitude: 16 },
  { x: -0.78, y: 0.626, k: 0.037, rate: 1.71, amplitude: 8 },
  { x: 0.92, y: 0.392, k: 0.065, rate: 2.27, amplitude: 3 }
];

const V_WIDTH = 1920;

const V_HEIGHT = 1080;

const ARENA_ISLANDS = [
  { x: 960, y: 540, rad: 70 },
  { x: 600, y: 330, rad: 55 },
  { x: 1320, y: 750, rad: 55 },
  { x: 600, y: 750, rad: 52 },
  { x: 1320, y: 330, rad: 52 }
];

export { ARENA_ISLANDS, MODE_BATTLE, MODE_HORDE, MODE_TEAMS, PLAYER_PROFILES, SEA_WAVES, STATE_ARENA, STATE_LOBBY, STATE_PODIUM, TOTAL_ROUNDS, V_HEIGHT, V_WIDTH, arenaBounds };
