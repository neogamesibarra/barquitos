import { CloudNet } from "../cloud_network.js";
import { releaseInputs, resetSteering, sendInputUpdate } from "./joystick.js";
import { connectToRoom, session, updateNickname } from "./session.js";

const elements = {
  elContainer: null,
  elConnDot: null,
  elConnText: null,
  elPlayerName: null,
  elPlayerTeam: null,
  elPlayerSymbol: null,
  elBtnReady: null,
  elBtnFullscreen: null,
  elSteeringZone: null,
  elWheelOuter: null,
  elWheelKnob: null,
  elBtnThrust: null,
  elBtnShoot: null,
  elBtnStyleToggle: null,
  elStyleText: null,
  elHostPanel: null,
  elBtnHostStart: null,
  elBtnHostMode: null,
  elBtnHostLobby: null,
  elRoomOverlay: null,
  elRoomInput: null,
  elBtnJoin: null,
  elLobbyConfigBar: null,
  elInputNickname: null,
  elTeamSelector: null,
  elBtnTeamBlue: null,
  elBtnTeamRed: null,
};

let currentControlStyle = 'classic';

const SYMBOL_GLYPHS = {
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '◆',
  star: '★',
  heart: '♥',
  crown: '👑',
  bolt: '⚡'
};

function updateHostModeBtnText() {
  if (!elements.elBtnHostMode) return;
  const modeLabels = ['⚔️ CLÁSICO', '🚩 EQUIPOS', '💀 HORDA'];
  elements.elBtnHostMode.textContent = '🔄 ' + (modeLabels[session.currentMode] || 'MODO');
}

function updateTeamButtonsUI() {
  const badge = elements.elPlayerTeam;
  if (badge) {
    badge.hidden = session.currentMode !== 1 || session.mySlot === -1;
    badge.textContent = session.myTeam === 'red' ? 'Rojo' : 'Azul';
    badge.setAttribute('data-team', session.myTeam);
  }
  if (!elements.elTeamSelector) return;
  // El selector de equipo solo se muestra si el modo es 1 (Batalla por Equipos)
  if (session.currentMode === 1 && (session.currentGameState === 'lobby' || session.currentGameState === 'podium')) {
    elements.elTeamSelector.style.display = 'flex';
  } else {
    elements.elTeamSelector.style.display = 'none';
  }

  if (elements.elBtnTeamBlue) {
    elements.elBtnTeamBlue.className = 'team-choice-btn blue' + (session.myTeam === 'blue' ? ' active' : '');
  }
  if (elements.elBtnTeamRed) {
    elements.elBtnTeamRed.className = 'team-choice-btn red' + (session.myTeam === 'red' ? ' active' : '');
  }
}

function updateLobbyConfigBarVisibility() {
  elements.elContainer?.setAttribute('data-state', session.currentGameState);
  if (!elements.elLobbyConfigBar) return;
  // Ocultar barra de configuración durante la ronda de juego
  if (session.currentGameState === 'playing') {
    elements.elLobbyConfigBar.style.display = 'none';
  } else {
    elements.elLobbyConfigBar.style.display = 'flex';
    updateTeamButtonsUI();
  }
}

function updateHostControls() {
  if (elements.elBtnHostLobby) {
    elements.elBtnHostLobby.hidden = session.mySlot !== 0 || session.currentGameState !== 'podium';
  }
  if (!elements.elHostPanel) return;

  // Solo el Mando 1 (session.mySlot === 0) muestra controles de anfitrión en podio o lobby
  if (session.mySlot === 0 && (session.currentGameState === 'podium' || session.currentGameState === 'lobby')) {
    elements.elHostPanel.style.display = 'flex';
    if (elements.elBtnThrust) elements.elBtnThrust.style.display = 'none';
    if (elements.elBtnShoot) elements.elBtnShoot.style.display = 'none';
    if (elements.elBtnHostStart) {
      elements.elBtnHostStart.textContent = (session.currentGameState === 'podium') ? '⚓ OTRA PARTIDA' : '⚓ INICIAR PARTIDA';
    }
    updateHostModeBtnText();
  } else {
    // Durante la ronda activa o en mandos 2-8: botones táctiles normales de acción
    elements.elHostPanel.style.display = 'none';
    if (elements.elBtnThrust) elements.elBtnThrust.style.display = 'flex';
    if (elements.elBtnShoot) elements.elBtnShoot.style.display = 'flex';
  }
}

