import { decodeInput, decodeSnapshot, encodeSnapshot, readText, sanitizeNickname, sanitizeUuid, syncCoord, syncNum } from "./network_protocol.js";
import { CloudNet } from "../cloud_network.js";
import { SoundSynth as Sound } from "../sound_synth.js";
import { MODE_HORDE, PLAYER_PROFILES, STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./config.js";
import { releaseLocalInputs, sendLocalInputsToHost, updateLocalPlayerButton, updateTouchControlsVisibility } from "./controls.js";
import { removeParticle, spawnWaterFoam } from "./effects.js";
import { AmmoCrate, BossGalleon, removeCannonball, spawnCannonball, HordePowerup, PirateShip, Ship, updateLobbyShips } from "./entities.js";
import { updateAllShipsHUD, updateHordeUpgradesHUD, updatePauseOverlay, updateTeamScoresHUD } from "./hud.js";
import { openPlayMenu, requestLobbyAction, setupInviteButtons, setupRemotePlayerBarEvents, updateLobbyModeUI, updateLobbyPermissions, updateRemoteTeamUI, updateRemoteTeamVisibility } from "./lobby.js";
import { initArenaIslands } from "./modes.js";
import { applyWaterDrift, getSafeSpawnPoint, pushByWaves } from "./physics.js";
import { state } from "./state.js";

// Los clientes renuevan sus controles aproximadamente cada 350 ms.
const REMOTE_INPUT_TIMEOUT_MS = 1500;
const ROOM_LEASE_MS = 45000;

function getQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get(name) || "").toUpperCase();
  } catch (e) {
    return "";
  }
}

function getOrCreateUUID() {
  const key = "barquitos_cloud_uuid";
  let saved = null;
  try { saved = window.localStorage.getItem(key); } catch (e) {}
  if (saved && saved.length > 8) return saved;

  let newUuid = "u-";
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    newUuid += crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } else {
    const chars = "0123456789abcdef";
    for (let i = 0; i < 12; i++) {
      newUuid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    newUuid += "-" + Date.now().toString(36);
  }
  try { window.localStorage.setItem(key, newUuid); } catch (e) {}
  return newUuid;
}

// Red MQTT y Acciones hacia mandos
function sendTvAction(action, slot, val) {
  if (CloudNet && CloudNet.isConnected()) {
    if (action === "vibrate") {
      if (slot === null) {
        CloudNet.broadcast({ type: "vibrate", duration: val || 80 });
      } else {
        for (let i = 0; i < state.playersData.length; i++) {
          if (state.playersData[i].slot === slot && state.playersData[i].uuid) {
            CloudNet.sendToPlayer(state.playersData[i].uuid, { type: "vibrate", duration: val || 80 });
            break;
          }
        }
      }
    } else if (action === "state_change") {
      CloudNet.broadcast({ type: "state_change", state: val });
    }
  }
}

// Generador de código de sala
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==========================================================================
// MULTIJUGADOR ONLINE: TRANSMISIÓN (HOST) Y SINCRONIZACIÓN (CLIENTE)
// ==========================================================================

/** @type {WeakMap<import("./state.js").PlayerProfile, {ship: import("./entities.js").Ship, alive: boolean, ammo: number, maxAmmo: number}>} */
let shipStatuses = new WeakMap();
let publishedArenaStatus = false;

/** Publish private HUD updates independently of the world snapshot throttle. */
function broadcastShipStatuses() {
  if (state.isRemoteClient || !CloudNet.isConnected()) return;
  if (state.currentState !== STATE_ARENA) {
    if (publishedArenaStatus) shipStatuses = new WeakMap();
    publishedArenaStatus = false;
    return;
  }
  publishedArenaStatus = true;
  for (const ship of state.activeShips) {
    const player = state.playersData[ship.slot];
    if (!player?.connected || !player.uuid || !player.wantsShipStatus) continue;
    const previous = shipStatuses.get(player);
    const { isAlive: alive, ammo, maxAmmo } = ship;
    if (previous?.ship === ship && previous.alive === alive &&
        previous.ammo === ammo && previous.maxAmmo === maxAmmo) continue;
    shipStatuses.set(player, { ship, alive, ammo, maxAmmo });
    CloudNet.sendToPlayer(player.uuid, { type: "ship_status", alive, ammo, maxAmmo });
  }
}

function broadcastGameState() {
  broadcastShipStatuses();
  if (!CloudNet || !CloudNet.isConnected() || state.isRemoteClient) return;
  const now = Date.now();
  if (now - state.lastBroadcastTime < 90) return; // ~11 Hz: tasa óptima para evitar congestión en brokers MQTT y conexiones móviles
  state.lastBroadcastTime = now;

  CloudNet.broadcastState(encodeSnapshot(state));
}

