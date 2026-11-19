import { MODE_HORDE, STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./config.js";

/** @typedef {import("./state.js").GameState} GameState */
/** @typedef {{type: string} & Record<string, unknown>} WireMessage */
/** @typedef {{heading: number|null, thrust: boolean, shoot: boolean, turn: number, firePress: number|undefined}} DecodedInput */
/** @typedef {ReturnType<typeof encodeSnapshot>} SnapshotPayload */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {string} text @returns {WireMessage|null} */
export function decodeMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) && typeof parsed.type === 'string'
      ? /** @type {WireMessage} */ (parsed) : null;
  } catch {
    return null;
  }
}

/** @param {object} message @returns {string} */
export function encodeMessage(message) {
  return JSON.stringify(message);
}

/** @param {unknown} value @returns {unknown[][]|undefined} */
function rows(value) {
  return Array.isArray(value) ? value.filter(row => Array.isArray(row) && row.length > 0) : undefined;
}

/** Normaliza la estructura antes de aplicar las cotas numéricas del protocolo.
 * @param {unknown} payload
 */
export function decodeSnapshot(payload) {
  if (!isRecord(payload)) return null;
  return {
    st: normalizeState(payload.st),
    swellTime: payload.swellTime,
    m: payload.m, r: payload.r, w: payload.w, cd: payload.cd, rt: payload.rt,
    ts: isRecord(payload.ts) ? payload.ts : null,
    up: isRecord(payload.up) ? payload.up : null,
    psc: Array.isArray(payload.psc) ? payload.psc : null,
    sh: rows(payload.sh), cb: rows(payload.cb), pi: rows(payload.pi), cr: rows(payload.cr),
    bo: Array.isArray(payload.bo) ? payload.bo : null,
    rw: typeof payload.rw === 'string' ? payload.rw : null,
    mw: typeof payload.mw === 'string' ? payload.mw : null
  };
}

/** @param {unknown} value @returns {number|undefined} */
function normalizeState(value) {
  if (value === STATE_ARENA || value === 'playing' || value === 'arena') return STATE_ARENA;
  if (value === STATE_LOBBY || value === 'lobby') return STATE_LOBBY;
  if (value === STATE_PODIUM || value === 'podium') return STATE_PODIUM;
  return undefined;
}

/** @param {WireMessage} payload @returns {DecodedInput} */
export function decodeInput(payload) {
  const { heading, firePress } = payload;
  const circle = Math.PI * 2;
  return {
    heading: typeof heading === 'number' && Number.isFinite(heading)
      ? ((heading % circle) + circle) % circle : null,
    thrust: Boolean(payload.thrust || payload.th),
    shoot: Boolean(payload.shoot || payload.sh),
    turn: syncNum(typeof payload.turn === 'number' ? payload.turn : payload.t, -1, 1, 0),
    firePress: typeof firePress === 'number' && Number.isFinite(firePress) ? firePress : undefined
  };
}

