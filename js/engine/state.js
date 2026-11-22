import { MODE_HORDE, PLAYER_PROFILES, STATE_LOBBY, arenaBounds } from "./config.js";

/** @typedef {typeof PLAYER_PROFILES[number] & {lastInputAt?: number, lastFirePress?: number, lastSeenAt?: number, wantsShipStatus?: boolean}} PlayerProfile */
/** @typedef {{x: number, y: number, w: number, h: number}} ArenaBounds */
/** @typedef {{name: string, hull: string, slot?: number, customName?: string}} RoundWinner */
/** @typedef {{text: string, x: number, y: number, color: string, size: number, life: number, maxLife: number, vy: number}} FloatingText */
/** @typedef {{turn: number, thrust: boolean, shoot: boolean, heading?: number|null, firePress?: number}} LocalInput */
/** @typedef {typeof state} GameState */

const state = {
  currentState: STATE_LOBBY,
  isPaused: false,
  selectedMode: MODE_HORDE,
  currentRoomCode: "",
  /** @type {Record<string, number>} */
  uuidToSlot: {},
  /** @type {PlayerProfile[]} */
  playersData: PLAYER_PROFILES.map(profile => ({ ...profile })),
  /** @type {import("./entities.js").Ship[]} */
  activeShips: [],
  /** @type {import("./entities.js").Cannonball[]} */
  cannonballs: [],
  /** @type {import("./entities.js").AmmoCrate[]} */
  ammoCrates: [],
  /** @type {import("./entities.js").HordePowerup[]} */
  hordePowerups: [],
  /** @type {import("./entities.js").PirateShip[]} */
  pirateShips: [],
  /** @type {import("./entities.js").BossGalleon|null} */
  bossGalleon: null,
  /** @type {import("./effects.js").Particle[]} */
  particles: [],
  wakeParticles: [],
  /** @type {FloatingText[]} */
  floatingTexts: [],
  /** @type {import("./entities.js").Island[]} */
  islands: [],
  currentRound: 0,
  teamScores: { blue: 0, red: 0 },
  // Variables Modo Horda Pirata
  currentWave: 1,
  waveSpawnTimer: 0,
  waveEnemiesToSpawn: 0,
  waveIntermissionTimer: 0,
  hordeUpgrades: {
    weaponLevel: 1, // 1: normal, 2: cañón doble, 3: cañón triple, 4: cañón explosivo
    maxAmmo: 3,     // Bodega ampliada
    maxHealth: 3,   // Casco reforzado
    fleetRank: 0,
    repairs: 0
  },
  countdownTime: 0,
  lastCountdownStep: -1,
  roundTimer: 0,
  suddenDeathActive: false,
  /** @type {ArenaBounds} */
  currentBounds: { ...arenaBounds },
  waveAnim: 0,
  /** @type {RoundWinner|null} */
  roundWinner: null,
  /** @type {RoundWinner|null} */
  matchWinner: null,
  roundOverTimer: 0,
  podiumAnimTimer: 0,
  podiumSelectedBtn: 0, // Jugar otra vez (0) o volver al lobby (1)

  // Screen Shake
  shakeTimer: 0,
  shakeIntensity: 0,
  // Variables Multijugador Online (Jugar con amigos en otros países)
  isRemoteClient: false,
  remoteSlot: -1,
  remoteIsHost: false,
  localPlayerSlot: -1,
  /** @type {(() => void)|null} */
  releaseTouchControls: null,
  /** @type {string|null} */
  myPlayerUUID: null,
  myCustomNickname: "",
  mySelectedTeam: "blue",
  isClientReady: false,
  lastBroadcastTime: 0,
  lastInputSendTime: 0,
  /** @type {LocalInput} */
  localInputState: {
    turn: 0,
    thrust: false,
    shoot: false
  },
  /** @type {LocalInput} */
  lastSentLocalInput: {
    turn: 999,
    thrust: false,
    shoot: false
  },
  keyState: {
    left: false,
    right: false,
    thrust: false,
    shoot: false
  },
  playMenuChoice: "",
  /** @type {CanvasRenderingContext2D|null} */
  ctx: null,
  /** @type {HTMLCanvasElement|null} */
  canvas: null,
  /** @type {HTMLElement|null} */
  elLobbyUI: null,
};

export { state };