function applyClientSync(payload) {
  const msg = decodeSnapshot(payload);
  if (msg && typeof msg.swellTime === "number" && isFinite(msg.swellTime)) state.waveAnim = msg.swellTime;
  if (!state.isRemoteClient || !msg) return;
  if (state.islands.length === 0) {
    initArenaIslands();
  }

  if (msg.st !== undefined) {
    state.currentState = msg.st;
    if (state.currentState !== STATE_ARENA) applyPauseState(false);
  }
  state.selectedMode = syncNum(msg.m, 0, 2, state.selectedMode);
  state.currentRound = syncNum(msg.r, 0, 999, state.currentRound);
  state.currentWave = syncNum(msg.w, 1, 9999, 1);
  state.countdownTime = syncNum(msg.cd, 0, 60, 0);
  state.roundTimer = syncNum(msg.rt, 0, 86400, 0);
  updateLobbyModeUI();
  if (msg.ts) {
    state.teamScores.blue = syncNum(msg.ts.blue, 0, 999999, 0);
    state.teamScores.red = syncNum(msg.ts.red, 0, 999999, 0);
  }
  if (msg.psc && msg.psc.length) {
    for (let pi = 0; pi < msg.psc.length && pi < state.playersData.length; pi++) {
      state.playersData[pi].score = syncNum(msg.psc[pi], 0, 999999, 0);
    }
  }
  if (msg.up) {
    state.hordeUpgrades.weaponLevel = syncNum(msg.up.weaponLevel, 1, 9, 1);
    state.hordeUpgrades.maxAmmo = syncNum(msg.up.maxAmmo, 1, 99, 3);
    state.hordeUpgrades.maxHealth = syncNum(msg.up.maxHealth, 1, 99, 3);
    state.hordeUpgrades.fleetRank = syncNum(msg.up.fleetRank, 0, 99, 0);
    state.hordeUpgrades.repairs = syncNum(msg.up.repairs, 0, 999, 0);
  }
  state.roundWinner = msg.rw ? { name: msg.rw, hull: "#ffca28" } : null;
  state.matchWinner = msg.mw ? { name: msg.mw, hull: "#ffd700" } : null;

  // Visibilidad del lobby en cliente
  const lobbyUI = document.getElementById("lobby-ui");
  if (lobbyUI) {
    lobbyUI.style.display = (state.currentState === STATE_LOBBY) ? "flex" : "none";
  }

  // Controles táctiles en pantalla durante la partida en móviles/tablets
  updateTouchControlsVisibility();
  updateLobbyPermissions();

  // 1. Sincronizar barcos
  if (msg.sh) {
    const syncedSlots = {};
    for (let i = 0; i < msg.sh.length; i++) {
      const item = msg.sh[i];
      // El slot debe ser un puesto real: un índice arbitrario crearía
      // barcos fantasma y corrompería los marcadores.
      const slot = syncNum(item[0], 0, state.playersData.length - 1, -1);
      if (slot !== Math.floor(slot)) continue;
      syncedSlots[slot] = true;
      let ship = null;
      for (let s = 0; s < state.activeShips.length; s++) {
        if (state.activeShips[s].slot === slot) {
          ship = state.activeShips[s];
          break;
        }
      }
      // Sanear antes de crear: el constructor copia x, y y rotación tal cual.
      const shipX = syncCoord(item[1]);
      const shipY = syncCoord(item[2]);
      if (!ship) {
        ship = new Ship(slot, shipX, shipY, syncNum(item[3], -1000, 1000, 0));
        state.activeShips.push(ship);
      }
      ship.targetX = shipX;
      ship.targetY = shipY;
      ship.targetAngle = syncNum(item[3], -1000, 1000, ship.rotation);
      if (typeof item[13] === "number") {
        ship.remoteSpeed = syncNum(item[13], 0, 2000, 80);
      }

      const distSq = (ship.x - ship.targetX) * (ship.x - ship.targetX) + (ship.y - ship.targetY) * (ship.y - ship.targetY);
      if (distSq > 15000 || ship.x === 960) {
        ship.x = ship.targetX;
        ship.y = ship.targetY;
        ship.rotation = ship.targetAngle;
      }

      ship.maxHealth = syncNum(item[5], 1, 999, 3);
      ship.health = syncNum(item[4], 0, ship.maxHealth, 0);
      ship.ammo = syncNum(item[6], 0, 999, 0);
      ship.isAlive = (item[7] === 1);
      ship.rescueTime = syncNum(item[15], 0, 60, 0);
      if (ship.data) {
        ship.data.team = readText(item[8]);
        if (typeof item[9] === "string" && item[9]) ship.data.name = item[9];
        ship.data.customName = readText(item[10]);
      }
      ship.isRamming = (item[11] === 1);
      if (item[12] === 1) ship.flashTimer = 0.2;
      if (typeof item[14] === "number") {
        const syncedScore = syncNum(item[14], 0, 999999, 0);
        if (ship.data) ship.data.score = syncedScore;
        if (state.playersData[slot]) state.playersData[slot].score = syncedScore;
      }
    }
    for (let shipIndex = state.activeShips.length - 1; shipIndex >= 0; shipIndex--) {
      if (!syncedSlots[state.activeShips[shipIndex].slot]) state.activeShips.splice(shipIndex, 1);
    }
  }

  // 2. Reutilizar las balas en la vista remota, donde solo se dibujan.
  const remoteBalls = msg.cb || [];
  for (let b = 0; b < remoteBalls.length; b++) {
    const bItem = remoteBalls[b];
    const ball = state.cannonballs[b];
    const bX = syncCoord(bItem[0]);
    const bY = syncCoord(bItem[1]);
    const bDx = syncNum(bItem[2], -5000, 5000, 0);
    const bDy = syncNum(bItem[3], -5000, 5000, 0);
    if (!ball) {
      spawnCannonball(bX, bY, bDx, bDy, 0, bItem[4] === 1, bItem[6] === 1 ? 2 : 1, readText(bItem[5]));
    } else {
      ball.x = bX;
      ball.y = bY;
      ball.dx = bDx;
      ball.dy = bDy;
      ball.isPirate = (bItem[4] === 1);
      ball.shooterTeam = readText(bItem[5]);
      ball.isBossShot = bItem[6] === 1;
    }
  }
  while (state.cannonballs.length > remoteBalls.length) removeCannonball(state.cannonballs.length - 1);

  // 3. Sincronizar piratas reutilizando instancias para evitar basura y micro-tirones
  if (msg.pi) {
    while (state.pirateShips.length < msg.pi.length) {
      state.pirateShips.push(new PirateShip(0, 0, state.currentWave));
    }
    if (state.pirateShips.length > msg.pi.length) {
      state.pirateShips.length = msg.pi.length;
    }
    for (let p = 0; p < msg.pi.length; p++) {
      const pItem = msg.pi[p];
      const ps = state.pirateShips[p];
      ps.x = syncCoord(pItem[0]);
      ps.y = syncCoord(pItem[1]);
      ps.rotation = syncNum(pItem[2], -1000, 1000, 0);
      ps.maxHealth = syncNum(pItem[4], 1, 9999, 1);
      ps.health = syncNum(pItem[3], 0, ps.maxHealth, 0);
      ps.isAlive = true;
      if (pItem[5] === 1) ps.flashTimer = 0.2;
    }
  } else {
    state.pirateShips = [];
  }

  // 4. Sincronizar jefe
  if (msg.bo) {
    if (!state.bossGalleon || state.bossGalleon.wave !== state.currentWave) {
      state.bossGalleon = new BossGalleon(syncCoord(msg.bo[0]), syncCoord(msg.bo[1]), state.currentWave);
    }
    state.bossGalleon.x = syncCoord(msg.bo[0]);
    state.bossGalleon.y = syncCoord(msg.bo[1]);
    state.bossGalleon.rotation = syncNum(msg.bo[2], -1000, 1000, 0);
    state.bossGalleon.maxHealth = syncNum(msg.bo[4], 1, 99999, 1);
    state.bossGalleon.health = syncNum(msg.bo[3], 0, state.bossGalleon.maxHealth, 0);
    state.bossGalleon.isAlive = true;
    state.bossGalleon.warning = syncNum(msg.bo[6], 0, 2, 0);
    if (msg.bo[5] === 1) state.bossGalleon.flashTimer = 0.2;
  } else {
    state.bossGalleon = null;
  }

  // 5. Sincronizar cajas
  state.ammoCrates = [];
  state.hordePowerups = [];
  if (msg.cr) {
    for (let c = 0; c < msg.cr.length; c++) {
      const cItem = msg.cr[c];
      if (cItem[2] === -1) {
        state.ammoCrates.push(new AmmoCrate(syncCoord(cItem[0]), syncCoord(cItem[1])));
      } else if (syncNum(cItem[2], 0, 4, -1) !== -1) {
        state.hordePowerups.push(new HordePowerup(syncCoord(cItem[0]), syncCoord(cItem[1]), syncNum(cItem[2], 0, 4, 0)));
      }
    }
  }

  updateAllShipsHUD(); updateTeamScoresHUD(); updateHordeUpgradesHUD();
}

