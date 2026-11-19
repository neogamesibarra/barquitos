import { setupOnscreenControls } from "./controls.js";
import { startGameLoop } from "./game_loop.js";
import { bindLobbyButtons, setupFullscreenButton, setupInviteButtons } from "./lobby.js";
import { initArenaIslands } from "./modes.js";
import { connectCloudNet, generateLobbyQR, generateRoomCode, getQueryParam } from "./multiplayer.js";
import { state } from "./state.js";
import { fitLobby, resizeCanvas } from "./viewport.js";

let isEngineInitialized = false;

function initEngine() {
  if (isEngineInitialized) return;
  state.canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById("game-canvas"));
  if (!state.canvas) return;
  state.ctx = state.canvas.getContext("2d");
  if (!state.ctx) return;
  isEngineInitialized = true;

  state.elLobbyUI = document.getElementById("lobby-ui");
  resizeCanvas();
  initArenaIslands();

  // Generar código de sala inmediatamente para que nunca muestre ----
  if (!state.currentRoomCode && !getQueryParam("sala") && !getQueryParam("join")) {
    state.currentRoomCode = generateRoomCode();
    const roomDisp = document.getElementById("room-code-text") || document.getElementById("room-code-display");
    if (roomDisp) roomDisp.textContent = state.currentRoomCode;
    generateLobbyQR();
    setupInviteButtons();
  }

  connectCloudNet();
  setupFullscreenButton();
  setupOnscreenControls();
  bindLobbyButtons();
  const lobbyContent = document.getElementById("lobby-fit");
  if (lobbyContent && window.ResizeObserver) {
    new window.ResizeObserver(() => { fitLobby(state.canvas.width, state.canvas.height); }).observe(lobbyContent);
  }

  startGameLoop();
}

export { initEngine };