/** @param {VibratePattern} pattern */
function triggerVibration(pattern) {
  try { window.navigator?.vibrate?.(pattern); } catch {}
}

function updateReadyUI() {
  if (!elements.elBtnReady) return;
  if (session.isReady) {
    elements.elBtnReady.className = 'ready-btn active';
    elements.elBtnReady.textContent = 'LISTO ✓';
  } else {
    elements.elBtnReady.className = 'ready-btn';
    elements.elBtnReady.textContent = 'PREPARARSE';
  }
}

function toggleReady() {
  session.isReady = !session.isReady;
  updateReadyUI();
  triggerVibration(40);

  if (CloudNet) {
    CloudNet.sendToHost({
      type: 'ready',
      uuid: session.playerUUID,
      ready: session.isReady
    });
  }
}

function isDocumentFullscreen() {
  return Boolean(document.fullscreenElement);
}

function getViewportSize() {
  const vv = window.visualViewport;
  if (vv && vv.width && vv.height) {
    return {
      w: Math.floor(vv.width),
      h: Math.floor(vv.height)
    };
  }
  return {
    w: window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth || 360,
    h: window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 640
  };
}

let controllerRotated = false;

function updateLayoutDimensions() {
  const container = document.getElementById("gamepad-container");
  if (!container) return;

  const vp = getViewportSize();
  const w = vp.w;
  const h = vp.h;

  document.documentElement.style.width = w + "px";
  document.documentElement.style.height = h + "px";
  document.documentElement.style.maxWidth = w + "px";
  document.documentElement.style.maxHeight = h + "px";
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.margin = "0";
  document.documentElement.style.padding = "0";

  document.body.style.width = w + "px";
  document.body.style.height = h + "px";
  document.body.style.maxWidth = w + "px";
  document.body.style.maxHeight = h + "px";
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.body.style.padding = "0";

  const rotate = h > w;
  container.setAttribute("data-rotated", rotate ? "true" : "false");
  if (controllerRotated !== rotate) {
    controllerRotated = rotate;
    releaseInputs();
  }
  const layoutWidth = rotate ? h : w;
  const layoutHeight = rotate ? w : h;

  // El mando conserva un plano horizontal dentro del viewport visible.
  container.style.position = "fixed";
  container.style.top = "0px";
  container.style.left = "0px";
  container.style.right = "auto";
  container.style.bottom = "auto";
  container.style.width = layoutWidth + "px";
  container.style.height = layoutHeight + "px";
  container.style.maxWidth = layoutWidth + "px";
  container.style.maxHeight = layoutHeight + "px";
  container.style.overflow = "hidden";
  container.style.transformOrigin = "0 0";
  container.style.transform = rotate ? "translateX(" + w + "px) rotate(90deg)" : "none";

  const controlsArea = /** @type {HTMLElement|null} */ (document.querySelector(".controls-area"));
  if (controlsArea) {
    controlsArea.style.height = "";
    controlsArea.style.maxHeight = "";
  }

  const overlay = document.getElementById("room-overlay");
  if (overlay) {
    overlay.style.position = "fixed";
    overlay.style.top = "0px";
    overlay.style.left = "0px";
    overlay.style.right = "0px";
    overlay.style.bottom = "0px";
    overlay.style.width = w + "px";
    overlay.style.height = h + "px";
    overlay.style.transform = "none";
    overlay.style.transformOrigin = "initial";
  }
}

async function toggleFullscreen() {
  try {
    if (isDocumentFullscreen()) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.();
      if (isDocumentFullscreen()) await window.screen?.orientation?.lock?.('landscape');
    }
  } catch {
    // Fullscreen and orientation lock can be denied on mobile.
  }
  updateLayoutDimensions();
}

