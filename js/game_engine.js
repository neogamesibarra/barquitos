import { initEngine } from "./engine/bootstrap.js";
import { bindKeyboard } from "./engine/controls.js";
import { updateLobbyModeUI } from "./engine/lobby.js";
import { startNewMatch, startRoundByMode } from "./engine/modes.js";
import { broadcastCurrentMode } from "./engine/multiplayer.js";
import { state } from "./engine/state.js";
import { bindViewport } from "./engine/viewport.js";

window.BarquitosGame = {
  startRound: startRoundByMode,
  startNewMatch: startNewMatch,
  setMode: (m) => {
    state.selectedMode = m;
    updateLobbyModeUI();
    broadcastCurrentMode();
  }
};

bindKeyboard();
bindViewport();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEngine, { once: true });
} else {
  initEngine();
}
