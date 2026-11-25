import { buttonPressed, connectedGamepad, stickResponse } from "../gamepad.js";
import { CloudNet } from "../cloud_network.js";
import { session } from "./session.js";
import { controllerRotated, elements, triggerVibration } from "./ui.js";

const inputState = {
  heading: null,
  magnitude: 1,
  thrust: false,
  shoot: false
};

const lastSentInput = {
  heading: undefined,
  magnitude: 1,
  thrust: false,
  shoot: false
};

let touchSteerId = null;

let lastSentInputTime = 0;
let lastHeartbeatTime = 0;
const MIN_INPUT_INTERVAL_MS = 40; // 25 Hz para cambios continuos
const HEADING_THRESHOLD = 0.05; // radianes (~3°)
const HEARTBEAT_MS = 350;

let firePress = 0;

function sendInputUpdate(isImmediate = false) {
  if (session.mySlot === -1 || !CloudNet || !CloudNet.isConnected()) return;

  const now = Date.now();
  const heading = session.isPaused ? null : inputState.heading;
  const magnitude = session.isPaused ? 0 : inputState.magnitude;
  const previousHeading = lastSentInput.heading;
  const delta = heading - previousHeading;
  const headingChanged = heading == null || previousHeading == null
    ? heading !== previousHeading
    : Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) >= HEADING_THRESHOLD;
  const thrust = !session.isPaused && inputState.thrust;
  const shoot = !session.isPaused && inputState.shoot;
  const thrustDiff = thrust !== lastSentInput.thrust;
  const shootDiff = shoot !== lastSentInput.shoot;
  const stateChanged = headingChanged || thrustDiff || shootDiff ||
    Math.abs(magnitude - lastSentInput.magnitude) >= 0.025;
  const needsHeartbeat = (now - lastHeartbeatTime >= HEARTBEAT_MS);

  if (!isImmediate && !stateChanged && !needsHeartbeat) {
    return;
  }

  if (!isImmediate && (now - lastSentInputTime < MIN_INPUT_INTERVAL_MS)) {
    return;
  }

  lastSentInputTime = now;
  lastHeartbeatTime = now;
  lastSentInput.heading = heading;
  lastSentInput.magnitude = magnitude;
  lastSentInput.thrust = thrust;
  lastSentInput.shoot = shoot;

  CloudNet.sendToHost({
    type: 'input',
    uuid: session.playerUUID,
    th: thrust ? 1 : 0,
    sh: shoot && session.shipAlive ? 1 : 0,
    heading,
    magnitude: Math.round(magnitude * 1000) / 1000,
    firePress: !session.isPaused && session.shipAlive && now - firePress < 1100 ? firePress : 0
  });
}

function setupSteeringControls() {
  if (!elements.elSteeringZone || !elements.elWheelOuter || !elements.elWheelKnob) return;

  const wheel = elements.elWheelOuter;
  let originX = 0;
  let originY = 0;
  let limit = 1;
  let radius = 1;

  /** @param {{clientX: number, clientY: number}} point */
  function beginSteer(point) {
    const rect = wheel.getBoundingClientRect();
    originX = point.clientX;
    originY = point.clientY;
    radius = Math.max(6, Math.min(rect.width, rect.height) / 2);
    limit = Math.max(6, radius - elements.elWheelKnob.offsetWidth / 2);
    const center = wheel.parentElement.getBoundingClientRect();
    const dx = originX - center.left - center.width / 2;
    const dy = originY - center.top - center.height / 2;
    wheel.classList.add('is-floating');
    wheel.style.transform = `translate(${controllerRotated ? dy : dx}px, ${controllerRotated ? -dx : dy}px)`;
    handleSteerTouch(point);
  }

  /** @param {{clientX: number, clientY: number}} point */
  function handleSteerTouch(point) {
    const dx = point.clientX - originX;
    const dy = point.clientY - originY;
    const x = controllerRotated ? dy : dx;
    const y = controllerRotated ? -dx : dy;
    const distance = Math.hypot(x, y);
    const travel = distance > limit ? limit / distance : 1;
    const { heading, magnitude } = stickResponse(x / radius, y / radius, 0.14);
    const immediate = heading === null && inputState.heading !== null;
    inputState.heading = heading;
    inputState.magnitude = magnitude;
    elements.elWheelKnob.style.transform = `translate(${x * travel}px, ${y * travel}px)`;
    wheel.classList.toggle('is-steering', heading !== null);
    if (heading !== null) wheel.style.setProperty('--aim-heading', `${heading}rad`);
    sendInputUpdate(immediate);
  }

  function resetSteer() {
    resetSteering();
    sendInputUpdate(true);
  }

  if (window.PointerEvent) {
    const steering = elements.elSteeringZone;
    steering.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
    steering.addEventListener('pointerdown', event => {
      if (touchSteerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      touchSteerId = event.pointerId;
      steering.setPointerCapture(event.pointerId);
      beginSteer(event);
    });
    steering.addEventListener('pointermove', event => {
      if (touchSteerId === event.pointerId) handleSteerTouch(event);
    });
    const releasePointer = event => {
      if (touchSteerId === event.pointerId) resetSteer();
    };
    steering.addEventListener('pointerup', releasePointer);
    steering.addEventListener('pointercancel', releasePointer);
    steering.addEventListener('lostpointercapture', releasePointer);
    return;
  }

  elements.elSteeringZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (touchSteerId !== null) return;
    const t = e.changedTouches[0];
    touchSteerId = t.identifier;
    beginSteer(t);
  }, { passive: false });

  elements.elSteeringZone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchSteerId) {
        handleSteerTouch(t);
        break;
      }
    }
  }, { passive: false });

  elements.elSteeringZone.addEventListener("touchend", (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchSteerId) {
        resetSteer();
        break;
      }
    }
  }, false);

  elements.elSteeringZone.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    resetSteer();
  }, false);

  // Soporte con ratón para pruebas en PC
  let isMouseDown = false;
  elements.elSteeringZone.addEventListener("mousedown", (e) => {
    isMouseDown = true;
    touchSteerId = -1;
    beginSteer(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (isMouseDown && touchSteerId === -1) {
      handleSteerTouch(e);
    }
  });
  window.addEventListener("mouseup", () => {
    if (isMouseDown) {
      isMouseDown = false;
      if (touchSteerId === -1) resetSteer();
    }
  });
}