function updateRemoteClient(dt) {
  // 1. Interpolación suave de barcos
  for (let s = 0; s < state.activeShips.length; s++) {
    const ship = state.activeShips[s];

    // Barco propio en cliente remoto: control táctil responsivo sin lag
    if (ship.slot === state.remoteSlot && ship.isAlive) {
      const heading = state.localInputState.heading;
      if (heading != null) ship.rotation = heading;
      else ship.rotation += state.localInputState.turn * 3.8 * dt;
      applyWaterDrift(ship, state.localInputState.thrust ? (ship.isRamming ? 340 : 185) : 80, dt);
      if (state.currentState === STATE_ARENA) pushByWaves(ship, dt);
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;

      // Suave convergencia hacia la posición del anfitrión
      if (ship.targetX !== undefined) {
        ship.x += (ship.targetX - ship.x) * 0.12;
        ship.y += (ship.targetY - ship.y) * 0.12;
        const aDiffLocal = Math.atan2(Math.sin(ship.targetAngle - ship.rotation), Math.cos(ship.targetAngle - ship.rotation));
        if (heading == null) ship.rotation += aDiffLocal * 0.10;
      }
    } else {
      // Barcos remotos: avance continuo y convergencia
      if (ship.targetX !== undefined) {
        const rSpeed = ship.remoteSpeed || 80;
        if (ship.isAlive) {
          ship.x += Math.cos(ship.rotation) * rSpeed * dt;
          ship.y += Math.sin(ship.rotation) * rSpeed * dt;
        }
        ship.x += (ship.targetX - ship.x) * 0.22;
        ship.y += (ship.targetY - ship.y) * 0.22;

        const aDiff = Math.atan2(Math.sin(ship.targetAngle - ship.rotation), Math.cos(ship.targetAngle - ship.rotation));
        ship.rotation += aDiff * 0.25;
      }
    }

    if (ship.flashTimer > 0) ship.flashTimer -= dt;
    if (ship.ramCooldown > 0) ship.ramCooldown -= dt;

    // Estela de espuma si el barco se mueve
    if (ship.isAlive && Math.random() < 0.35) {
      const rearX = ship.x - Math.cos(ship.rotation) * 26;
      const rearY = ship.y - Math.sin(ship.rotation) * 26;
      spawnWaterFoam(rearX, rearY, -Math.cos(ship.rotation), -Math.sin(ship.rotation));
    }
  }

  // 2. Partículas
  for (let pt = state.particles.length - 1; pt >= 0; pt--) {
    const p = state.particles[pt];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      removeParticle(pt);
    }
  }

  // 3. Textos flotantes
  for (let ft = state.floatingTexts.length - 1; ft >= 0; ft--) {
    const fText = state.floatingTexts[ft];
    fText.y -= dt * 30;
    fText.life -= dt;
    if (fText.life <= 0) {
      state.floatingTexts.splice(ft, 1);
    }
  }

  // 4. Enviar inputs locales al anfitrión
  sendLocalInputsToHost();
}

