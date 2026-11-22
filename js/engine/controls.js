import { buttonPressed, connectedGamepad, stickResponse } from "../gamepad.js";
import { CloudNet } from "../cloud_network.js";
import { SoundSynth as Sound } from "../sound_synth.js";
import { STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./config.js";
import { Ship } from "./entities.js";
import { updateLobbyShips } from "./entities.js";
import { requestLobbyAction } from "./lobby.js";
import { state } from "./state.js";
import { stageRotated } from "./viewport.js";

function ensureLocalPlayer() {
  if (state.isRemoteClient) return -1;
  if (state.localPlayerSlot !== -1) return state.localPlayerSlot;
  // El naranja queda disponible para el primer mando que se conecte por QR.
  for (let i = 1; i < state.playersData.length; i++) {
    if (!state.playersData[i].connected && !state.playersData[i].uuid) {
      state.localPlayerSlot = i;
      state.playersData[i].connected = true;
      state.playersData[i].ready = true;
      updateLobbyShips();
      if (state.currentState === STATE_ARENA && !state.activeShips.some((ship) => { return ship.slot === i; })) {
        state.activeShips.push(new Ship(i, 960, 800, -Math.PI / 2));
      }
      updateLocalPlayerButton();
      return i;
    }
  }
  return -1;
}

function updateLocalPlayerButton() {
  const button = /** @type {HTMLButtonElement|null} */ (document.getElementById("btn-local-player"));
  if (!button) return;
  button.style.display = state.isRemoteClient ? "none" : "";
  button.disabled = state.localPlayerSlot !== -1;
  if (state.localPlayerSlot !== -1) {
    button.textContent = "JUGANDO AQUÍ · " + state.playersData[state.localPlayerSlot].name;
    button.style.borderColor = state.playersData[state.localPlayerSlot].hull;
  }
}

const touchState = { heading: null, thrust: false, shoot: false };

const localPad = { heading: null, magnitude: 0, thrust: false, shoot: false };
let lastPadDirection = 0;
let lastPadConfirm = false;
let lastPadBack = false;
let localFirePress = 0;

function updateLocalInputValues(immediate) {
  let turn = 0;
  const left = state.keyState.left;
  const right = state.keyState.right;
  if (left && !right) turn = -1.0;
  else if (right && !left) turn = 1.0;

  state.localInputState.turn = turn;
  state.localInputState.heading = left || right ? null : touchState.heading ?? localPad.heading;
  state.localInputState.thrust = state.keyState.thrust || touchState.thrust || localPad.thrust;
  const shooting = state.keyState.shoot || touchState.shoot || localPad.shoot;
  if (shooting && !state.localInputState.shoot) localFirePress = Date.now();
  state.localInputState.shoot = shooting;

  if (state.isRemoteClient) {
    sendLocalInputsToHost(immediate);
  } else {
    if (state.localInputState.heading != null || state.localInputState.turn || state.localInputState.thrust || state.localInputState.shoot) ensureLocalPlayer();
    // El anfitrión solo puede conducir el barco asignado a esta pantalla.
    let localShip = null;
    for (let s = 0; s < state.activeShips.length; s++) {
      const sh = state.activeShips[s];
      if (sh && sh.isAlive && sh.slot === state.localPlayerSlot) {
        localShip = sh;
        break;
      }
    }
    if (localShip) {
      localShip.turnInput = state.localInputState.turn;
      localShip.headingInput = state.localInputState.heading;
      localShip.headingMagnitude = touchState.heading !== null ? 1 : localPad.magnitude;
      localShip.thrustInput = state.localInputState.thrust;
      if (state.localInputState.shoot && !localShip.shootInput) localShip.shotBuffer = 0.8;
      localShip.shootInput = state.localInputState.shoot;
    }
  }
}

function releaseLocalInputs() {
  state.keyState.left = false;
  state.keyState.right = false;
  state.keyState.thrust = false;
  state.keyState.shoot = false;
  touchState.heading = null;
  touchState.thrust = false;
  touchState.shoot = false;
  localPad.heading = null;
  localPad.thrust = localPad.shoot = false;
  updateLocalInputValues(true);
}

function sendLocalInputsToHost(immediate) {
  if (!state.isRemoteClient || !CloudNet || !CloudNet.isConnected()) return;

  const now = Date.now();
  const changed = (Math.abs(state.localInputState.turn - state.lastSentLocalInput.turn) > 0.05) ||
                (state.localInputState.heading !== state.lastSentLocalInput.heading) ||
                (state.localInputState.thrust !== state.lastSentLocalInput.thrust) ||
                (state.localInputState.shoot !== state.lastSentLocalInput.shoot);

  // Si cambió el input (girar, acelerar, disparar): enviar de inmediato con throttle máx 60ms
  // Si NO cambió: enviar solo un latido cada 350ms (~3 Hz) para mantener viva la sesión sin saturar la red
  if (!immediate && now - state.lastInputSendTime < (changed ? 60 : 350)) return;

  state.lastSentLocalInput.heading = state.localInputState.heading;
  state.lastSentLocalInput.turn = state.localInputState.turn;
  state.lastSentLocalInput.thrust = state.localInputState.thrust;
  state.lastSentLocalInput.shoot = state.localInputState.shoot;
  state.lastInputSendTime = now;

  CloudNet.sendToHost({
    type: "input",
    uuid: state.myPlayerUUID,
    turn: state.localInputState.turn,
    heading: state.localInputState.heading,
    thrust: state.localInputState.thrust,
    shoot: state.localInputState.shoot,
    firePress: Date.now() - localFirePress < 1100 ? localFirePress : 0
  });
}

function isTouchDevice() {
  return (("ontouchstart" in window) || !!(window.navigator && (window.navigator.maxTouchPoints > 0)));
}

function updateTouchControlsVisibility() {
  const touchControls = document.getElementById("onscreen-touch-controls");
  if (!touchControls) return;
  const playerSlot = state.isRemoteClient ? state.remoteSlot : state.localPlayerSlot;
  const visible = state.currentState === STATE_ARENA && playerSlot !== -1;
  if (!visible && touchControls.style.display === "flex") (state.releaseTouchControls ?? releaseLocalInputs)();
  touchControls.style.display = visible ? "flex" : "none";
}

function setupOnscreenControls() {
  const joystick = /** @type {HTMLElement & { releaseInput?: () => void }|null} */ (document.getElementById("touch-joystick"));
  const btnThrust = /** @type {HTMLElement & { releaseInput?: () => void }|null} */ (document.getElementById("touch-thrust"));
  const btnShoot = /** @type {HTMLElement & { releaseInput?: () => void }|null} */ (document.getElementById("touch-shoot"));

  function bindBtn(el, prop) {
    if (!el) return;
    let activeId = null;
    const knob = prop ? null : el.querySelector(".joystick-knob");

    function move(id, event) {
      if (prop || activeId !== id) return;
      const bounds = el.getBoundingClientRect();
      const screenX = event.clientX - bounds.left - bounds.width / 2;
      const screenY = event.clientY - bounds.top - bounds.height / 2;
      const x = stageRotated ? screenY : screenX;
      const y = stageRotated ? -screenX : screenY;
      const distance = Math.sqrt(x * x + y * y);
      const limit = Math.max(12, (Math.min(bounds.width, bounds.height) - 44) / 2);
      const travel = distance > limit ? limit / distance : 1;
      if (knob) knob.style.transform = "translate(calc(-50% + " + x * travel +
        "px), calc(-50% + " + y * travel + "px))";
      const heading = distance > 8 ? Math.atan2(y, x) : null;
      if (touchState.heading === heading) return;
      const immediate = heading == null || touchState.heading == null;
      touchState.heading = heading;
      updateLocalInputValues(immediate);
    }

    function press(id, e, point) {
      if (activeId !== null || state.currentState !== STATE_ARENA) return;
      if (e.cancelable) e.preventDefault();
      activeId = id;
      el.classList.add("pressed");
      if (prop) {
        touchState[prop] = true;
        updateLocalInputValues(true);
      } else {
        move(id, point);
      }
    }

    function release(id, e) {
      if (activeId !== id) return;
      if (e && e.cancelable) e.preventDefault();
      activeId = null;
      el.classList.remove("pressed");
      if (prop) {
        touchState[prop] = false;
      } else {
        touchState.heading = null;
        if (knob) knob.style.transform = "";
      }
      updateLocalInputValues(true);
    }

    if (window.PointerEvent) {
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        press(e.pointerId, e, e);
        if (activeId === e.pointerId && el.setPointerCapture) {
          try { el.setPointerCapture(e.pointerId); } catch (errCapture) {}
        }
      }, false);
      if (!prop) el.addEventListener("pointermove", (e) => { move(e.pointerId, e); }, false);
      function releasePointer(e) { release(e.pointerId, e); }
      el.addEventListener("pointerup", releasePointer, false);
      el.addEventListener("pointercancel", releasePointer, false);
      el.addEventListener("lostpointercapture", releasePointer, false);
    } else {
      el.addEventListener("touchstart", (e) => {
        if (e.changedTouches.length) press(e.changedTouches[0].identifier, e, e.changedTouches[0]);
      }, { passive: false });
      if (!prop) el.addEventListener("touchmove", (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const finger = e.changedTouches[i];
          move(finger.identifier, finger);
        }
      }, { passive: false });
      function releaseTouch(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          release(e.changedTouches[i].identifier, e);
        }
      }
      el.addEventListener("touchend", releaseTouch, { passive: false });
      el.addEventListener("touchcancel", releaseTouch, { passive: false });
      el.addEventListener("mousedown", (e) => { if (e.button === 0) press("mouse", e, e); }, false);
      if (!prop) el.addEventListener("mousemove", (e) => { move("mouse", e); }, false);
      el.addEventListener("mouseup", (e) => { release("mouse", e); }, false);
      el.addEventListener("mouseleave", (e) => { release("mouse", e); }, false);
    }

    // Una pérdida de foco puede ocurrir sin pointerup ni touchend.
    el.releaseInput = () => { release(activeId); };
  }

  bindBtn(joystick);
  bindBtn(btnThrust, "thrust");
  bindBtn(btnShoot, "shoot");

  function releaseControls() {
    releaseLocalInputs();
    const buttons = [joystick, btnThrust, btnShoot];
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i] && buttons[i].releaseInput) buttons[i].releaseInput();
    }
  }

  state.releaseTouchControls = releaseControls;
  window.addEventListener("blur", releaseControls, false);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseControls();
  }, false);
  updateTouchControlsVisibility();
}