// Envío controlado y optimizado por red MQTT (15-20 Hz / 50ms-66ms)
function setControlStyle(style) {
  currentControlStyle = (style === 'compact') ? 'compact' : 'classic';
  try {
    window.localStorage.setItem('barquitos_control_style', currentControlStyle);
  } catch (eStyleSave) {}

  if (elements.elContainer) {
    if (currentControlStyle === 'compact') {
      if (elements.elContainer.className.indexOf('style-compact') === -1) {
        elements.elContainer.className += ' style-compact';
      }
    } else {
      elements.elContainer.className = elements.elContainer.className.replace(/\bstyle-compact\b/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  if (elements.elStyleText) {
    elements.elStyleText.textContent = (currentControlStyle === 'compact') ? 'COMPACTO' : 'CLÁSICO';
  }

  resetSteering();
  sendInputUpdate();
}

function toggleControlStyle() {
  const nextStyle = (currentControlStyle === 'classic') ? 'compact' : 'classic';
  setControlStyle(nextStyle);
  triggerVibration(35);
}


/** @param {HTMLButtonElement|null} button @param {number} delay @param {() => void} action */
function bindTap(button, delay, action) {
  if (!button) return;
  let lastTap = -Infinity;
  /** @param {Event} event */
  const onTap = event => {
    event.preventDefault();
    const now = Date.now();
    if (now - lastTap < delay) return;
    lastTap = now;
    action();
  };
  button.addEventListener("click", onTap);
  button.addEventListener("touchend", onTap);
}

function setupActionButtons() {
  // Botones del Anfitrión (Mando 1) con soporte para click y touch
  if (elements.elBtnHostStart) {
    let lastHostStartTap = 0;
    function handleHostStart(e) {
      const now = Date.now();
      if (now - lastHostStartTap < 350) return;
      lastHostStartTap = now;
      if (e && e.preventDefault) e.preventDefault();
      triggerVibration(50);
      if (CloudNet) {
        CloudNet.sendToHost({
          type: "host_action",
          uuid: session.playerUUID,
          action: "start"
        });
      }
    }
    elements.elBtnHostStart.addEventListener("click", handleHostStart, false);
    elements.elBtnHostStart.addEventListener("touchend", handleHostStart, false);
  }

  if (elements.elBtnHostMode) {
    let lastHostModeTap = 0;
    function handleHostMode(e) {
      const now = Date.now();
      if (now - lastHostModeTap < 300) return;
      lastHostModeTap = now;
      if (e && e.preventDefault) e.preventDefault();
      triggerVibration(40);
      if (CloudNet) {
        CloudNet.sendToHost({
          type: "host_action",
          uuid: session.playerUUID,
          action: "toggle_mode"
        });
      }
    }
    elements.elBtnHostMode.addEventListener("click", handleHostMode, false);
    elements.elBtnHostMode.addEventListener("touchend", handleHostMode, false);
  }

  bindTap(elements.elBtnHostLobby, 350, () => {
    if (session.mySlot !== 0 || session.currentGameState !== 'podium') return;
    CloudNet.sendToHost({ type: "host_action", uuid: session.playerUUID, action: "lobby" });
  });

  bindTap(elements.elBtnReady, 300, toggleReady);

  // Pantalla Completa
  if (elements.elBtnFullscreen) {
    let lastFsTap = 0;
    function handleFsTap(e) {
      const now = Date.now();
      if (now - lastFsTap < 400) return;
      lastFsTap = now;
      if (e && e.preventDefault) e.preventDefault();
      toggleFullscreen();
    }
    elements.elBtnFullscreen.addEventListener("click", handleFsTap, false);
    elements.elBtnFullscreen.addEventListener("touchend", handleFsTap, false);
  }

  // Diálogo de Sala Manual
  if (elements.elBtnJoin && elements.elRoomInput) {
    function submitRoom() {
      const val = elements.elRoomInput.value.trim().toUpperCase();
      if (val.length >= 3) {
        connectToRoom(val);
      } else {
        alert('Por favor introduce el código de sala que aparece en la TV');
      }
    }

    elements.elBtnJoin.addEventListener('click', submitRoom);
    elements.elRoomInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') submitRoom();
    });
  }
}

function preventPageZoom() {
  document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
  }, false);

  document.addEventListener('touchmove', (e) => {
    if ('scale' in e && e.scale !== undefined && e.scale !== 1) {
      e.preventDefault();
    }
  }, { passive: false });
}

function showPlayer(msg) {
  const displayName = msg.customName || ('JUGADOR ' + (session.mySlot + 1));
  if (elements.elPlayerName) {
    elements.elPlayerName.textContent = displayName.toUpperCase() + ' (' + msg.name.toUpperCase() + ')';
  }
  if (elements.elPlayerSymbol && msg.symbol) {
    elements.elPlayerSymbol.textContent = SYMBOL_GLYPHS[msg.symbol] || '●';
  }
  if (elements.elContainer && msg.hull) {
    elements.elContainer.style.setProperty("--captain-color", msg.hull);
  }
}

