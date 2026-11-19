import { CloudNet } from "../cloud_network.js";
import { session } from "./session.js";
import { controllerRotated, elements, triggerVibration } from "./ui.js";

const inputState = {
  heading: null,
  thrust: false,
  shoot: false
};

const lastSentInput = {
  heading: undefined,
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
  const heading = inputState.heading;
  const previousHeading = lastSentInput.heading;
  const delta = heading - previousHeading;
  const headingChanged = heading == null || previousHeading == null
    ? heading !== previousHeading
    : Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) >= HEADING_THRESHOLD;
  const thrustDiff = inputState.thrust !== lastSentInput.thrust;
  const shootDiff = inputState.shoot !== lastSentInput.shoot;
  const stateChanged = headingChanged || thrustDiff || shootDiff;
  const needsHeartbeat = (now - lastHeartbeatTime >= HEARTBEAT_MS);

  if (!isImmediate && !stateChanged && !needsHeartbeat) {
    return;
  }

  if (!isImmediate && (now - lastSentInputTime < MIN_INPUT_INTERVAL_MS)) {
    return;
  }

  lastSentInputTime = now;
  lastHeartbeatTime = now;
  lastSentInput.heading = inputState.heading;
  lastSentInput.thrust = inputState.thrust;
  lastSentInput.shoot = inputState.shoot;

  // El joystick solo transmite dirección: el impulso sigue siendo un botón.
  CloudNet.sendToHost({
    type: 'input',
    uuid: session.playerUUID,
    th: inputState.thrust ? 1 : 0,
    sh: inputState.shoot ? 1 : 0,
    heading: inputState.heading,
    firePress: now - firePress < 1100 ? firePress : 0
  });
}

function setupSteeringControls() {
  if (!elements.elSteeringZone || !elements.elWheelOuter || !elements.elWheelKnob) return;

  function handleSteerTouch(touch) {
    const rect = elements.elWheelOuter.getBoundingClientRect();
    const screenX = touch.clientX - rect.left - rect.width / 2;
    const screenY = touch.clientY - rect.top - rect.height / 2;
    const x = controllerRotated ? screenY : screenX;
    const y = controllerRotated ? -screenX : screenY;
    const distance = Math.sqrt(x * x + y * y);
    const limit = Math.max(6, (Math.min(rect.width, rect.height) - elements.elWheelKnob.offsetWidth) / 2);
    const travel = distance > limit ? limit / distance : 1;
    const heading = distance > 7 ? Math.round(Math.atan2(y, x) * 100) / 100 : null;
    const immediate = heading === null && inputState.heading !== null;
    inputState.heading = heading;
    elements.elWheelKnob.style.transform = "translate(" + x * travel + "px, " + y * travel + "px)";
    const wheel = elements.elWheelOuter;
    wheel.classList.toggle('is-steering', heading !== null);
    if (heading !== null) wheel.style.setProperty('--aim-heading', `${Math.atan2(y, x)}rad`);
    sendInputUpdate(immediate);
  }

  function resetSteer() {
    inputState.heading = null;
    elements.elWheelKnob.style.transform = "translate(0px, 0px)";
    elements.elWheelOuter.classList.remove("is-steering");
    touchSteerId = null;
    sendInputUpdate(true);
  }

  if (window.PointerEvent) {
    const steering = elements.elSteeringZone;
    steering.addEventListener('pointerdown', event => {
      if (touchSteerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      touchSteerId = event.pointerId;
      steering.setPointerCapture(event.pointerId);
      handleSteerTouch(event);
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
    handleSteerTouch(t);
  }, false);

  elements.elSteeringZone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchSteerId) {
        handleSteerTouch(t);
        break;
      }
    }
  }, false);

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
    handleSteerTouch(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (isMouseDown) {
      handleSteerTouch(e);
    }
  });
  window.addEventListener("mouseup", () => {
    if (isMouseDown) {
      isMouseDown = false;
      resetSteer();
    }
  });
}

function resetSteering() {
  elements.elWheelOuter?.classList.remove("is-steering");
  touchSteerId = null;
  inputState.heading = null;
  if (elements.elWheelKnob) {
    elements.elWheelKnob.style.transform = 'translate(0px, 0px)';
  }
}

function releaseInputs() {
  resetSteering();
  inputState.thrust = false;
  inputState.shoot = false;
  if (elements.elBtnThrust) elements.elBtnThrust.className = 'touch-btn thrust-btn';
  if (elements.elBtnShoot) elements.elBtnShoot.className = 'touch-btn shoot-btn';
  sendInputUpdate(true);
}
function setupCombatButtons() {
  // Acelerar (Velas)
  if (elements.elBtnThrust) {
    function setThrust(active) {
      if (inputState.thrust === active) return;
      inputState.thrust = active;
      if (active) {
        elements.elBtnThrust.className = 'touch-btn thrust-btn pressed';
        triggerVibration(30);
      } else {
        elements.elBtnThrust.className = 'touch-btn thrust-btn';
      }
      sendInputUpdate(true); // Envío inmediato al presionar o soltar
    }

    elements.elBtnThrust.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setThrust(true);
    }, false);

    elements.elBtnThrust.addEventListener('touchend', (e) => {
      e.preventDefault();
      setThrust(false);
    }, false);

    elements.elBtnThrust.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      setThrust(false);
    }, false);

    elements.elBtnThrust.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setThrust(true);
    });
    elements.elBtnThrust.addEventListener('mouseup', (e) => {
      e.preventDefault();
      setThrust(false);
    });
  }

  // El estado evita eventos duplicados sin descartar pulsaciones rápidas.
  if (elements.elBtnShoot) {
    function setShoot(active) {
      if (inputState.shoot === active) return;
      inputState.shoot = active;
      if (active) markFirePress();
      if (active) {
        elements.elBtnShoot.className = 'touch-btn shoot-btn pressed';
        triggerVibration(15);
      } else {
        elements.elBtnShoot.className = 'touch-btn shoot-btn';
      }
      sendInputUpdate(true); // Envío inmediato
    }

    elements.elBtnShoot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setShoot(true);
    }, false);

    elements.elBtnShoot.addEventListener('touchend', (e) => {
      e.preventDefault();
      setShoot(false);
    }, false);

    elements.elBtnShoot.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      setShoot(false);
    }, false);

    elements.elBtnShoot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setShoot(true);
    });
    elements.elBtnShoot.addEventListener('mouseup', (e) => {
      e.preventDefault();
      setShoot(false);
    });
  }

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
  window.addEventListener('blur', releaseInputs);
  window.addEventListener('pagehide', releaseInputs);
  setInterval(sendInputUpdate, MIN_INPUT_INTERVAL_MS);
}

export { clearFirePress, initJoystick, inputState, markFirePress, releaseInputs, resetSteering, sendInputUpdate };