function resetSteering() {
  if (elements.elWheelOuter) {
    elements.elWheelOuter.classList.remove('is-steering', 'is-floating');
    elements.elWheelOuter.style.transform = '';
  }
  touchSteerId = null;
  inputState.heading = null;
  inputState.magnitude = 0;
  if (elements.elWheelKnob) {
    elements.elWheelKnob.style.transform = 'translate(0px, 0px)';
  }
}

function releaseInputs() {
  resetSteering();
  touchButtons.thrust = touchButtons.shoot = false;
  padButtons.thrust = padButtons.shoot = false;
  padNeedsNeutral = true;
  padSteering = false;
  inputState.thrust = false;
  inputState.shoot = false;
  if (elements.elBtnThrust) elements.elBtnThrust.className = 'touch-btn thrust-btn';
  if (elements.elBtnShoot) elements.elBtnShoot.className = 'touch-btn shoot-btn';
  sendInputUpdate(true);
}
const touchButtons = { thrust: false, shoot: false };
const padButtons = { thrust: false, shoot: false };

function syncCombatButtons() {
  const thrust = touchButtons.thrust || padButtons.thrust;
  const shoot = session.shipAlive && (touchButtons.shoot || padButtons.shoot);
  if (thrust === inputState.thrust && shoot === inputState.shoot) return false;
  if (thrust && !inputState.thrust) triggerVibration(30);
  if (shoot && !inputState.shoot) {
    markFirePress();
    triggerVibration(15);
  }
  inputState.thrust = thrust;
  inputState.shoot = shoot;
  elements.elBtnThrust?.classList.toggle('pressed', thrust);
  elements.elBtnShoot?.classList.toggle('pressed', shoot);
  return true;
}

function setupCombatButtons() {
  /** @param {HTMLElement|null} element @param {'thrust'|'shoot'} key */
  function bind(element, key) {
    if (!element) return;
    /** @param {boolean} pressed */
    const handle = pressed => (/** @type {Event} */ event) => {
      event.preventDefault();
      touchButtons[key] = pressed;
      if (syncCombatButtons()) sendInputUpdate(true);
    };
    const press = handle(true);
    const release = handle(false);
    element.addEventListener('touchstart', press, { passive: false });
    element.addEventListener('touchend', release, { passive: false });
    element.addEventListener('touchcancel', release, { passive: false });
    element.addEventListener('mousedown', press);
    element.addEventListener('mouseup', release);
  }
  bind(elements.elBtnThrust, 'thrust');
  bind(elements.elBtnShoot, 'shoot');
  window.addEventListener('mouseup', () => {
    touchButtons.thrust = touchButtons.shoot = false;
    if (syncCombatButtons()) sendInputUpdate(true);
  });
}

let pollingGamepad = false;
let padSteering = false;
let padNeedsNeutral = true;

/** @param {Gamepad|null} pad */
function applyGamepad(pad) {
  const x = pad?.axes[0] || 0;
  const y = pad?.axes[1] || 0;
  const { heading, magnitude } = stickResponse(x, y, 0.18);
  const shoot = Boolean(pad && (buttonPressed(pad, 0) || buttonPressed(pad, 7)));
  const thrust = Boolean(pad && (buttonPressed(pad, 1) || buttonPressed(pad, 6)));
  if (session.currentGameState !== 'playing' || document.hidden || !session.shipAlive) {
    padNeedsNeutral = true;
  } else if (padNeedsNeutral && heading === null && !shoot && !thrust) {
    padNeedsNeutral = false;
  }
  const active = Boolean(pad && !padNeedsNeutral);
  let released = false;
  if (touchSteerId === null && (padSteering || (active && heading !== null))) {
    released = inputState.heading !== null && (!active || heading === null);
    inputState.heading = active ? heading : null;
    inputState.magnitude = active ? magnitude : 0;
    padSteering = active && heading !== null;
  }
  padButtons.thrust = active && thrust;
  padButtons.shoot = active && shoot;
  const changed = syncCombatButtons();
  sendInputUpdate(released || changed);
}

function startGamepadPolling() {
  if (pollingGamepad || !connectedGamepad()) return;
  pollingGamepad = true;
  const poll = () => {
    const pad = connectedGamepad();
    applyGamepad(pad);
    if (pad) window.requestAnimationFrame(poll);
    else pollingGamepad = false;
  };
  window.requestAnimationFrame(poll);
}

function clearFirePress() {
  firePress = 0;
}

function markFirePress() {
  firePress = Date.now();
}

function initJoystick() {
  setupSteeringControls();
  setupCombatButtons();
  window.addEventListener('gamepadconnected', startGamepadPolling);
  startGamepadPolling();
  window.addEventListener('blur', releaseInputs);
  window.addEventListener('pagehide', releaseInputs);
  setInterval(sendInputUpdate, MIN_INPUT_INTERVAL_MS);
}

export { clearFirePress, initJoystick, inputState, markFirePress, releaseInputs, resetSteering, sendInputUpdate };