function initUI() {
  elements.elContainer = document.getElementById('gamepad-container');
  elements.elConnDot = document.getElementById('conn-dot');
  elements.elConnText = document.getElementById('conn-text');
  elements.elPlayerName = document.getElementById('player-name');
  elements.elPlayerTeam = document.getElementById('player-team');
  elements.elPlayerSymbol = document.getElementById('player-symbol');
  elements.elBtnReady = document.getElementById('btn-ready');
  elements.elBtnFullscreen = document.getElementById('btn-fullscreen');

  elements.elSteeringZone = document.getElementById('steering-zone');
  elements.elWheelOuter = document.getElementById('wheel-outer');
  elements.elWheelKnob = document.getElementById('wheel-knob');
  elements.elBtnThrust = document.getElementById('btn-thrust');
  elements.elBtnShoot = document.getElementById('btn-shoot');

  elements.elBtnStyleToggle = document.getElementById('btn-style-toggle');
  elements.elStyleText = document.getElementById('style-text');

  elements.elHostPanel = document.getElementById('host-panel');
  elements.elBtnHostStart = document.getElementById('btn-host-start');
  elements.elBtnHostMode = document.getElementById('btn-host-mode');
  elements.elBtnHostLobby = document.getElementById('btn-host-lobby');

  elements.elRoomOverlay = document.getElementById('room-overlay');
  elements.elRoomInput = document.getElementById('room-input');
  elements.elBtnJoin = document.getElementById('btn-join-room');

  elements.elLobbyConfigBar = document.getElementById('lobby-config-bar');
  elements.elInputNickname = document.getElementById('input-nickname');
  elements.elTeamSelector = document.getElementById('team-selector');
  elements.elBtnTeamBlue = document.getElementById('btn-team-blue');
  elements.elBtnTeamRed = document.getElementById('btn-team-red');

  if (elements.elInputNickname) {
    elements.elInputNickname.value = session.myCustomName;
    const sync = immediate => updateNickname(elements.elInputNickname.value.trim().slice(0, 12), immediate);
    elements.elInputNickname.addEventListener('input', () => sync(false));
    elements.elInputNickname.addEventListener('change', () => sync(true));
  }

  function chooseTeam(team) {
    session.myTeam = team;
    try { window.localStorage.setItem('barquitos_team', team); } catch(e){}
    updateTeamButtonsUI();
    triggerVibration(40);
    if (CloudNet && CloudNet.isConnected()) {
      CloudNet.sendToHost({
        type: 'set_team',
        uuid: session.playerUUID,
        slot: session.mySlot,
        team: team
      });
    }
  }

  function bindTeamButton(btn, team) {
    if (!btn) return;
    let lastTouch = 0;
    function handleTeamTap(e) {
      const now = Date.now();
      if (now - lastTouch < 300) return;
      lastTouch = now;
      if (e && e.preventDefault) e.preventDefault();
      chooseTeam(team);
    }
    btn.addEventListener('touchend', handleTeamTap, false);
    btn.addEventListener('click', handleTeamTap, false);
  }

  bindTeamButton(elements.elBtnTeamBlue, 'blue');
  bindTeamButton(elements.elBtnTeamRed, 'red');

  preventPageZoom();
  updateLayoutDimensions();
  setupActionButtons();
  if (elements.elBtnStyleToggle) {
    let lastStyleTap = 0;
    const handleStyleToggle = event => {
      const now = Date.now();
      if (now - lastStyleTap < 300) return;
      lastStyleTap = now;
      event.preventDefault();
      toggleControlStyle();
    };
    elements.elBtnStyleToggle.addEventListener('click', handleStyleToggle);
    elements.elBtnStyleToggle.addEventListener('touchend', handleStyleToggle);
  }
  try {
    const style = window.localStorage.getItem('barquitos_control_style');
    if (style === 'classic' || style === 'compact') currentControlStyle = style;
  } catch {}
  setControlStyle(currentControlStyle);
  window.addEventListener('resize', updateLayoutDimensions);
  window.screen?.orientation?.addEventListener('change', updateLayoutDimensions);
  document.addEventListener('fullscreenchange', updateLayoutDimensions);
  window.visualViewport?.addEventListener('resize', updateLayoutDimensions);
  window.visualViewport?.addEventListener('scroll', updateLayoutDimensions);
}

export { controllerRotated, elements, initUI, setupActionButtons, showPlayer, triggerVibration,
  updateHostControls, updateHostModeBtnText, updateLobbyConfigBarVisibility, updateReadyUI, updateTeamButtonsUI };
