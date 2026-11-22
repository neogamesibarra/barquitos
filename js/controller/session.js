import { STATE_LOBBY, STATE_ARENA, STATE_PODIUM } from "../engine/config.js";
import { setWakeLockActive, syncWakeLock } from "./pwa.js";
import { CloudNet } from "../cloud_network.js";
import { clearFirePress, releaseInputs, sendInputUpdate } from "./joystick.js";
import { elements, showPlayer, triggerVibration, updateHostControls, updateHostModeBtnText,
  updateShipStatusUI, updateLobbyConfigBarVisibility, updateReadyUI, updateTeamButtonsUI } from "./ui.js";

function getQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get(name) || '').toUpperCase();
  } catch (e) {
    return '';
  }
}

function getOrCreateUUID() {
  const key = 'barquitos_cloud_uuid';
  let saved = null;
  try {
    saved = window.localStorage.getItem(key);
  } catch (e) {}

  if (saved && saved.length > 8) {
    return saved;
  }

  let newUuid = 'u-';
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    newUuid += crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  } else {
    const chars = '0123456789abcdef';
    for (let i = 0; i < 12; i++) {
      newUuid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    newUuid += '-' + Date.now().toString(36);
  }

  try {
    window.localStorage.setItem(key, newUuid);
  } catch (e) {}

  return newUuid;
}

const SESSION_KEY = 'barquitos_controller_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const JOIN_INTERVAL_MS = 1500;
const MAX_RESUME_ATTEMPTS = 8;

function readSession() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
    if (saved && /^[A-Z0-9]{3,4}$/.test(saved.roomId) &&
        /^[A-Za-z0-9_-]{1,64}$/.test(saved.playerId) &&
        typeof saved.playerName === 'string' && saved.expiresAt > Date.now()) {
      return saved;
    }
  } catch {}
  clearStoredSession();
  return null;
}

function clearStoredSession() {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
}

const roomFromLink = getQueryParam('room') || getQueryParam('sala') || getQueryParam('join');
let savedSession = readSession();
if (roomFromLink && savedSession?.roomId !== roomFromLink) {
  clearStoredSession();
  savedSession = null;
}
const session = {
  playerUUID: savedSession?.playerId ?? getOrCreateUUID(),
  currentRoom: roomFromLink || savedSession?.roomId || '',
  mySlot: -1,
  isReady: false,
  shipAlive: true,
  ammo: null,
  maxAmmo: 0,
  currentGameState: 'lobby',
  currentMode: 0,
  myTeam: 'blue',
  myCustomName: savedSession?.playerName ?? ''
};

let joinRetryTimer = null;
let joinRetryCount = 0;
function saveSession() {
  savedSession = {
    roomId: session.currentRoom,
    playerId: session.playerUUID,
    playerName: session.myCustomName,
    broker: CloudNet.getBrokerParam(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(savedSession)); } catch {}
}

function requestJoin() {
  CloudNet.sendToHost({
    type: savedSession ? 'rejoin' : 'join',
    resumeOnly: Boolean(savedSession),
    shipStatus: true,
    uuid: session.playerUUID,
    name: session.myCustomName,
    team: session.myTeam
  });
}

function startJoinRetry() {
  stopJoinRetry();
  joinRetryTimer = setInterval(() => {
    if (session.mySlot !== -1 || !CloudNet.isConnected()) return stopJoinRetry();
    if (document.hidden) return;
    if (++joinRetryCount >= MAX_RESUME_ATTEMPTS && savedSession) {
      leaveRoom('No se encontró una sala activa. Escribe el código para volver a entrar.');
      return;
    }
    requestJoin();
    if (joinRetryCount >= 4 && session.mySlot === -1 && elements.elPlayerName) {
      elements.elPlayerName.textContent = `ESPERANDO AL ANFITRIÓN (SALA ${session.currentRoom})...`;
    }
  }, JOIN_INTERVAL_MS);
  requestJoin();
}