function handleClientIncomingMessage(topic, msg) {
  if (!msg || !msg.type) return;

  if (msg.type === "init") {
    stopClientJoinRetry();
    state.remoteSlot = msg.slot;
    state.remoteIsHost = typeof msg.isHost === "boolean" ? msg.isHost : msg.slot === 0;
    if (typeof msg.mode === "number") state.selectedMode = msg.mode;
    if (typeof msg.state === "number") state.currentState = msg.state;
    applyPauseState(state.currentState === STATE_ARENA && msg.paused === true);
    updateLobbyPermissions();
    const slotBadge = document.getElementById("remote-player-slot");
    if (slotBadge) {
      const profile = PLAYER_PROFILES[state.remoteSlot];
      slotBadge.textContent = "BARCO " + (state.remoteSlot + 1) + " (" + (profile?.name || "Capitán") + ")";
      slotBadge.style.backgroundColor = msg.hull || profile?.hull || "#1e3a50";
    }

    // Re-sincronizar apodo guardado
    try {
      const savedName = window.localStorage.getItem("barquitos_nickname");
      if (savedName) {
        state.myCustomNickname = savedName;
        const inp = /** @type {HTMLInputElement|null} */ (document.getElementById("remote-nickname-input"));
        if (inp) inp.value = savedName;
        if (CloudNet && CloudNet.isConnected()) {
          CloudNet.sendToHost({
            type: "set_name",
            uuid: state.myPlayerUUID,
            name: savedName
          });
        }
      }
    } catch(e){}

    // Re-sincronizar equipo guardado
    try {
      const savedTeam = window.localStorage.getItem("barquitos_team");
      if (savedTeam === "red" || savedTeam === "blue") {
        state.mySelectedTeam = savedTeam;
        if (CloudNet && CloudNet.isConnected()) {
          CloudNet.sendToHost({
            type: "set_team",
            uuid: state.myPlayerUUID,
            slot: state.remoteSlot,
            team: state.mySelectedTeam
          });
        }
        updateRemoteTeamUI();
      }
    } catch(e){}

  } else if (msg.type === "host_permissions" && typeof msg.isHost === "boolean") {
    state.remoteIsHost = msg.isHost;
    updateLobbyPermissions();
  } else if (msg.type === "team_confirmed") {
    if (msg.team) {
      state.mySelectedTeam = msg.team;
      updateRemoteTeamUI();
    }
  } else if (msg.type === "mode_change") {
    state.selectedMode = msg.mode;
    updateLobbyModeUI();
    updateRemoteTeamVisibility();
  } else if (msg.type === "pause_state" && typeof msg.paused === "boolean") {
    if (state.currentState === STATE_ARENA) applyPauseState(msg.paused);
  } else if (msg.type === "state_change") {
    if (typeof msg.state === "number") {
      state.currentState = msg.state;
    } else if (msg.state === "playing" || msg.state === "arena") {
      state.currentState = STATE_ARENA;
    } else if (msg.state === "podium") {
      state.currentState = STATE_PODIUM;
    } else if (msg.state === "lobby") {
      state.currentState = STATE_LOBBY;
    }
    if (state.currentState !== STATE_ARENA) applyPauseState(false);
    const lobbyUI = document.getElementById("lobby-ui");
    if (lobbyUI) {
      lobbyUI.style.display = (state.currentState === STATE_LOBBY) ? "flex" : "none";
    }
  } else if (msg.type === "sync") {
    applyClientSync(msg);
  } else if (msg.type === "powerup") {
    Sound.playPowerup();
    if (window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate([70, 50, 70]); } catch(e){}
    }
  } else if (msg.type === "vibrate") {
    if (window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate(msg.duration || 80); } catch(e){}
    }
  }
}

