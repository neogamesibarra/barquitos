/** @param {number} x @param {number} y @param {number} deadzone */
export function stickResponse(x, y, deadzone) {
  const distance = Math.hypot(x, y);
  if (distance <= deadzone) return { heading: null, magnitude: 0 };
  return {
    heading: Math.atan2(y, x),
    magnitude: Math.pow((Math.min(1, distance) - deadzone) / (1 - deadzone), 1.5)
  };
}

/** @param {Gamepad} pad @param {number} index */
export function buttonPressed(pad, index) {
  const button = pad.buttons[index];
  return Boolean(button && (button.pressed || button.value > 0.5));
}

/** @returns {Gamepad|null} */
export function connectedGamepad() {
  const pads = window.navigator?.getGamepads?.();
  for (let i = 0; pads && i < pads.length; i++) {
    if (pads[i]?.connected) return pads[i];
  }
  return null;
}