function stopJoinRetry() {
  if (joinRetryTimer !== null) clearInterval(joinRetryTimer);
  joinRetryTimer = null;
  joinRetryCount = 0;
}

function leaveRoom(message = 'Conéctate a una sala') {
  releaseInputs();
  CloudNet.disconnect();
  stopJoinRetry();
  clearStoredSession();
  savedSession = null;
  session.currentRoom = '';
  session.mySlot = -1;
  session.isReady = false;
  setGameState('lobby');
  updateReadyUI();
  updateHostControls();
  updateLobbyConfigBarVisibility();
  if (elements.elConnDot) elements.elConnDot.className = 'conn-dot offline';
  if (elements.elConnText) elements.elConnText.textContent = message;
  if (elements.elRoomOverlay) elements.elRoomOverlay.style.display = 'flex';
  window.history?.replaceState(null, '', window.location.pathname);
  clearFirePress();
}

function connectToRoom(roomCode) {
  const nextRoom = roomCode.trim().toUpperCase();
  if (!nextRoom) return;
  if (savedSession && savedSession.roomId !== nextRoom) {
    clearStoredSession();
    savedSession = null;
  }
  session.currentRoom = nextRoom;
  session.mySlot = -1;
  if (elements.elRoomOverlay) elements.elRoomOverlay.style.display = 'none';
  if (elements.elConnText) elements.elConnText.textContent = `Conectando a ${session.currentRoom}...`;

  CloudNet.initClient(session.currentRoom, session.playerUUID, {
    receiveGameState: false,
    preferredBroker: savedSession?.broker,
    onReady: () => {
      if (elements.elConnDot) elements.elConnDot.className = 'conn-dot online';
      if (elements.elConnText) elements.elConnText.textContent = `Sala: ${session.currentRoom}`;
      startJoinRetry();
    },
    onStatus: (status, text) => {
      if (elements.elConnDot) elements.elConnDot.className = 'conn-dot ' + (status === 'online' ? 'online' : (status === 'offline' ? 'offline' : ''));
      if (elements.elConnText) elements.elConnText.textContent = text;
      if (status !== 'online') {
        session.mySlot = -1;
        setWakeLockActive(false);
        releaseInputs();
        clearFirePress();
        stopJoinRetry();
      }
    },
    onMessage: (_topic, msg) => handleServerMessage(msg)
  });
}

/** @param {unknown} state */
function setGameState(state) {
  if (state === STATE_LOBBY || state === 'lobby') {
    session.currentGameState = 'lobby';
  } else if (state === STATE_PODIUM || state === 'podium') {
    session.currentGameState = 'podium';
  } else if (state === STATE_ARENA || state === 2 ||
      ['playing', 'arena', 'countdown', 'round_over', 'round-over'].some(value => value === state)) {
    // La cuenta atrás y el fin de ronda viven en la arena. El código 2 se admite por compatibilidad.
    session.currentGameState = 'playing';
  }
  if (session.currentGameState !== 'playing') {
    session.shipAlive = true;
    session.ammo = null;
    session.maxAmmo = 0;
  }
  updateShipStatusUI();
  setWakeLockActive(session.currentGameState === 'playing' && session.mySlot !== -1);
}

function handleServerMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'init') {
    stopJoinRetry();
    session.mySlot = msg.slot;
    session.myCustomName = msg.customName || session.myCustomName;
    saveSession();
    if (window.history && !window.history.state?.barquitosRoom) {
      window.history.pushState({ barquitosRoom: true }, '', window.location.href);
    }
    setGameState(msg.state);
    session.isReady = !!msg.ready;
    if (msg.mode !== undefined) session.currentMode = msg.mode;
    if (msg.team) session.myTeam = msg.team;

    // Si el jugador tenía una preferencia de equipo guardada localmente, re-sincronizar con el anfitrión
    try {
      const localTeam = window.localStorage.getItem('barquitos_team');
      if ((localTeam === 'red' || localTeam === 'blue') && localTeam !== session.myTeam) {
        session.myTeam = localTeam;
        if (CloudNet && CloudNet.isConnected()) {
          CloudNet.sendToHost({
            type: 'set_team',
            uuid: session.playerUUID,
            slot: session.mySlot,
            team: session.myTeam
          });
        }
      }
    } catch (eTeamInit) {}

    showPlayer(msg);
    updateTeamButtonsUI();
    updateReadyUI();
    updateHostControls();
    updateLobbyConfigBarVisibility();
  } else if (msg.type === 'team_confirmed') {
    if (msg.team) {
      session.myTeam = msg.team;
      updateTeamButtonsUI();
    }
  } else if (msg.type === 'ship_status') {
    if (session.mySlot === -1 || session.currentGameState !== 'playing' ||
        typeof msg.alive !== 'boolean' || !Number.isFinite(msg.ammo) || !Number.isFinite(msg.maxAmmo)) return;
    session.maxAmmo = Math.max(0, Math.min(999, Math.floor(msg.maxAmmo)));
    session.ammo = Math.max(0, Math.min(session.maxAmmo, Math.floor(msg.ammo)));
    const sunk = session.shipAlive && !msg.alive;
    session.shipAlive = msg.alive;
    if (sunk) {
      clearFirePress();
      releaseInputs();
    }
    updateShipStatusUI();
  } else if (msg.type === 'state_change') {
    setGameState(msg.state);
    if (session.currentGameState !== 'playing') {
      clearFirePress();
      releaseInputs();
    }
    updateHostControls();
    updateLobbyConfigBarVisibility();
  } else if (msg.type === 'mode_change') {
    session.currentMode = msg.mode;
    updateHostModeBtnText();
    updateTeamButtonsUI();
  } else if (msg.type === 'powerup') {
    triggerVibration([70, 50, 70]);
  } else if (msg.type === 'vibrate') {
    const duration = msg.duration || 80;
    triggerVibration(duration === 60 ? 15 : duration === 120 || duration === 300 ? [30, 45, 35] : duration);
  } else if (msg.type === 'session_expired' && session.mySlot === -1 && savedSession) {
    leaveRoom('La sesión ya no existe en esta sala.');
  } else if (msg.type === 'error') {
    alert(msg.message || 'Error al conectar');
  }
}

function loadPreferences() {
  try {
    session.myCustomName = savedSession?.playerName ?? window.localStorage.getItem('barquitos_nickname') ?? '';
    const team = window.localStorage.getItem('barquitos_team');
    if (team === 'blue' || team === 'red') session.myTeam = team;
  } catch {}
}

let nicknameTimer;
function updateNickname(name, immediate) {
  session.myCustomName = name;
  if (savedSession && session.mySlot !== -1) saveSession();
  try { window.localStorage.setItem('barquitos_nickname', name); } catch {}
  clearTimeout(nicknameTimer);
  const send = () => CloudNet.sendToHost({ type: 'set_name', uuid: session.playerUUID, name });
  if (immediate) send();
  else nicknameTimer = setTimeout(send, 250);
}

function resumeSession() {
  if (session.currentRoom && session.mySlot === -1) {
    if (joinRetryTimer !== null) requestJoin();
    else CloudNet.retryNow();
  } else if (session.mySlot !== -1) {
    sendInputUpdate(true);
  }
}

function bindSessionEvents() {
  window.addEventListener('popstate', () => {
    if (session.currentRoom && !window.history?.state?.barquitosRoom) leaveRoom();
  });
  document.addEventListener('visibilitychange', () => {
    void syncWakeLock();
    if (document.hidden) releaseInputs();
    else resumeSession();
  });
}

export { bindSessionEvents, connectToRoom, loadPreferences, session, updateNickname };