let clientJoinRetryTimer = null;

let clientJoinRetryCount = 0;

function startClientJoinRetry() {
  stopClientJoinRetry();
  if (state.remoteSlot !== -1) return;
  clientJoinRetryCount = 0;
  const slotBadge = document.getElementById("remote-player-slot");
  if (slotBadge && state.remoteSlot === -1) {
    slotBadge.textContent = "Buscando anfitrión...";
    slotBadge.style.backgroundColor = "#d97706";
  }
  clientJoinRetryTimer = setInterval(() => {
    if (state.remoteSlot !== -1 || !CloudNet || !CloudNet.isConnected()) {
      stopClientJoinRetry();
      return;
    }
    clientJoinRetryCount++;
    console.log("[Online] Reintentando envío de solicitud join a sala:", state.currentRoomCode, "intento:", clientJoinRetryCount);
    CloudNet.sendToHost({
      type: "join",
      uuid: state.myPlayerUUID,
      name: state.myCustomNickname,
      team: state.mySelectedTeam
    });

    if (clientJoinRetryCount >= 4 && state.remoteSlot === -1) {
      const sb = document.getElementById("remote-player-slot");
      if (sb) {
        sb.textContent = "Esperando al anfitrión de sala " + state.currentRoomCode + "...";
        sb.style.backgroundColor = "#b91c1c";
      }
      const helpBox = document.getElementById("remote-waiting-help");
      if (helpBox) {
        helpBox.style.display = "inline-flex";
      }
    }
  }, 1500);
}

function stopClientJoinRetry() {
  if (clientJoinRetryTimer) {
    clearInterval(clientJoinRetryTimer);
    clientJoinRetryTimer = null;
  }
  clientJoinRetryCount = 0;
  const helpBox = document.getElementById("remote-waiting-help");
  if (helpBox) {
    helpBox.style.display = "none";
  }
}

// Conexión CloudNet (Soporta Anfitrión y Jugador Remoto Online)
function connectCloudNet() {
  const joinCode = getQueryParam("sala") || getQueryParam("join");
  const updateStatusUI = (status, msg) => {
    const stLabel = document.getElementById("cloud-status") || document.getElementById("server-status");
    if (stLabel) {
      if (status === "online" || status === "connected") {
        const bHost = (CloudNet && CloudNet.getCurrentBrokerHost) ? CloudNet.getCurrentBrokerHost() : "";
        stLabel.className = "status-tag online";
        stLabel.textContent = "● CONECTADO A LA NUBE" + (bHost ? " (" + bHost + ")" : "");
      } else if (status === "offline" || status === "error") {
        stLabel.className = "status-tag offline";
        stLabel.textContent = "○ " + (msg || "DESCONECTADO").toUpperCase();
      } else {
        stLabel.className = "status-tag connecting";
        stLabel.textContent = msg || "Conectando a la nube...";
      }
    }
  };

  if (joinCode) {
    // ---------------- MODO CLIENTE ONLINE (Jugador Remoto) ----------------
    state.isRemoteClient = true;
    state.currentRoomCode = joinCode.toUpperCase();
    state.myPlayerUUID = getOrCreateUUID();

    console.log("[Online] Uniéndose a sala remota:", state.currentRoomCode);

    const roomDisplay = document.getElementById("room-code-text") || document.getElementById("room-code-display");
    if (roomDisplay) roomDisplay.textContent = state.currentRoomCode;

    // Ocultar controles exclusivos del anfitrión y tarjeta QR en cliente
    updateLobbyPermissions();
    updateLocalPlayerButton();
    openPlayMenu("online");
    const remoteMenu = document.getElementById("play-menu");
    if (remoteMenu) remoteMenu.hidden = true;
    const qrCard = /** @type {HTMLElement|null} */ (document.querySelector(".menu-qr"));
    if (qrCard) {
      qrCard.style.display = "none";
    }

    const remoteBar = document.getElementById("remote-player-bar");
    if (remoteBar) {
      const rRoom = document.getElementById("remote-player-room");
      if (rRoom) rRoom.textContent = "Sala: " + state.currentRoomCode;
    }

    setupRemotePlayerBarEvents();

    if (CloudNet) {
      CloudNet.initClient(state.currentRoomCode, state.myPlayerUUID, {
        onReady: () => {
          console.log("[Online] Cliente conectado a la sala:", state.currentRoomCode);
          updateStatusUI("online", "Conectado a la sala " + state.currentRoomCode);

          // Si ya teníamos slot asignado, re-sincronizar de inmediato sin perder el barco
          if (state.remoteSlot !== -1) {
            CloudNet.sendToHost({
              type: "rejoin",
              uuid: state.myPlayerUUID,
              slot: state.remoteSlot,
              name: state.myCustomNickname,
              team: state.mySelectedTeam
            });
          } else {
            CloudNet.sendToHost({
              type: "join",
              uuid: state.myPlayerUUID,
              name: state.myCustomNickname,
              team: state.mySelectedTeam
            });
            startClientJoinRetry();
          }
        },
        onStatus: (status, msg) => {
          updateStatusUI(status, msg);
          if (status !== "online" && status !== "connected") {
            releaseLocalInputs();
            stopClientJoinRetry();
          }
        },
        onMessage: (topic, msg) => {
          handleClientIncomingMessage(topic, msg);
        }
      });
    }
  } else {
    // ---------------- MODO ANFITRIÓN (Host / Pantalla Grande) ----------------
    state.isRemoteClient = false;
    updateLocalPlayerButton();
    if (!state.currentRoomCode) {
      state.currentRoomCode = generateRoomCode();
    }
    state.currentRoomCode = state.currentRoomCode.trim().toUpperCase();

    const roomDisp = document.getElementById("room-code-text") || document.getElementById("room-code-display");
    if (roomDisp) roomDisp.textContent = state.currentRoomCode;
    generateLobbyQR();
    setupInviteButtons();

    if (CloudNet) {
      CloudNet.initHost(state.currentRoomCode, {
        onReady: () => {
          shipStatuses = new WeakMap();
          // Los mandos necesitan tiempo para recuperar el enlace tras un fallo del broker.
          const now = Date.now();
          for (const player of state.playersData) {
            if (player.connected && player.uuid) player.lastSeenAt = now;
          }
          console.log("[TV] Host iniciado en sala:", state.currentRoomCode);
          const rd = document.getElementById("room-code-text") || document.getElementById("room-code-display");
          if (rd) rd.textContent = state.currentRoomCode;
          updateStatusUI("online");
          generateLobbyQR();
          setupInviteButtons();
        },
        onStatus: (status, msg) => {
          updateStatusUI(status, msg);
        },
        onMessage: (topic, msg) => {
          handleIncomingMessage(msg);
        }
      });
    }
  }
}