/** @param {number} direction */
function navigateLobby(direction) {
  const modal = document.getElementById('join-modal');
  const scope = modal?.style.display !== 'none' && modal ? modal : document.getElementById('lobby-ui');
  if (!scope) return;
  const candidates = /** @type {NodeListOf<HTMLButtonElement>} */ (scope.querySelectorAll('button'));
  const visible = Array.from(candidates).filter(button => !button.disabled && button.getClientRects().length);
  const index = visible.findIndex(button => button === document.activeElement);
  visible[index === -1 ? 0 : (index + direction + visible.length) % visible.length]?.focus();
}

function pollLocalGamepad() {
  if (state.isRemoteClient) return;
  const pad = document.hidden ? null : connectedGamepad();
  if (!pad && localPad.heading === null && !localPad.thrust && !localPad.shoot &&
      !lastPadDirection && !lastPadConfirm && !lastPadBack) return;
  const x = pad?.axes[0] || 0;
  const y = pad?.axes[1] || 0;
  const confirm = Boolean(pad && buttonPressed(pad, 0));
  const back = Boolean(pad && buttonPressed(pad, 1));
  if (state.currentState === STATE_ARENA && pad) {
    const { heading, magnitude } = stickResponse(x, y, 0.18);
    localPad.heading = heading;
    localPad.magnitude = magnitude;
    localPad.thrust = back || buttonPressed(pad, 6);
    localPad.shoot = confirm || buttonPressed(pad, 7);
    updateLocalInputValues(false);
  } else {
    const hadInput = localPad.heading !== null || localPad.thrust || localPad.shoot;
    localPad.heading = null;
    localPad.thrust = localPad.shoot = false;
    if (hadInput) updateLocalInputValues(false);
    const direction = !pad ? 0 :
      buttonPressed(pad, 14) || buttonPressed(pad, 12) ? -1 :
      buttonPressed(pad, 15) || buttonPressed(pad, 13) ? 1 :
      Math.abs(x) > 0.55 ? Math.sign(x) : Math.abs(y) > 0.55 ? Math.sign(y) : 0;
    if (state.currentState === STATE_PODIUM) {
      if (direction && direction !== lastPadDirection) {
        state.podiumSelectedBtn = direction < 0 ? 0 : 1;
        document.getElementById(direction < 0 ? 'btn-play-again' : 'btn-back-lobby')?.focus();
      }
      if (back && !lastPadBack) requestLobbyAction('lobby');
      else if (confirm && !lastPadConfirm) requestLobbyAction(state.podiumSelectedBtn === 0 ? 'start' : 'lobby');
    } else if (state.currentState === STATE_LOBBY) {
      if (direction && direction !== lastPadDirection) navigateLobby(direction);
      if (confirm && !lastPadConfirm) {
        const button = /** @type {HTMLButtonElement|null} */ (document.activeElement);
        if (button?.tagName === 'BUTTON') button.click();
        else navigateLobby(1);
      }
    }
    lastPadDirection = direction;
  }
  lastPadConfirm = confirm;
  lastPadBack = back;
}