/** @param {GameState} state */
export function encodeSnapshot(state) {
  // 1. Barcos de jugadores
  const sData = [];
  for (let i = 0; i < state.activeShips.length; i++) {
    const sh = state.activeShips[i];
    sData.push([
      sh.slot,
      Math.round(sh.x),
      Math.round(sh.y),
      Math.round(sh.rotation * 100) / 100,
      sh.health,
      sh.maxHealth,
      sh.ammo,
      sh.isAlive ? 1 : 0,
      (sh.data && sh.data.team) ? sh.data.team : "blue",
      (sh.data && sh.data.name) ? sh.data.name : "",
      (sh.data && sh.data.customName) ? sh.data.customName : "",
      sh.isRamming ? 1 : 0,
      sh.flashTimer > 0 ? 1 : 0,
      Math.round(sh.speed || 80),
      (sh.data && typeof sh.data.score === "number") ? sh.data.score : (state.playersData[sh.slot] ? state.playersData[sh.slot].score : 0),
      Math.round(sh.rescueTime * 10) / 10
    ]);
  }

  // 2. Balas de cañón activas
  const bData = [];
  for (let b = 0; b < state.cannonballs.length; b++) {
    const cb = state.cannonballs[b];
    if (!cb.isDead) {
      bData.push([
        Math.round(cb.x),
        Math.round(cb.y),
        Math.round(cb.dx * 100) / 100,
        Math.round(cb.dy * 100) / 100,
        cb.isPirate ? 1 : 0,
        cb.shooterTeam || "blue",
        cb.isBossShot ? 1 : 0
      ]);
    }
  }

  // 3. Barcos Piratas (Modo Horda)
  const pData = [];
  if (state.selectedMode === MODE_HORDE) {
    for (let p = 0; p < state.pirateShips.length; p++) {
      const pi = state.pirateShips[p];
      if (pi.isAlive) {
        pData.push([
          Math.round(pi.x),
          Math.round(pi.y),
          Math.round(pi.rotation * 100) / 100,
          pi.health,
          pi.maxHealth,
          pi.flashTimer > 0 ? 1 : 0
        ]);
      }
    }
  }

  // 4. Galeón Jefe
  let boData = null;
  if (state.selectedMode === MODE_HORDE && state.bossGalleon && state.bossGalleon.isAlive) {
    boData = [
      Math.round(state.bossGalleon.x),
      Math.round(state.bossGalleon.y),
      Math.round(state.bossGalleon.rotation * 100) / 100,
      state.bossGalleon.health,
      state.bossGalleon.maxHealth,
      state.bossGalleon.flashTimer > 0 ? 1 : 0,
      state.bossGalleon.warning
    ];
  }

  // 5. Cajas de munición y mejoras
  const cData = [];
  for (let c = 0; c < state.ammoCrates.length; c++) {
    cData.push([Math.round(state.ammoCrates[c].x), Math.round(state.ammoCrates[c].y), -1]);
  }
  if (state.selectedMode === MODE_HORDE) {
    for (let pu = 0; pu < state.hordePowerups.length; pu++) {
      cData.push([Math.round(state.hordePowerups[pu].x), Math.round(state.hordePowerups[pu].y), state.hordePowerups[pu].type]);
    }
  }

  return {
    type: "sync",
    swellTime: Math.round(state.waveAnim * 100) / 100,
    st: state.currentState,
    m: state.selectedMode,
    r: state.currentRound,
    w: state.currentWave,
    cd: Math.round(state.countdownTime * 10) / 10,
    rt: Math.round(state.roundTimer),
    ts: state.teamScores,
    up: (state.selectedMode === MODE_HORDE) ? state.hordeUpgrades : null,
    sh: sData,
    cb: bData,
    pi: pData,
    bo: boData,
    cr: cData,
    rw: state.roundWinner ? state.roundWinner.name : null,
    mw: state.matchWinner ? state.matchWinner.name : null,
    psc: state.playersData.map((p) => { return p.score || 0; })
  };

}

const SYNC_MAX_COORD = 20000;

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback @returns {number} */
export function syncNum(value, min, max, fallback) {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  return value < min ? min : (value > max ? max : value);
}

/** @param {unknown} value @returns {number} */
export function syncCoord(value) {
  return syncNum(value, -SYNC_MAX_COORD, SYNC_MAX_COORD, 0);
}

const MAX_NAME_LEN = 12;

const UUID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** @param {unknown} value @returns {string} */
export function sanitizeNickname(value) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return clean.substring(0, MAX_NAME_LEN);
}

/** @param {unknown} value @returns {string} */
export function sanitizeUuid(value) {
  return (typeof value === "string" && UUID_RE.test(value)) ? value : "";
}


/** @param {unknown} value @returns {string} */
export function readText(value) {
  return typeof value === 'string' ? value : '';
}