// ==========================================================================
// VALIDACIÓN DE MENSAJES DE CLIENTES
// El anfitrión es la autoridad del juego. Todo dato que llega por MQTT es
// entrada no confiable: un mando puede enviar números absurdos, nombres con
// caracteres de control o suplantar a otro jugador con msg.slot.
// ==========================================================================
const INPUT_MIN_INTERVAL_MS = 15;

function applyPauseState(paused) {
  if (state.isPaused === paused) return;
  state.isPaused = paused;
  (state.releaseTouchControls ?? releaseLocalInputs)();
  for (const ship of state.activeShips) {
    ship.turnInput = 0;
    ship.headingInput = null;
    ship.thrustInput = ship.shootInput = false;
    ship.shotBuffer = 0;
    ship.inputExpiresAt = 0;
  }
  updatePauseOverlay();
}

function setGamePaused(paused) {
  if (state.isRemoteClient || state.currentState !== STATE_ARENA || state.isPaused === paused) return;
  applyPauseState(paused);
  if (CloudNet.isConnected()) CloudNet.broadcast({ type: "pause_state", paused });
}

function getRemoteHostUuid() {
  return state.playersData.find(player => player.connected === true && sanitizeUuid(player.uuid))?.uuid;
}

function updateRemoteHost(previousHost, initializedUuid) {
  const currentHost = getRemoteHostUuid();
  if (currentHost === previousHost) return;
  for (const uuid of [previousHost, currentHost]) {
    if (uuid && uuid !== initializedUuid) {
      CloudNet.sendToPlayer(uuid, { type: "host_permissions", isHost: uuid === currentHost });
    }
  }
}

// El slot SIEMPRE se resuelve por uuid, nunca por el número que manda el
// cliente: msg.slot es falsificable y permitía manejar a otros jugadores.
function slotForUuid(uuid) {
  if (!uuid) return -1;
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].uuid === uuid && state.playersData[i].connected) return i;
  }
  return -1;
}

/** @param {unknown} uuid @returns {number} */
function renewPlayerLease(uuid) {
  const slot = slotForUuid(sanitizeUuid(uuid));
  if (slot !== -1) state.playersData[slot].lastSeenAt = Date.now();
  return slot;
}

function handleIncomingMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === "join" || msg.type === "rejoin") {
    const uuid = sanitizeUuid(msg.uuid);
    if (!uuid) return;

    const previousHost = getRemoteHostUuid();
    let slot = slotForUuid(uuid);
    if (slot === -1 && msg.type === "rejoin" && msg.resumeOnly === true) {
      CloudNet.sendToPlayer(uuid, { type: "session_expired" });
      return;
    }
    if (slot === -1 && state.playMenuChoice === "solo" && state.currentState === STATE_ARENA) return;

    if (slot === -1) {
      // El primer mando ocupa el naranja. La pantalla local usa otro puesto.
      for (let s = 0; s < state.playersData.length; s++) {
        if (!state.playersData[s].uuid && !state.playersData[s].connected) {
          slot = s;
          state.uuidToSlot[uuid] = slot;
          state.playersData[slot].uuid = uuid;
          break;
        }
      }
    }

    if (slot === -1) {
      if (CloudNet) CloudNet.sendToPlayer(uuid, { type: "error", message: "Sala llena (8 capitanes)" });
      return;
    }

    state.playersData[slot].connected = true;
    state.playersData[slot].lastSeenAt = Date.now();
    state.playersData[slot].wantsShipStatus = msg.shipStatus === true;
    shipStatuses.delete(state.playersData[slot]);
    const jName = sanitizeNickname(msg.name);
    if (jName.length > 0) state.playersData[slot].customName = jName;
    if (msg.resumeOnly !== true && (msg.team === "red" || msg.team === "blue")) {
      state.playersData[slot].team = msg.team;
    }

    // Si la partida ya está en curso (STATE_ARENA), asegurarse de que el barco exista en activeShips
    if (state.currentState === STATE_ARENA) {
      let shipExists = false;
      for (let as = 0; as < state.activeShips.length; as++) {
        if (state.activeShips[as].slot === slot) {
          shipExists = true;
          break;
        }
      }
      if (!shipExists) {
        const spawnAng = Math.random() * Math.PI * 2;
        const spawn = getSafeSpawnPoint(state.currentBounds, 34);
        const newS = new Ship(slot, spawn.x, spawn.y, spawnAng);
        state.activeShips.push(newS);
      }
    }

    if (CloudNet) {
      CloudNet.sendToPlayer(uuid, {
        type: "init",
        slot: slot,
        isHost: uuid === getRemoteHostUuid(),
        paused: state.isPaused,
        name: state.playersData[slot].name,
        customName: state.playersData[slot].customName,
        hull: state.playersData[slot].hull,
        sail: state.playersData[slot].sail,
        stripe: state.playersData[slot].stripe,
        symbol: state.playersData[slot].symbol,
        ready: state.playersData[slot].ready,
        team: state.playersData[slot].team,
        mode: state.selectedMode,
        state: state.currentState
      });
    }

    updateRemoteHost(previousHost, uuid);
    updateLobbyShips();
  } else if (msg.type === "ready") {
    const slot = renewPlayerLease(msg.uuid);
    if (slot === -1) return;
    state.playersData[slot].ready = Boolean(msg.ready);
    updateLobbyShips();
  } else if (msg.type === "set_name") {
    const sSlot = renewPlayerLease(msg.uuid);
    const cleanName = sanitizeNickname(msg.name);
    if (sSlot !== -1 && cleanName.length > 0) {
      state.playersData[sSlot].customName = cleanName;
      for (let sn = 0; sn < state.activeShips.length; sn++) {
        if (state.activeShips[sn].slot === sSlot) {
          state.activeShips[sn].data.customName = cleanName;
          break;
        }
      }
    }
  } else if (msg.type === "set_team") {
    // Igual que el apodo: sin uuid propio no se cambia de equipo. El
    // fallback anterior a msg.slot permitía mover a otro jugador de equipo.
    const tSlot = renewPlayerLease(msg.uuid);
    if (tSlot !== -1 && (msg.team === "red" || msg.team === "blue")) {
      const tm = (msg.team === "red") ? "red" : "blue";
      state.playersData[tSlot].team = tm;
      for (let st = 0; st < state.activeShips.length; st++) {
        if (state.activeShips[st].slot === tSlot) {
          state.activeShips[st].data.team = tm;
          break;
        }
      }
      updateLobbyShips();
      // Confirmar el equipo al controlador
      if (CloudNet && state.playersData[tSlot] && state.playersData[tSlot].uuid) {
        CloudNet.sendToPlayer(state.playersData[tSlot].uuid, { type: "team_confirmed", team: tm });
      }
    }
  } else if (msg.type === "input") {
    const inSlot = slotForUuid(sanitizeUuid(msg.uuid));

    if (inSlot !== -1) {
      const nowInput = Date.now();
      const player = state.playersData[inSlot];
      player.lastSeenAt = nowInput;
      if (state.isPaused) return;
      const { heading, thrust, shoot, firePress, turn } = decodeInput(msg);

      for (const inputShip of state.activeShips) {
        if (inputShip.slot !== inSlot) continue;

        // El límite del host filtra el giro continuo y deja pasar las transiciones.
        const critical = (heading === null && inputShip.headingInput != null) ||
          thrust !== inputShip.thrustInput || shoot !== inputShip.shootInput ||
          (Number.isFinite(firePress) && firePress > (player.lastFirePress || 0) &&
            firePress <= nowInput + 2000);
        if (!critical && nowInput - (player.lastInputAt ?? -Infinity) < INPUT_MIN_INTERVAL_MS) return;
        player.lastInputAt = nowInput;

        inputShip.headingInput = heading;
        inputShip.headingMagnitude = syncNum(msg.magnitude, 0, 1, 1);
        inputShip.turnInput = turn;
        inputShip.thrustInput = thrust;
        if (typeof firePress === "number" && isFinite(firePress) &&
            firePress > (state.playersData[inSlot].lastFirePress || 0) && firePress <= nowInput + 2000) {
          state.playersData[inSlot].lastFirePress = firePress;
          if (state.currentState === STATE_ARENA && inputShip.isAlive) inputShip.shotBuffer = 0.8;
        } else if (typeof msg.firePress !== "number" && shoot && !inputShip.shootInput) {
          inputShip.shotBuffer = 0.8;
        }
        inputShip.shootInput = shoot;
        inputShip.inputExpiresAt = nowInput + REMOTE_INPUT_TIMEOUT_MS;
        break;
      }
    }
  } else if (msg.type === "host_action") {
    if (renewPlayerLease(msg.uuid) === -1 || msg.uuid !== getRemoteHostUuid()) return;
    if (msg.action === "toggle_pause") {
      setGamePaused(!state.isPaused);
      return;
    }
    if (state.currentState !== STATE_LOBBY && state.currentState !== STATE_PODIUM) return;
    if (msg.action === "start") {
      if (state.playMenuChoice === "solo") openPlayMenu("online");
      requestLobbyAction("start");
    } else if (msg.action === "lobby") {
      requestLobbyAction("lobby");
    } else if (msg.action === "set_mode") {
      if (Number.isInteger(msg.mode) && msg.mode >= 0 && msg.mode <= MODE_HORDE) {
        requestLobbyAction("set_mode", msg.mode);
      }
    } else if (msg.action === "toggle_mode") {
      requestLobbyAction("set_mode", (state.selectedMode + 1) % (MODE_HORDE + 1));
    }
  }
}

