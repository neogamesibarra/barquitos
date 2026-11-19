/**
 * @typedef {{
 * 'ship:fired': [],
 * 'ship:hit': [],
 * 'ship:sunk': [],
 * 'round:start': [],
 * 'round:end': [celebrate: boolean],
 * 'match:end': [],
 * 'wave:start': [],
 * 'sound:powerup': [],
 * 'sound:countdown': [final: boolean],
 * 'boss:spawn': [],
 * 'ship:hud': [slot: number],
 * 'effect:splash': [x: number, y: number],
 * 'effect:muzzle': [x: number, y: number, rotation: number],
 * 'effect:island-impact': [x: number, y: number],
 * 'effect:splinters': [x: number, y: number, dx: number, dy: number],
 * 'effect:foam': [x: number, y: number, dx: number, dy: number],
 * 'effect:sparks': [x: number, y: number, dx: number, dy: number],
 * 'effect:text': [text: string, x: number, y: number, color: string, size: number],
 * 'effect:shake': [duration: number, intensity: number],
 * 'effect:confetti': [count: number]
 * }} GameEvents
 */

/** @template {keyof GameEvents} K @typedef {(...args: GameEvents[K]) => void} Listener */

/** Creates a synchronous bus. Subscriptions are owned by the page, outside round setup. */
export function createEventBus() {
  /** @type {Map<keyof GameEvents, Set<(...args: any[]) => void>>} */
  const channels = new Map();

  /** @template {keyof GameEvents} K @param {K} topic @param {Listener<K>} listener */
  function off(topic, listener) {
    const channel = channels.get(topic);
    channel?.delete(listener);
    if (channel?.size === 0) channels.delete(topic);
  }

  /** @template {keyof GameEvents} K @param {K} topic @param {Listener<K>} listener @returns {() => void} */
  function on(topic, listener) {
    if (!channels.has(topic)) channels.set(topic, new Set());
    channels.get(topic).add(listener);
    return () => off(topic, listener);
  }

  // Fixed arguments avoid creating a rest array for collision effects on every tick.
  const emit = /** @type {<K extends keyof GameEvents>(topic: K, ...args: GameEvents[K]) => void} */ (
    function (topic, first = undefined, second = undefined, third = undefined,
      fourth = undefined, fifth = undefined) {
      const listeners = channels.get(topic);
      if (!listeners) return;
      const count = arguments.length - 1;
      for (const listener of listeners) {
        switch (count) {
          case 0: listener(); break;
          case 1: listener(first); break;
          case 2: listener(first, second); break;
          case 3: listener(first, second, third); break;
          case 4: listener(first, second, third, fourth); break;
          case 5: listener(first, second, third, fourth, fifth); break;
        }
      }
    }
  );

  return { on, off, emit, clear: () => channels.clear() };
}

export const gameEvents = createEventBus();
