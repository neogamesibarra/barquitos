import { MODE_HORDE, STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./config.js";
import { updateBattle, updateHorde } from "./modes.js";
import { broadcastGameState, expireRemoteInputs, updateRemoteClient } from "./multiplayer.js";
import { render } from "./renderer.js";
import { state } from "./state.js";

const STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;

/** @param {(step: number) => void} tick */
function createFixedClock(tick) {
  /** @type {number|undefined} */
  let lastTime;
  let remaining = 0;

  return {
    /** @param {number} time @returns {number} */
    advance(time) {
      const elapsed = (time - (lastTime ?? time)) / 1000;
      lastTime = time;
      const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, MAX_FRAME_TIME)) : 0;
      remaining += dt;
      while (remaining + 1e-10 >= STEP) {
        remaining = Math.max(0, remaining - STEP);
        tick(STEP);
      }
      return dt;
    },
    reset() {
      lastTime = undefined;
      remaining = 0;
    }
  };
}

const clock = createFixedClock(update);

/** @param {number} time */
function gameLoop(time) {
  if (document.hidden) {
    window.requestAnimationFrame(gameLoop);
    return;
  }
  let dt = 0;
  try {
    dt = clock.advance(time);
  } catch (err) {
    window.console?.error("[Barquitos Game Loop Error]", err);
  }

  try {
    render(dt);
  } catch (drawError) {
    // Reset also clears a leaked clipping region/save stack after a failed draw.
    if (state.canvas) state.canvas.width = state.canvas.width;
    if (window.console && window.console.error) window.console.error("[Barquitos Render Error]", drawError);
  } finally {
    window.requestAnimationFrame(gameLoop);
  }
}

/** @param {number} dt */
function update(dt) {
  state.waveAnim += dt;
  if (state.shakeTimer > 0) {
    state.shakeTimer -= dt;
    if (state.shakeTimer < 0) state.shakeTimer = 0;
  }

  if (state.isRemoteClient) {
    updateRemoteClient(dt);
    return;
  }

  // Modo Anfitrión: Física y Reglas del Juego
  expireRemoteInputs(Date.now());
  if (state.currentState === STATE_LOBBY) {
    for (let s = 0; s < state.activeShips.length; s++) {
      state.activeShips[s].update(dt);
    }
  } else if (state.currentState === STATE_ARENA) {
    if (state.selectedMode === MODE_HORDE) {
      updateHorde(dt);
    } else {
      updateBattle(dt);
    }
  } else if (state.currentState === STATE_PODIUM) {
    state.podiumAnimTimer += dt;
  }

  // Difusión del estado del mundo a jugadores online remotos.
  broadcastGameState();
}

function startGameLoop() {
  document.addEventListener('visibilitychange', clock.reset);
  window.requestAnimationFrame(gameLoop);
}

export { createFixedClock, startGameLoop };
