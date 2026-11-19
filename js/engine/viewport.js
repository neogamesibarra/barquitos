import { STATE_ARENA, V_HEIGHT, V_WIDTH } from "./config.js";
import { releaseLocalInputs } from "./controls.js";
import { state } from "./state.js";

let scale = 1;

let offsetX = 0;

let offsetY = 0;

let stageRotated = false;

function fitLobby(width, height) {
  const content = document.getElementById("lobby-fit");
  if (!content || width < 1 || height < 1) return;
  content.style.width = Math.max(760, width) + "px";
  if (!content.offsetHeight) return;
  const factor = Math.min(1, width / content.offsetWidth, height / content.offsetHeight);
  content.style.transform = "translateX(-50%) scale(" + factor + ")";
}

function resizeCanvas() {
  if (!state.canvas) return;
  const viewport = window.visualViewport;
  const width = Math.floor(viewport && viewport.width || window.innerWidth);
  const height = Math.floor(viewport && viewport.height || window.innerHeight);
  const stage = document.getElementById("landscape-stage");
  const rotated = !!stage && height > width;
  if (stageRotated !== rotated) {
    stageRotated = rotated;
    (state.releaseTouchControls ?? releaseLocalInputs)();
  }
  state.canvas.width = rotated ? height : width;
  state.canvas.height = rotated ? width : height;
  if (stage) {
    stage.style.width = state.canvas.width + "px";
    stage.style.height = state.canvas.height + "px";
    stage.style.transform = rotated ? "translateX(" + width + "px) rotate(90deg)" : "translate(0, 0)";
    stage.setAttribute("data-rotated", rotated ? "true" : "false");
  }
  fitLobby(state.canvas.width, state.canvas.height);
  scale = Math.min(state.canvas.width / V_WIDTH, state.canvas.height / V_HEIGHT);
  offsetX = (state.canvas.width - V_WIDTH * scale) / 2;
  offsetY = (state.canvas.height - V_HEIGHT * scale) / 2;
  if (state.currentState === STATE_ARENA) {
    const panelW = 270;
    const pL = document.getElementById("hud-panel-left");
    const pR = document.getElementById("hud-panel-right");
    if (pL) {
      pL.style.left = offsetX + "px";
      pL.style.top = offsetY + "px";
      pL.style.transform = "scale(" + scale + ")";
    }
    if (pR) {
      pR.style.left = (offsetX + (V_WIDTH - panelW) * scale) + "px";
      pR.style.top = offsetY + "px";
      pR.style.transform = "scale(" + scale + ")";
    }
  }
}

function bindViewport() {
  window.addEventListener("resize", resizeCanvas, false);
  document.addEventListener("fullscreenchange", resizeCanvas, false);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeCanvas, false);
}

export { bindViewport, fitLobby, offsetX, offsetY, resizeCanvas, scale, stageRotated };