function bindKeyboard() {
  // Navegación y combate con teclado
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    const tag = /** @type {HTMLElement|null} */ (e.target)?.tagName;
    if (state.currentState === STATE_PODIUM && (!state.isRemoteClient || state.remoteSlot === 0)) {
      if (k === "arrowleft" || k === "arrowright") {
        state.podiumSelectedBtn = k === "arrowleft" ? 0 : 1;
        const button = /** @type {HTMLButtonElement|null} */ (document.getElementById(state.podiumSelectedBtn === 0 ? "btn-play-again" : "btn-back-lobby"));
        if (button) button.focus();
        e.preventDefault();
      } else if ((k === "enter" || k === " ") && tag !== "BUTTON") {
        e.preventDefault();
        requestLobbyAction(state.podiumSelectedBtn === 0 ? "start" : "lobby");
      }
      return;
    }
    if (state.isRemoteClient && state.currentState !== STATE_ARENA && state.currentState !== STATE_LOBBY) {
      if (k === "enter") requestLobbyAction("start");
      else if (k === "arrowleft" || k === "arrowright") requestLobbyAction("set_mode", (state.selectedMode + (k === "arrowleft" ? 2 : 1)) % 3);
      return;
    }

    if (k === "m") { // Tecla M: Mute
      Sound.toggleMute();
      return;
    }

    if (state.currentState === STATE_LOBBY) {
      const modal = document.getElementById("join-modal");
      const scope = modal && modal.style.display !== "none" ? modal : document.getElementById("lobby-ui");
      if (scope && ["arrowleft", "arrowup", "arrowright", "arrowdown"].includes(k) && (tag !== "INPUT" || (k === "arrowup" || k === "arrowdown"))) {
        const candidates = /** @type {NodeListOf<HTMLButtonElement|HTMLInputElement>} */ (scope.querySelectorAll("button, input"));
        const visible = [];
        for (let i = 0; i < candidates.length; i++) {
          if (!candidates[i].disabled && candidates[i].getClientRects().length) visible.push(candidates[i]);
        }
        if (visible.length) {
          const focused = visible.findIndex(button => button === document.activeElement);
          const step = k === "arrowleft" || k === "arrowup" ? -1 : 1;
          visible[focused < 0 ? 0 : (focused + step + visible.length) % visible.length].focus();
          e.preventDefault();
        }
      } else if (scope && k === "enter" && tag !== "BUTTON" && tag !== "INPUT") {
        const first = /** @type {HTMLButtonElement|HTMLInputElement|null} */ (scope.querySelector(scope === modal ? "input" : state.isRemoteClient ? "#btn-mode-horde" : "#play-menu button"));
        if (first && !first.disabled) first.focus();
        e.preventDefault();
      }
      return;
    }

    // Controles de juego en teclado para PC (Anfitrión o Cliente Online)
    const isPlaying = (state.currentState === STATE_ARENA);
    if (k === "arrowleft" || k === "a") { // ◄ / A: Girar Babor
      state.keyState.left = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "arrowright" || k === "d") { // ► / D: Girar Estribor
      state.keyState.right = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "arrowup" || k === "w") { // ▲ / W: Desplegar Velas / Impulso
      state.keyState.thrust = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === " " || k === "j") { // Espacio / J: Disparar Cañón
      state.keyState.shoot = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "shift" || k === "k") { // Shift / K: Turbo / Embestida con Espolón
      state.keyState.thrust = true;
      if (isPlaying) updateLocalInputValues();
    }
  }, false);
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    const isPlaying = (state.currentState === STATE_ARENA);

    if (k === "arrowleft" || k === "a") {
      state.keyState.left = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "arrowright" || k === "d") {
      state.keyState.right = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "arrowup" || k === "w") {
      state.keyState.thrust = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === " " || k === "j") {
      state.keyState.shoot = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === "shift" || k === "k") {
      state.keyState.thrust = false;
      if (isPlaying) updateLocalInputValues();
    }
  }, false);
}

export { pollLocalGamepad, bindKeyboard, ensureLocalPlayer, releaseLocalInputs, sendLocalInputsToHost, setupOnscreenControls, updateLocalPlayerButton, updateTouchControlsVisibility };