function broadcastCurrentMode() {
  if (CloudNet && CloudNet.isConnected()) {
    const names = ["TODOS VS TODOS", "BATALLA POR EQUIPOS", "HORDA PIRATA"];
    CloudNet.broadcast({
      type: "mode_change",
      mode: state.selectedMode,
      modeName: names[state.selectedMode] || "MODO DE JUEGO"
    });
  }
}

// Cuelga el broker activo del enlace para que el invitado llegue al mismo
// servidor que el anfitrion. Sin esto, si el anfitrion cayo al broker de
// respaldo, sus invitados se conectaban al principal y nunca se veian.
function withBrokerParam(url) {
  if (!CloudNet || !CloudNet.getBrokerParam) return url;
  const sep = url.indexOf("?") === -1 ? "?" : "&";
  return url + sep + "b=" + CloudNet.getBrokerParam();
}

function generateLobbyQR() {
  const qrCanvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById("qr-canvas"));
  if (qrCanvas && window.drawQRCodeToCanvas) {
    if (!state.currentRoomCode || state.currentRoomCode === "----") return;
    const location = window.location;
    let controllerUrl;
    if (location.protocol !== "https:" && location.protocol !== "http:" ||
        /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)) {
      controllerUrl = "https://neogamesibarra.github.io/barquitos/controller.html";
    } else {
      const path = location.pathname.replace(/\/(?:index\.html|tv\.html|tv|controller\.html)\/?$/i, "/");
      controllerUrl = location.protocol + "//" + location.host + path.replace(/\/+$/, "") + "/controller.html";
    }
    controllerUrl += "?room=" + encodeURIComponent(state.currentRoomCode);
    controllerUrl = withBrokerParam(controllerUrl);

    window.drawQRCodeToCanvas(qrCanvas, controllerUrl, 230);
    const matchQR = /** @type {HTMLCanvasElement|null} */ (document.getElementById("match-qr-canvas"));
    if (matchQR) window.drawQRCodeToCanvas(matchQR, controllerUrl, 230);

    const urlLabel = document.getElementById("url-text");
    if (urlLabel) urlLabel.textContent = controllerUrl;

    const ctlLink = /** @type {HTMLAnchorElement|null} */ (document.querySelector(".controller-link"));
    if (ctlLink) {
      ctlLink.href = controllerUrl;
    }
  }
}

/** @param {number} now Tiempo real para caducar mandos aunque la simulación vaya por ticks. */
function expireRemoteInputs(now) {
  for (let i = 0; i < state.activeShips.length; i++) {
    const ship = state.activeShips[i];
    if (ship.inputExpiresAt && now >= ship.inputExpiresAt) {
      ship.turnInput = 0;
      ship.headingInput = null;
      ship.thrustInput = false;
      ship.shootInput = false;
      ship.shotBuffer = 0;
      ship.inputExpiresAt = 0;
    }
  }

  // Se conservan barcos y puntuaciones durante la partida y el podio.
  // La sala de espera puede reasignar la plaza si ya no recibe el heartbeat.
  if (state.currentState !== STATE_LOBBY || !CloudNet.isConnected()) return;
  const previousHost = getRemoteHostUuid();
  let rosterChanged = false;
  for (let slot = 0; slot < state.playersData.length; slot++) {
    const player = state.playersData[slot];
    if (!player.connected || !player.uuid || player.lastSeenAt === undefined ||
        now - player.lastSeenAt < ROOM_LEASE_MS) continue;
    delete state.uuidToSlot[player.uuid];
    state.playersData[slot] = { ...PLAYER_PROFILES[slot] };
    rosterChanged = true;
  }
  if (rosterChanged) {
    updateRemoteHost(previousHost);
    updateLobbyShips();
  }
}

export { applyClientSync, broadcastCurrentMode, broadcastGameState, connectCloudNet, expireRemoteInputs, generateLobbyQR, generateRoomCode, getQueryParam, handleClientIncomingMessage, sendTvAction, setGamePaused, updateRemoteClient, withBrokerParam };
